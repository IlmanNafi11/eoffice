<?php

namespace App\Domains\Wfh\Http\Resources;

/**
 * Team report detail: the base team-report fields plus the per-member live
 * content used by the detail page.
 *
 * Members are RESOLVED BY THE CALLER (the controller) and passed in — the
 * resource is a plain serializer, not a service locator. Resolving inside
 * `toArray()` would hide two queries behind a serialization call and pull the
 * repository in via `app()` (ship review: architecture).
 */
class TeamReportDetailResource extends TeamReportResource
{
    /**
     * @param  array<int, array<string, mixed>>  $members  Output of
     *                                                     `WfhRepositoryInterface::getTeamReportDetailData` for this
     *                                                     report's team and date.
     */
    public function __construct(
        $resource,
        private array $members = [],
    ) {
        parent::__construct($resource);
    }

    public function toArray($request): array
    {
        return [
            ...parent::toArray($request),
            'members' => $this->members,
        ];
    }
}
