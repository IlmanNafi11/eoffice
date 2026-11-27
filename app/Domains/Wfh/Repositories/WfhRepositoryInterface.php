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
     * Move live attendances owned by rejected reports for (user, date) onto
     * the given report. Photos are untouched.
     *
     * @return list<string> sessions moved, e.g. ['pagi', 'sore']
     */
    public function relinkRejectedAttendances(int $userId, string $date, int $toReportId): array;
}
