<?php

namespace App\Domains\Wfh\Services\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * Shared approve/reject transition logic for WFH report state machines.
 *
 * The pending guard, the approve/reject field updates, and the
 * verification-token generation each live here exactly once; the concrete
 * state machines keep only the parts that differ (the supervisor-id extra on
 * team reports, and the report-specific submit/revise flows).
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

    private function ensureVerificationToken(Model $report): string
    {
        return $report->verification_token ?? bin2hex(random_bytes(32));
    }

    private function approveTransition(Model $report, User $actor, array $extra = []): Model
    {
        $this->assertPending($report, 'disetujui');

        // Workflow state is not fillable (SEC-07): write it explicitly.
        $report->forceFill(array_merge([
            'status' => 'approved',
            'supervisor_signed_at' => now(),
            'verification_token' => $this->ensureVerificationToken($report),
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
