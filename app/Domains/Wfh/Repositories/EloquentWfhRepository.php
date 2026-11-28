<?php

namespace App\Domains\Wfh\Repositories;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Exceptions\ApiException;
use App\Models\User;
use App\Repositories\EloquentRepository;
use App\Support\Constants\WfhReportStatus;
use App\Support\Media\PrivateMediaPath;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class EloquentWfhRepository extends EloquentRepository implements WfhRepositoryInterface
{
    /** Columns a report update may set; everything else is silently dropped. */
    private const METADATA_FIELDS = ['report_date'];

    public function __construct(WfhReport $model)
    {
        parent::__construct($model);
    }

    // === Attendance ===

    /**
     * Resolve the session evidence for a (user, date) against the user's
     * ACTIVE report for that day. Rows on rejected reports are archived
     * evidence and must not block a fresh correction draft; the day-level
     * rule (one evidence per session per day) is derived from the one
     * non-rejected report per date plus one row per (report, session).
     */
    public function findAttendanceByUserAndDate(int $userId, string $date, ?string $session = null): ?WfhAttendance
    {
        $query = WfhAttendance::query()
            ->where('user_id', $userId)
            ->where('date', $date)
            ->whereHas('report', fn ($q) => $q->whereIn('status', WfhReportStatus::ACTIVE));

        if ($session) {
            $query->where('session', $session);
        }

        return $query->first();
    }

    // === Reports ===

    public function paginateReportsForUser(int $userId, int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        $query = WfhReport::withCount('activities')
            ->with(['attendances'])
            ->where('user_id', $userId);

        $this->applyDateRangeFilter($query, $filters);

        return $query->orderBy('report_date', 'desc')->paginate($perPage);
    }

    public function paginateAllReports(int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        $query = WfhReport::withCount('activities')->with(['attendances', 'user.team', 'supervisor']);

        if (! empty($filters['status'])) {
            $query->where('status', $filters['status']);
        }

        $this->applyDateRangeFilter($query, $filters);

        if (! empty($filters['team_id'])) {
            $query->whereHas('user.team', function ($q) use ($filters) {
                $q->where('id', $filters['team_id']);
            });
        }

        if (! empty($filters['field_id'])) {
            $query->whereHas('user.team', function ($q) use ($filters) {
                $q->where('field_id', $filters['field_id']);
            });
        }

        return $query->orderBy('report_date', 'desc')->paginate($perPage);
    }

    private function applyDateRangeFilter($query, array $filters): void
    {
        if (! empty($filters['date_from'])) {
            $query->where('report_date', '>=', $filters['date_from']);
        }

        if (! empty($filters['date_to'])) {
            $query->where('report_date', '<=', $filters['date_to']);
        }
    }

    /**
     * Relations a report read needs; the same list `findReportWithRelations()`
     * used before route-model binding took over resolution. `user.team.field`
     * is included because the personal PDF export reads `$team?->field`
     * (WfhReportPdfData), which would otherwise be one lazy query per export.
     */
    private const REPORT_RELATIONS = ['activities.links', 'attendances', 'user.team.field', 'supervisor'];

    public function loadReportWithRelations(WfhReport $report): WfhReport
    {
        return $report->load(self::REPORT_RELATIONS);
    }

    public function getTeamReportData(int $teamId, string $date): array
    {
        return collect($this->teamMembersWithSelectedReport($teamId, $date))
            ->map(fn (array $pair) => [
                'name' => strtoupper($pair['member']->name),
                'nip' => $pair['member']->nip ?? '-',
                'links' => $pair['report']
                    ? $pair['report']->activities->flatMap->links->pluck('url')->filter()->values()->toArray()
                    : [],
                // Foto diambil dari laporan yang SAMA dengan tautan di atas:
                // query presensi terpisah akan membawa foto milik draf
                // anggota lain.
                'photos' => $pair['report']
                    ? $pair['report']->attendances
                        ->map(fn ($att) => ['session' => $att->session, 'photo_path' => $att->photo_path])
                        ->values()->all()
                    : [],
            ])
            ->toArray();
    }

    public function getTeamReportDetailData(int $teamId, string $date): array
    {
        return collect($this->teamMembersWithSelectedReport($teamId, $date))
            ->map(fn (array $pair) => [
                'user_id' => $pair['member']->id,
                'name' => $pair['member']->name,
                'nip' => $pair['member']->nip,
                'report_id' => $pair['report']?->id,
                'report_status' => $pair['report']?->status,
                'activities' => $pair['report']
                    ? $pair['report']->activities->map(fn ($activity) => [
                        'id' => $activity->id,
                        'start_time' => $activity->start_time?->format('H:i'),
                        'end_time' => $activity->end_time?->format('H:i'),
                        'activity' => $activity->activity,
                        'links' => $activity->links->pluck('url')->filter()->values()->all(),
                    ])->values()->all()
                    : [],
                'attendances' => $pair['report']
                    ? $pair['report']->attendances->map(fn ($attendance) => [
                        'id' => $attendance->id,
                        'session' => $attendance->session,
                        'photo_url' => PrivateMediaPath::attendanceUrl(
                            $pair['report']->id,
                            $attendance->id,
                            $attendance->photo_path,
                        ),
                    ])->values()->all()
                    : [],
            ])
            ->values()->all();
    }

    /**
     * Members of a team with the ONE personal report the PDF and the detail
     * page agree on (ship review #22: both surfaces must answer the same
     * question the same way — now enforced by construction, not copy-paste).
     *
     * Members come back name-ordered (deterministic between query plans);
     * drafts are author-private and never selected; a member with only a
     * rejected report keeps that row (surfaced as `rejected`); live reports
     * win over rejected ones, newest first (D3).
     *
     * @return array<int, array{member: User, report: WfhReport|null}>
     */
    private function teamMembersWithSelectedReport(int $teamId, string $date): array
    {
        $members = User::where('team_id', $teamId)->where('is_active', true)->orderBy('name')->get();

        $reports = WfhReport::with(['activities.links', 'attendances'])
            ->where('report_date', $date)
            ->whereHas('user', fn ($q) => $q->where('team_id', $teamId))
            ->get()
            ->groupBy('user_id')
            ->map(fn ($group) => $group
                ->sortByDesc(fn ($r) => [in_array($r->status, WfhReportStatus::LIVE, true) ? 1 : 0, $r->updated_at?->timestamp ?? 0])
                ->first(fn ($r) => $r->status !== WfhReportStatus::DRAFT));

        return $members
            ->map(fn (User $member) => [
                'member' => $member,
                'report' => $reports->get($member->id),
            ])
            ->all();
    }

    public function createReportWithRelations(array $reportData, array $activities, array $attendances = []): WfhReport
    {
        return DB::transaction(function () use ($reportData, $activities, $attendances) {
            $report = WfhReport::create($reportData);

            foreach ($attendances as $session => $data) {
                $this->addAttendanceToReport($report, [
                    'session' => $session,
                    'photo_path' => $data['photo_path'] ?? null,
                ]);
            }

            foreach ($activities as $index => $activity) {
                $activity['sort_order'] = $activity['sort_order'] ?? $index;
                $this->addActivityToReport($report, $activity);
            }

            return $report->fresh(['attendances', 'activities.links']);
        });
    }

    public function updateReportMetadata(WfhReport $report, array $reportData): bool
    {
        $safe = array_intersect_key($reportData, array_flip(self::METADATA_FIELDS));

        return $report->update($safe);
    }

    // === Per-row helpers ===

    public function addActivityToReport(WfhReport $report, array $data): WfhReportActivity
    {
        return DB::transaction(function () use ($report, $data) {
            $activity = $report->activities()->create([
                'start_time' => $data['start_time'] ?? null,
                'end_time' => $data['end_time'] ?? null,
                'activity' => $data['activity'],
                'sort_order' => $data['sort_order'] ?? (($report->activities()->max('sort_order') ?? -1) + 1),
            ]);

            if (! empty($data['links'])) {
                foreach ($data['links'] as $linkIndex => $link) {
                    $url = is_array($link) ? $link['url'] : $link;
                    $activity->links()->create([
                        'url' => $url,
                        'sort_order' => $linkIndex,
                    ]);
                }
            }

            return $activity->fresh('links');
        });
    }

    public function updateActivity(WfhReportActivity $activity, array $data): WfhReportActivity
    {
        return DB::transaction(function () use ($activity, $data) {
            $activity->update([
                'start_time' => $data['start_time'] ?? $activity->start_time,
                'end_time' => $data['end_time'] ?? $activity->end_time,
                'activity' => $data['activity'] ?? $activity->activity,
            ]);

            // Links id-diff
            if (array_key_exists('links', $data)) {
                $existingLinkIds = $activity->links()->pluck('id')->toArray();
                $incomingLinks = $data['links'] ?? [];

                $keepIds = [];
                foreach ($incomingLinks as $index => $link) {
                    $linkId = is_array($link) ? ($link['id'] ?? null) : null;
                    $url = is_array($link) ? $link['url'] : $link;

                    if ($linkId && in_array($linkId, $existingLinkIds)) {
                        $activity->links()->where('id', $linkId)->update([
                            'url' => $url,
                            'sort_order' => $index,
                        ]);
                        $keepIds[] = $linkId;
                    } else {
                        $newLink = $activity->links()->create([
                            'url' => $url,
                            'sort_order' => $index,
                        ]);
                        $keepIds[] = $newLink->id;
                    }
                }

                $deleteIds = array_diff($existingLinkIds, $keepIds);
                if ($deleteIds) {
                    $activity->links()->whereIn('id', $deleteIds)->delete();
                }
            }

            return $activity->fresh('links');
        });
    }

    public function deleteActivity(int $activityId): bool
    {
        $activity = WfhReportActivity::find($activityId);
        if (! $activity) {
            return false;
        }

        // ponytail: links cascade-deleted via FK on wfh_report_links.wfh_report_activity_id
        return (bool) $activity->delete();
    }

    public function reorderActivities(WfhReport $report, array $ids): void
    {
        // No-op tanpa query: validasi+pluck untuk daftar kosong mubazir
        // (ship review #4 — gerakkan early-return ke atas).
        if (empty($ids)) {
            return;
        }

        $reportActivityIds = $report->activities()->pluck('id')->toArray();

        // Reject duplicates up front: a repeated id produces duplicate WHEN
        // clauses (first wins) and silently drops the intended ordering.
        if (count($ids) !== count(array_unique($ids))) {
            throw new ApiException('Activity ids must be unique.', 422);
        }

        // Validate all ids belong to this report
        $invalid = array_diff($ids, $reportActivityIds);
        if (! empty($invalid)) {
            throw new ApiException('Some activity ids do not belong to this report.', 422);
        }

        // One statement instead of one UPDATE per id. Values come from the
        // validated $ids, so they are integers; the ids are inlined because a
        // CASE expression cannot be parameterised per-row portably.
        // Wrapped in a transaction so a concurrent reorder of the same report
        // cannot interleave (ship review #3).
        DB::transaction(function () use ($ids): void {
            $cases = [];
            foreach ($ids as $index => $id) {
                $cases[] = 'WHEN '.(int) $id.' THEN '.(int) $index;
            }

            WfhReportActivity::whereIn('id', $ids)
                ->update([
                    'sort_order' => DB::raw('CASE id '.implode(' ', $cases).' END'),
                ]);
        });
    }

    public function addAttendanceToReport(WfhReport $report, array $data): WfhAttendance
    {
        return WfhAttendance::create([
            'user_id' => $report->user_id,
            'date' => $report->report_date->format('Y-m-d'),
            'session' => $data['session'],
            'photo_path' => $data['photo_path'] ?? null,
            'check_in_at' => $data['check_in_at'] ?? now(),
            'report_id' => $report->id,
        ]);
    }

    public function deleteAttendance(int $attendanceId): bool
    {
        $attendance = WfhAttendance::find($attendanceId);
        if (! $attendance) {
            return false;
        }

        return (bool) $attendance->delete();
    }

    public function findDraftForUserDate(int $userId, string $date): ?WfhReport
    {
        return WfhReport::where('user_id', $userId)
            ->where('report_date', $date)
            ->where('status', 'draft')
            ->first();
    }

    /**
     * Copy, never move: a rejected report is archive and keeps every row it
     * owns. The correction draft receives NEW activities (with links) and NEW
     * attendance rows whose photo bytes are copied onto the private disk
     * under the draft's own path — sharing a path would let deleting one
     * report's evidence blank the other's. Business timestamps (start/end,
     * check_in_at) survive; created_at/updated_at are fresh.
     */
    public function copyRejectedDataToReport(int $userId, string $date, WfhReport $target): void
    {
        $source = WfhReport::query()
            ->where('user_id', $userId)
            ->where('report_date', $date)
            ->where('status', WfhReportStatus::REJECTED)
            ->with(['activities.links', 'attendances'])
            ->latest('id')
            ->first();

        if (! $source) {
            return;
        }

        // Prefill only when the create request omitted activities (B2): at
        // this point the draft owns activities iff the request supplied them,
        // so copying here never overwrites user edits.
        if ($target->activities()->doesntExist()) {
            foreach ($source->activities as $activity) {
                $copy = $target->activities()->create([
                    'start_time' => $activity->start_time,
                    'end_time' => $activity->end_time,
                    'activity' => $activity->activity,
                    'sort_order' => $activity->sort_order,
                ]);

                foreach ($activity->links as $link) {
                    $copy->links()->create([
                        'url' => $link->url,
                        'sort_order' => $link->sort_order,
                    ]);
                }
            }
        }

        // Sessions already owned by the draft (e.g. a retried store) are not
        // copied again; the (report_id, session) key would reject them.
        $taken = $target->attendances()->pluck('session')->all();

        foreach ($source->attendances as $attendance) {
            if (in_array($attendance->session, $taken, true)) {
                continue;
            }

            $target->attendances()->create([
                'user_id' => $userId,
                // Attendance ownership is the report now, so the row's date
                // follows the target's report_date. Legacy rows copied verbatim
                // would keep an upload-day date that no longer matches their
                // report, and (user_id, date) lookups would miss them.
                'date' => $target->report_date->format('Y-m-d'),
                'session' => $attendance->session,
                'photo_path' => $this->copyAttendancePhoto($attendance, $target),
                'check_in_at' => $attendance->check_in_at,
            ]);
        }
    }

    /**
     * Copy the source photo bytes onto the private disk under a path that
     * belongs to the target report. Legacy rows may still live on the public
     * disk (resolveAny); when no bytes exist anywhere the row keeps its
     * original path and the UI renders its placeholder.
     */
    private function copyAttendancePhoto(WfhAttendance $attendance, WfhReport $target): ?string
    {
        $sourceBytes = PrivateMediaPath::resolveAny($attendance->photo_path);

        if ($sourceBytes === '') {
            return $attendance->photo_path;
        }

        $path = sprintf(
            'attendances/%d/%s/%d-%s%s',
            $target->user_id,
            $target->report_date->format('Y-m-d'),
            $target->id,
            $attendance->session,
            pathinfo($attendance->photo_path, PATHINFO_EXTENSION) !== ''
                ? '.'.pathinfo($attendance->photo_path, PATHINFO_EXTENSION)
                : '',
        );

        Storage::disk('local')->put($path, file_get_contents($sourceBytes));

        return $path;
    }

    // === Monitoring ===

    public function getUsersWithoutAttendance(string $date, ?int $teamId = null, ?int $fieldId = null): array
    {
        return $this->monitoringUserQuery(function () use ($date) {
            return User::whereDoesntHave('wfhAttendances', fn ($q) => $q->where('date', $date));
        }, $teamId, $fieldId);
    }

    public function getUsersWithoutReport(string $date, ?int $teamId = null, ?int $fieldId = null): array
    {
        return $this->monitoringUserQuery(function () use ($date) {
            return User::whereDoesntHave('wfhReports', fn ($q) => $q->where('report_date', $date));
        }, $teamId, $fieldId);
    }

    /**
     * Shared builder for the monitoring lists. Selects only the safe public
     * columns (avoiding PII/timestamps leakage like email_verified_at,
     * signature_path, must_change_password, created_at, updated_at, deleted_at)
     * and eager-loads team:id,name so the response matches MonitoringUser.
     * ponytail: column allowlist is hand-maintained; add fields here when the
     * MonitoringUser spec gains them — do not broaden to User::all().
     */
    private function monitoringUserQuery(callable $scope, ?int $teamId, ?int $fieldId): array
    {
        $query = $scope();

        if ($teamId) {
            $query->where('team_id', $teamId);
        }

        if ($fieldId && ! $teamId) {
            $query->whereHas('team', fn ($q) => $q->where('field_id', $fieldId));
        }

        return $query
            ->select(['id', 'name', 'nip', 'email', 'rank', 'position', 'phone', 'is_active', 'team_id'])
            ->with('team:id,name')
            ->get()
            ->toArray();
    }
}
