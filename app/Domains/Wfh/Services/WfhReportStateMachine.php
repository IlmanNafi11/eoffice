<?php

namespace App\Domains\Wfh\Services;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Services\Concerns\TransitionsReportState;
use App\Models\User;

class WfhReportStateMachine
{
    use TransitionsReportState;

    public function submit(WfhReport $report, User $maker): WfhReport
    {
        if ($report->status !== 'draft') {
            throw new \DomainException('Hanya laporan dengan status draft yang dapat disubmit.');
        }

        // Content guard: at least one activity OR one attendance required
        $report->loadCount(['activities', 'attendances']);
        if ($report->activities_count === 0 && $report->attendances_count === 0) {
            throw new \DomainException('Setidaknya satu kegiatan atau satu absensi harus diisi sebelum submit.');
        }

        $report->update([
            'status' => 'pending',
            'maker_signed_at' => now(),
        ]);

        $headId = $maker->team?->field?->head_id;
        if ($headId && $headId !== $maker->id) {
            $report->update(['supervisor_id' => $headId]);
        }

        return $report->fresh();
    }

    public function approve(WfhReport $report, User $supervisor): WfhReport
    {
        /** @var WfhReport $result */
        $result = $this->approveTransition($report, $supervisor);

        return $result;
    }

    public function reject(WfhReport $report, User $supervisor, string $reason): WfhReport
    {
        /** @var WfhReport $result */
        $result = $this->rejectTransition($report, $reason);

        return $result;
    }

    public function revise(WfhReport $report): WfhReport
    {
        if ($report->status !== 'rejected') {
            throw new \DomainException('Hanya laporan yang ditolak yang dapat direvisi.');
        }

        $report->update([
            'status' => 'draft',
            'maker_signed_at' => null,
            'supervisor_id' => null,
            'reject_reason' => null,
        ]);

        return $report->fresh();
    }

    public function canEdit(WfhReport $report): bool
    {
        return in_array($report->status, ['draft', 'rejected']);
    }

    public function isImmutable(WfhReport $report): bool
    {
        return $report->status === 'approved';
    }
}
