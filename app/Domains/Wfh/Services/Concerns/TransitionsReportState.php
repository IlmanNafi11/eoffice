<?php

namespace App\Domains\Wfh\Services\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared approve/reject transition logic for WFH report state machines.
 *
 * The pending guard and the approve/reject field updates each live here
 * exactly once; the concrete state machines keep only the parts that differ
 * (the supervisor-id extra on team reports, and the report-specific submit
 * flow).
 */
trait TransitionsReportState
{
    private function assertPending(Model $report, string $action): void
    {
        if ($report->status !== 'pending') {
            throw new \DomainException(
                "Hanya laporan dengan status pending yang dapat {$action}."
            );
        }
    }

    private function approveTransition(Model $report, User $actor, array $extra = []): Model
    {
        $this->assertPending($report, 'disetujui');

        // Workflow state is not fillable (SEC-07): write it explicitly.
        $report->forceFill(array_merge([
            'status' => 'approved',
            'supervisor_signed_at' => now(),
        ], $extra))->save();

        return $report->fresh();
    }

    private function rejectTransition(Model $report, string $reason): Model
    {
        $this->assertPending($report, 'ditolak');

        $report->forceFill([
            'status' => 'rejected',
            'reject_reason' => $reason,
        ])->save();

        return $report->fresh();
    }
}
