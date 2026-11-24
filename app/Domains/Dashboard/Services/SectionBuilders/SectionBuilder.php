<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\Dashboard\Services\DashboardScope;
use App\Models\User;

interface SectionBuilder
{
    /** Section key inside the dashboard `data` payload. */
    public function key(): string;

    /**
     * Null = this section is not for the requester (key omitted).
     *
     * `$scope` is resolved once per request by `DashboardService` and handed
     * to every builder, so no two sections can disagree about whose records
     * they cover. A null scope means "this requester covers nobody"
     * (deny-by-default for a supervisor without a team/field) — builders MUST
     * treat it as such, never as "no filter / everyone".
     */
    public function build(User $user, ?DashboardScope $scope): ?array;
}
