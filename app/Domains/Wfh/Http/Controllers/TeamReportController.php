<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Services\TeamReportStateMachine;
use App\Models\Field;
use App\Models\Team;
use App\Support\Constants\Roles;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TeamReportController extends Controller
{
    use AuthorizesRequests;

    public function __construct(
        private TeamReportStateMachine $stateMachine,
    ) {}

    /**
     * Guard: actor must be in the same field as the team report.
     */
    private function ensureSameField(Request $request, WfhTeamReport $report): ?JsonResponse
    {
        $userFieldId = $request->user()->team?->field?->id;
        $reportFieldId = $report->team?->field_id;

        if (! $userFieldId || ! $reportFieldId || $userFieldId !== $reportFieldId) {
            return response()->json([
                'success' => false,
                'message' => 'Laporan tidak berada dalam bidang Anda.',
            ], 403);
        }

        return null;
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('wfh.team_report.view');

        $user = $request->user();
        $perPage = min($request->integer('per_page', 15), 100);

        // Admin sees all team reports
        if ($user->hasRole(Roles::ADMIN)) {
            $reports = WfhTeamReport::with(['team', 'creator', 'supervisor'])
                ->orderByDesc('report_date')
                ->paginate($perPage);

            return response()->json($reports);
        }

        $fieldId = $user->team?->field?->id;
        if (! $fieldId) {
            return response()->json([
                'success' => false,
                'message' => 'User tidak terhubung dengan bidang manapun.',
            ], 422);
        }

        $isFieldHead = Field::where('id', $fieldId)->where('head_id', $user->id)->exists();

        $reports = WfhTeamReport::with(['team', 'creator', 'supervisor'])
            ->whereHas('team', function ($q) use ($fieldId, $user, $isFieldHead) {
                $q->where('field_id', $fieldId);

                // Field head sees all teams in the field; others (KT, staf) see own team only
                if (! $isFieldHead) {
                    $q->where('id', $user->team_id);
                }
            })
            ->orderByDesc('report_date')
            ->paginate($perPage);

        return response()->json($reports);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('wfh.team_report.create');

        $user = $request->user();
        $fieldId = $user->team?->field?->id;

        $validated = $request->validate([
            'team_id' => ['required', 'exists:teams,id'],
            'report_date' => ['required', 'date'],
        ]);

        $team = Team::find($validated['team_id']);

        if (! $fieldId || $team->field_id !== $fieldId) {
            return response()->json(['message' => 'Tim tidak ditemukan dalam bidang Anda.'], 403);
        }

        $exists = WfhTeamReport::where('team_id', $validated['team_id'])
            ->where('report_date', $validated['report_date'])
            ->exists();

        if ($exists) {
            return response()->json(['message' => 'Laporan untuk tim dan tanggal ini sudah ada.'], 422);
        }

        $report = WfhTeamReport::create([
            'team_id' => $validated['team_id'],
            'report_date' => $validated['report_date'],
            'status' => 'pending',
            'created_by' => $user->id,
        ]);

        return response()->json(['data' => $report], 201);
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $this->authorize('wfh.team_report.approve');

        $report = WfhTeamReport::find($id);
        if (! $report) {
            return response()->json([
                'success' => false,
                'message' => 'Laporan tidak ditemukan.',
            ], 404);
        }

        $guard = $this->ensureSameField($request, $report);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->approve($report, $request->user());
        } catch (\DomainException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $report]);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $this->authorize('wfh.team_report.reject');

        $request->validate(['reason' => ['required', 'string']]);

        $report = WfhTeamReport::find($id);
        if (! $report) {
            return response()->json([
                'success' => false,
                'message' => 'Laporan tidak ditemukan.',
            ], 404);
        }

        $guard = $this->ensureSameField($request, $report);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->reject($report, $request->user(), $request->input('reason'));
        } catch (\DomainException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $report]);
    }
}
