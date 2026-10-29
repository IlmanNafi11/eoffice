<?php

namespace App\Domains\Wfh\Services;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Services\Concerns\TransitionsReportState;
use App\Models\User;

class TeamReportStateMachine
{
    use TransitionsReportState;

    public function approve(WfhTeamReport $report, User $actor): WfhTeamReport
    {
        /** @var WfhTeamReport $result */
        $result = $this->approveTransition($report, $actor, [
            'supervisor_id' => $actor->id,
        ]);

        return $result;
    }

    public function reject(WfhTeamReport $report, User $actor, string $reason): WfhTeamReport
    {
        /** @var WfhTeamReport $result */
        $result = $this->rejectTransition($report, $reason);

        return $result;
    }
}
