<?php

namespace App\Domains\Wfh\Http\Controllers;

use App\Domains\Wfh\Http\Controllers\Concerns\EnsuresSameField;
use App\Domains\Wfh\Http\Resources\TeamReportDetailResource;
use App\Domains\Wfh\Http\Resources\TeamReportResource;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\TeamReportScope;
use App\Domains\Wfh\Services\TeamReportStateMachine;
use App\Models\Team;
use App\Support\Constants\WfhReportStatus;
use App\Support\Http\ApiResponse;
use App\Support\Http\Concerns\ClampsPerPage;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;

class TeamReportController extends Controller
{
    use AuthorizesRequests;
    use ClampsPerPage;
    use EnsuresSameField;

    public function __construct(
        private TeamReportStateMachine $stateMachine,
        private TeamReportScope $teamReportScope,
        private WfhRepositoryInterface $wfhRepository,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('wfh.team_report.view');

        $request->validate([
            // Enum shared with the personal-report board via WfhReportStatus —
            // one vocabulary, no drift between the two filters.
            'status' => ['nullable', Rule::in(WfhReportStatus::ALL)],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            // No `exists` rule: it runs BEFORE role scoping and turned
            // 422-vs-200 into a cross-field existence oracle for non-admins
            // (ship review #22). An unknown id now yields an empty page, the
            // same answer every role gets for a team outside its scope.
            'team_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();
        $perPage = self::perPage($request);

        // Field-less actor: 422 before any query (TeamReportScope is the one
        // place this rule lives; show() answers identically).
        $noField = $this->teamReportScope->noFieldDenial($user);
        if ($noField) {
            return $noField;
        }

        // Filters narrow within the role scope below; they never widen it.
        $filters = $request->only(['status', 'date_from', 'date_to', 'team_id']);
        $applyFilters = function ($q) use ($filters) {
            $q->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
                ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '>=', $v))
                ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '<=', $v))
                ->when($filters['team_id'] ?? null, fn ($q, $v) => $q->where('team_id', $v));
        };

        $reports = $this->teamReportScope
            ->applyTo(WfhTeamReport::with(['team', 'creator', 'supervisor']), $user)
            ->where($applyFilters)
            ->orderByDesc('report_date')
            ->paginate($perPage);

        return ApiResponse::paginated($reports, TeamReportResource::class);
    }

    /**
     * Detail of one team report + per-member live content.
     *
     * Dual permission: `wfh.team_report.view` gates the route, but the payload
     * embeds monitoring-grade content (draft personal reports, attendance
     * photos), so `wfh.monitoring.view` is required too. The seeder grants the
     * pair together; requiring both here keeps the endpoint safe if that
     * coupling is ever loosened in RolePermissionSeeder.
     */
    public function show(Request $request, WfhTeamReport $report): JsonResponse
    {
        $this->authorize('wfh.team_report.view');
        $this->authorize('wfh.monitoring.view');

        $user = $request->user();

        // Same scope as index() — one rule, one implementation (TeamReportScope).
        $denial = $this->teamReportScope->denialFor($user, $report);
        if ($denial) {
            return $denial;
        }

        // Members are resolved here, not inside the resource, so the resource
        // stays a plain serializer (no service location, no hidden queries).
        $members = $this->wfhRepository->getTeamReportDetailData(
            $report->team_id,
            $report->report_date->format('Y-m-d'),
        );

        return ApiResponse::ok(
            new TeamReportDetailResource(
                $report->loadMissing(['team', 'creator', 'supervisor']),
                $members,
            ),
        );
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

        // status is server-owned (SEC-07): forceFill, not mass assignment.
        try {
            $report = new WfhTeamReport([
                'team_id' => $validated['team_id'],
                'report_date' => $validated['report_date'],
                'created_by' => $user->id,
            ]);
            $report->forceFill(['status' => 'pending'])->save();
        } catch (QueryException $e) {
            // The exists() check above is a read-then-write race: two concurrent
            // requests both see nothing and both insert. The unique index on
            // (team_id, report_date) is the real guard, so recover here rather
            // than turning the loser into a 500.
            if ($e->getCode() === '23505') {
                return ApiResponse::fail('Laporan untuk tim dan tanggal ini sudah ada.');
            }

            throw $e;
        }

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
