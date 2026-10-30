<?php

namespace Tests\Feature\Wfh;

use App\Domains\Shared\Contracts\RepositoryInterface;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\QueryException;

/**
 * Delegating repository double for DuplicateRecoveryTest: forwards everything
 * to the real repository except the two write methods that must raise the
 * SQLSTATE the production unique index raises.
 */
class UniqueViolatingWfhRepository implements RepositoryInterface, WfhRepositoryInterface
{
    /** @var array<string, string> method => SQLSTATE to raise ('*' = let it through) */
    private array $failures = [];

    private bool $hideDraftUntilViolation = false;

    private bool $violationRaised = false;

    public function __construct(private WfhRepositoryInterface $real) {}

    /**
     * Make $method throw a QueryException carrying $sqlState instead of
     * hitting the database.
     */
    public function failWith(string $method, string $sqlState, string $sql): static
    {
        $this->failures[$method] = $sqlState.'|'.$sql;

        return $this;
    }

    public function forceMissingAttendanceLookup(): static
    {
        $this->failures['findAttendanceByUserAndDate'] = 'null';

        return $this;
    }

    /**
     * Make the first get-or-create lookup blind, so the request really attempts
     * the INSERT this test is about (see findDraftForUserDate).
     */
    public function hideDraftUntilViolation(): static
    {
        $this->hideDraftUntilViolation = true;

        return $this;
    }

    public function findAttendanceByUserAndDate(int $userId, string $date, ?string $session = null): ?WfhAttendance
    {
        if (($this->failures['findAttendanceByUserAndDate'] ?? null) === 'null') {
            return null;
        }

        return $this->real->findAttendanceByUserAndDate($userId, $date, $session);
    }

    /**
     * Reproduce the real race: the controller's first get-or-create check sees
     * nothing (otherwise it short-circuits and never reaches the INSERT the
     * handler guards), and every later lookup sees the row the concurrent
     * request committed. That is the only ordering that exercises the 23505
     * recovery path; a double that always finds a row makes the test pass
     * vacuously.
     */
    public function findDraftForUserDate(int $userId, string $date): ?WfhReport
    {
        if ($this->hideDraftUntilViolation && ! $this->violationRaised) {
            return null;
        }

        return $this->real->findDraftForUserDate($userId, $date);
    }

    public function paginateReportsForUser(int $userId, int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        return $this->real->paginateReportsForUser($userId, $perPage, $filters);
    }

    public function paginateAllReports(int $perPage = 15, array $filters = []): LengthAwarePaginator
    {
        return $this->real->paginateAllReports($perPage, $filters);
    }

    public function loadReportWithRelations(WfhReport $report): WfhReport
    {
        return $this->real->loadReportWithRelations($report);
    }

    public function createReportWithRelations(array $reportData, array $activities, array $attendances = []): WfhReport
    {
        $this->raiseIfConfigured(__FUNCTION__);

        return $this->real->createReportWithRelations($reportData, $activities, $attendances);
    }

    public function updateReportMetadata(WfhReport $report, array $reportData): bool
    {
        return $this->real->updateReportMetadata($report, $reportData);
    }

    public function getTeamReportData(int $teamId, string $date): array
    {
        return $this->real->getTeamReportData($teamId, $date);
    }

    public function getUsersWithoutAttendance(string $date, ?int $teamId = null, ?int $fieldId = null): array
    {
        return $this->real->getUsersWithoutAttendance($date, $teamId, $fieldId);
    }

    public function getUsersWithoutReport(string $date, ?int $teamId = null, ?int $fieldId = null): array
    {
        return $this->real->getUsersWithoutReport($date, $teamId, $fieldId);
    }

    public function addActivityToReport(WfhReport $report, array $data): WfhReportActivity
    {
        return $this->real->addActivityToReport($report, $data);
    }

    public function updateActivity(WfhReportActivity $activity, array $data): WfhReportActivity
    {
        return $this->real->updateActivity($activity, $data);
    }

    public function deleteActivity(int $activityId): bool
    {
        return $this->real->deleteActivity($activityId);
    }

    public function reorderActivities(WfhReport $report, array $ids): void
    {
        $this->real->reorderActivities($report, $ids);
    }

    public function addAttendanceToReport(WfhReport $report, array $data): WfhAttendance
    {
        $this->raiseIfConfigured(__FUNCTION__);

        return $this->real->addAttendanceToReport($report, $data);
    }

    public function deleteAttendance(int $attendanceId): bool
    {
        return $this->real->deleteAttendance($attendanceId);
    }

    public function find(int $id, array $columns = ['*'], array $relations = []): ?Model
    {
        return $this->real->find($id, $columns, $relations);
    }

    public function create(array $data): Model
    {
        return $this->real->create($data);
    }

    public function update(int $id, array $data): bool
    {
        return $this->real->update($id, $data);
    }

    public function delete(int $id): bool
    {
        return $this->real->delete($id);
    }

    private function raiseIfConfigured(string $method): void
    {
        $configured = $this->failures[$method] ?? null;

        if ($configured === null) {
            return;
        }

        $this->violationRaised = true;

        [$sqlState, $sql] = explode('|', $configured, 2);

        /*
         * Real PDO surfaces the SQLSTATE as a *string* code (getCode() ===
         * '23505'), and the controllers compare with ===. Passing the SQLSTATE
         * to PDOException::__construct would coerce it to int and silently
         * defeat the handler, so set the inherited code property directly.
         */
        $previous = new \PDOException('duplicate key value violates unique constraint');
        $code = new \ReflectionProperty(\Exception::class, 'code');
        $code->setAccessible(true);
        $code->setValue($previous, $sqlState);
        $previous->errorInfo = [$sqlState, 7, 'duplicate key value violates unique constraint'];

        throw new QueryException(
            (string) config('database.default'),
            $sql,
            [],
            $previous,
        );
    }
}
