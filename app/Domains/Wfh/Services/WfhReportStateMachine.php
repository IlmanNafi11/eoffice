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

        $report->forceFill([
            'status' => 'pending',
            'maker_signed_at' => now(),
        ])->save();

        $headId = $maker->team?->field?->head_id;
        if ($headId && $headId !== $maker->id) {
            $report->forceFill(['supervisor_id' => $headId])->save();
        }

        return $report->fresh();
    }

    /**
     * Approve a personal WFH report.
     *
     * NOTE: personal reports deliberately allow self-approval (a field head
     * approving their own report is accepted — see SegregationOfDutiesTest
     * "self-approve guard removed per Issue F"). Change packages and team
     * reports do NOT: ChangePackageDecision and TeamReportController both
     * answer 403 for a self-approval. The asymmetry is intentional; do not
     * "unify" it without revisiting Issue F (ship review A1).
     */
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

    public function canEdit(WfhReport $report): bool
    {
        return $report->status === 'draft';
    }

    public function isImmutable(WfhReport $report): bool
    {
        return in_array($report->status, ['approved', 'rejected'], true);
    }
}
