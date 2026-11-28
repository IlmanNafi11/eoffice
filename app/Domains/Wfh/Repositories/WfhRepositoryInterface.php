<?php

namespace App\Domains\Wfh\Repositories;

use App\Domains\Shared\Contracts\RepositoryInterface;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

interface WfhRepositoryInterface extends RepositoryInterface
{
    // Attendance

    /**
     * Session evidence for (user, date) scoped to the user's ACTIVE report
     * (draft/pending/approved). Rows on rejected reports are archived and do
     * not count; the daily one-evidence-per-session rule is derived from the
     * one-active-report-per-date constraint plus one row per (report, session).
     */
    public function findAttendanceByUserAndDate(int $userId, string $date, ?string $session = null): ?WfhAttendance;

    // Reports
    public function paginateReportsForUser(int $userId, int $perPage = 15, array $filters = []): LengthAwarePaginator;

    public function paginateAllReports(int $perPage = 15, array $filters = []): LengthAwarePaginator;

    public function loadReportWithRelations(WfhReport $report): WfhReport;

    public function createReportWithRelations(array $reportData, array $activities, array $attendances = []): WfhReport;

    public function updateReportMetadata(WfhReport $report, array $reportData): bool;

    public function getTeamReportData(int $teamId, string $date): array;

    /**
     * Per-member content for the team report detail page: the selected
     * personal report, its activities and its attendances.
     *
     * @return list<array<string, mixed>>
     */
    public function getTeamReportDetailData(int $teamId, string $date): array;

    public function getUsersWithoutAttendance(string $date, ?int $teamId = null, ?int $fieldId = null): array;

    public function getUsersWithoutReport(string $date, ?int $teamId = null, ?int $fieldId = null): array;

    // Per-row helpers
    public function addActivityToReport(WfhReport $report, array $data): WfhReportActivity;

    public function updateActivity(WfhReportActivity $activity, array $data): WfhReportActivity;

    public function deleteActivity(int $activityId): bool;

    public function reorderActivities(WfhReport $report, array $ids): void;

    public function addAttendanceToReport(WfhReport $report, array $data): WfhAttendance;

    public function deleteAttendance(int $attendanceId): bool;

    public function findDraftForUserDate(int $userId, string $date): ?WfhReport;

    /**
     * Copy, never move: a rejected report is archive. Copy the latest
     * rejected report's activities (with links) and attendances (with their
     * photo bytes) onto the given correction draft. Nothing on the source
     * rows changes; a session already owned by the target is not copied.
     */
    public function copyRejectedDataToReport(int $userId, string $date, WfhReport $target): void;
}
