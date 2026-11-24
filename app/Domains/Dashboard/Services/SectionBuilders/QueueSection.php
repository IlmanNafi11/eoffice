<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Dashboard\Services\DashboardScope;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Database\Eloquent\Builder;

/**
 * "Antrean" — the work this requester may actually decide, one key per
 * permission they hold (design D1/D2). A key is absent, never zero, when the
 * permission is missing, so the UI can tell "nothing to do" from "not yours".
 *
 * Change visibility follows `EloquentChangeManagementRepository::
 * applyVisibilityScope`: admin = all, kepala_* = packages initiated by members
 * of the actor's own team (a team-less kepala_* sees 0 — denied by default).
 * Implementation review is keyed on `ChangeInitiation::status`, the parent
 * column the submit/review transitions write; the child row mirrors it.
 *
 * Scope identity note (ship review #20): the WFH sections scope by the team
 * the actor LEADS (`DashboardScope`, `ledTeams()`), while these change counts
 * deliberately mirror the membership `team_id` used by
 * `applyVisibilityScope` — the authoritative change-visibility rule. For the
 * usual case (leader of their own team) the two agree; when they differ the
 * change queue intentionally follows the change domain's own convention.
 */
class QueueSection implements SectionBuilder
{
    public function key(): string
    {
        return 'queue';
    }

    public function build(User $user, ?DashboardScope $scope): ?array
    {
        $section = [];

        if ($user->can('change.initiation.approve')) {
            $section['change_initiations_pending'] = [
                'count' => $this->countPackages($user, 'pending'),
            ];
        }

        if ($user->can('change.implementation.review')) {
            $query = ChangeImplementation::query()->where('change_implementations.status', 'submitted');

            if (! $user->hasRole(Roles::ADMIN)) {
                $user->team_id === null
                    ? $query->whereRaw('false')
                    : $query->whereHas(
                        'initiation.initiator',
                        fn (Builder $q) => $q->where('users.team_id', $user->team_id),
                    );
            }

            $section['implementations_review'] = ['count' => $query->count()];
        }

        if ($user->can('wfh.team_report.approve')) {
            $section['team_reports_pending'] = [
                'count' => $this->countTeamReports($scope),
            ];
        }

        return $section === [] ? null : $section;
    }

    /** Packages awaiting a decision, narrowed to the actor's team. */
    private function countPackages(User $user, string $status): int
    {
        $query = ChangeInitiation::query()->where('change_initiations.status', $status);

        if (! $user->hasRole(Roles::ADMIN)) {
            $user->team_id === null
                ? $query->whereRaw('false')
                : $query->whereHas('initiator', fn (Builder $q) => $q->where('users.team_id', $user->team_id));
        }

        return $query->count();
    }

    /**
     * Team reports are scoped exactly like the recap's `team_reports_pending`
     * so the two figures can never disagree.
     */
    private function countTeamReports(?DashboardScope $scope): int
    {
        if ($scope === null) {
            return 0;
        }

        $query = WfhTeamReport::query()->where('wfh_team_reports.status', 'pending');
        $scope->applyToTeams($query);

        return $query->count();
    }
}
