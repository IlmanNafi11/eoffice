<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Http\Resources\TeamReportResource;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Services\TeamReportStateMachine;
use App\Models\Field;
use App\Models\Team;
use App\Support\Constants\Roles;
use App\Support\Http\ApiResponse;
use App\Support\Http\Concerns\ClampsPerPage;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

class TeamReportController extends Controller
{
    use AuthorizesRequests;
    use ClampsPerPage;
    use EnsuresSameField;

    public function __construct(
        private TeamReportStateMachine $stateMachine,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('wfh.team_report.view');

        $user = $request->user();
        $perPage = self::perPage($request);

        // Admin sees all team reports
        if ($user->hasRole(Roles::ADMIN)) {
            $reports = WfhTeamReport::with(['team', 'creator', 'supervisor'])
                ->orderByDesc('report_date')
                ->paginate($perPage);

            return ApiResponse::paginated($reports, TeamReportResource::class);
        }

        $user->loadMissing('team.field');
        $fieldId = $user->team?->field?->id;
        if (! $fieldId) {
            return ApiResponse::fail('User tidak terhubung dengan bidang manapun.');
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

        return ApiResponse::paginated($reports, TeamReportResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('wfh.team_report.create');

        $user = $request->user();
        $user->loadMissing('team.field');
        $fieldId = $user->team?->field?->id;

        $validated = $request->validate([
            'team_id' => ['required', 'exists:teams,id'],
            'report_date' => ['required', 'date'],
        ]);

        $team = Team::find($validated['team_id']);

        if (! $fieldId || $team->field_id !== $fieldId) {
            return ApiResponse::fail('Tim tidak ditemukan dalam bidang Anda.', 403);
        }

        $exists = WfhTeamReport::where('team_id', $validated['team_id'])
            ->where('report_date', $validated['report_date'])
            ->exists();

        if ($exists) {
            return ApiResponse::fail('Laporan untuk tim dan tanggal ini sudah ada.');
        }

        $report = WfhTeamReport::create([
            'team_id' => $validated['team_id'],
            'report_date' => $validated['report_date'],
            'status' => 'pending',
            'created_by' => $user->id,
        ]);

        return ApiResponse::created(
            new TeamReportResource($report->load(['team', 'creator', 'supervisor'])),
            'Laporan tim berhasil dibuat.',
        );
    }

    public function approve(Request $request, WfhTeamReport $report): JsonResponse
    {
        $this->authorize('wfh.team_report.approve');

        $report->loadMissing('team');

        // Segregation of duties: the maker cannot approve their own report.
        if ($report->created_by === $request->user()->id) {
            return ApiResponse::fail('Pembuat laporan tidak dapat menyetujui laporannya sendiri.', 403);
        }

        $guard = $this->ensureSameField($request, $report->team?->field_id);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->approve($report, $request->user());
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new TeamReportResource($report->load(['team', 'creator', 'supervisor'])),
            'Laporan tim berhasil disetujui.',
        );
    }

    public function reject(Request $request, WfhTeamReport $report): JsonResponse
    {
        $this->authorize('wfh.team_report.reject');

        $request->validate(['reason' => ['required', 'string']]);

        $report->loadMissing('team');

        // Segregation of duties: the maker cannot reject their own report
        // either — otherwise they could erase a report they disagree with.
        if ($report->created_by === $request->user()->id) {
            return ApiResponse::fail('Pembuat laporan tidak dapat menolak laporannya sendiri.', 403);
        }

        $guard = $this->ensureSameField($request, $report->team?->field_id);
        if ($guard) {
            return $guard;
        }

        try {
            $report = $this->stateMachine->reject($report, $request->user(), $request->input('reason'));
        } catch (\DomainException $e) {
            return ApiResponse::fail($e->getMessage());
        }

        return ApiResponse::ok(
            new TeamReportResource($report->load(['team', 'creator', 'supervisor'])),
            'Laporan tim ditolak.',
        );
    }
}
