<?php

namespace App\Domains\Wfh\Repositories;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Exceptions\ApiException;
use App\Models\User;
use App\Repositories\EloquentRepository;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class EloquentWfhRepository extends EloquentRepository implements WfhRepositoryInterface
{
    /** Columns a report update may set; everything else is silently dropped. */
    private const METADATA_FIELDS = ['report_date'];

    public function __construct(WfhReport $model)
    {
        parent::__construct($model);
    }

    // === Attendance ===

    public function findAttendanceByUserAndDate(int $userId, string $date, ?string $session = null): ?WfhAttendance
    {
        $query = WfhAttendance::where('user_id', $userId)
            ->where('date', $date);

        if ($session) {
            $query->where('session', $session);
        }

        return $query->first();
    }

    // === Reports ===

    public function paginateReportsForUser(int $userId, int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        $query = WfhReport::with(['activities.links', 'attendances'])
            ->where('user_id', $userId);

        $this->applyDateRangeFilter($query, $filters);

        return $query->orderBy('report_date', 'desc')->paginate($perPage);
    }

    public function paginateAllReports(int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        $query = WfhReport::with(['activities.links', 'attendances', 'user.team', 'supervisor']);

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
     * used before route-model binding took over resolution.
     */
    private const REPORT_RELATIONS = ['activities.links', 'attendances', 'user.team', 'supervisor'];

    public function loadReportWithRelations(WfhReport $report): WfhReport
    {
        return $report->load(self::REPORT_RELATIONS);
    }

    public function getTeamReportData(int $teamId, string $date): array
    {
        $members = User::where('team_id', $teamId)->where('is_active', true)->get();

        $reports = WfhReport::with(['activities.links', 'attendances'])
            ->where('report_date', $date)
            ->whereHas('user', fn ($q) => $q->where('team_id', $teamId))
            ->get()
            ->keyBy('user_id');

        $attendances = WfhAttendance::where('date', $date)
            ->whereHas('user', fn ($q) => $q->where('team_id', $teamId))
            ->get()
            ->groupBy('user_id');

        return $members->map(function ($member) use ($reports, $attendances) {
            $report = $reports->get($member->id);

            $links = $report
                ? $report->activities->flatMap->links->pluck('url')->filter()->values()
                : collect();

            $photos = [];
            if ($memberAttendances = $attendances->get($member->id)) {
                foreach ($memberAttendances as $att) {
                    $photos[] = [
                        'session' => $att->session,
                        'photo_path' => $att->photo_path,
                    ];
                }
            }

            return [
                'name' => strtoupper($member->name),
                'nip' => $member->nip ?? '-',
                'links' => $links->toArray(),
                'photos' => $photos,
            ];
        })->toArray();
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
        $reportActivityIds = $report->activities()->pluck('id')->toArray();

        // Validate all ids belong to this report
        $invalid = array_diff($ids, $reportActivityIds);
        if (! empty($invalid)) {
            throw new ApiException('Some activity ids do not belong to this report.', 422);
        }

        foreach ($ids as $index => $id) {
            WfhReportActivity::where('id', $id)->update(['sort_order' => $index]);
        }
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
            ->whereIn('status', ['draft', 'rejected'])
            ->first();
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
