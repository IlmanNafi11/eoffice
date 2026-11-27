<?php

namespace App\Domains\Wfh\Http\Resources;

use App\Domains\Wfh\Repositories\WfhRepositoryInterface;

/**
 * Team report header (TeamReportResource fields) plus the per-member content
 * used by the detail page. Members are resolved from the report's team and
 * date so the payload is always fresh on deep-link/refresh.
 */
class TeamReportDetailResource extends TeamReportResource
{
    public function toArray($request): array
    {
        $data = parent::toArray($request);

        $data['members'] = $this->report_date
            ? app(WfhRepositoryInterface::class)
                ->getTeamReportDetailData($this->team_id, $this->report_date->format('Y-m-d'))
            : [];

        return $data;
    }
}
