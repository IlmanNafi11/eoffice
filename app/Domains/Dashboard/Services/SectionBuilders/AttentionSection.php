<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\Dashboard\Services\DashboardScope;
use App\Domains\Dashboard\Services\WorkdayWindow;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;

/**
 * "Perlu Perhatian" — up to 5 scoped users whose compliance over the last 14
 * workdays is below `THRESHOLD_PERCENT`, lowest ratio first.
 *
 * Gated on the `wfh.monitoring.view` permission only (user decision
 * 2026-11-24): kepala_tim holds it too and sees their own team's list, exactly
 * like the existing monitoring board — role names are never consulted here.
 * The denominator per user is the same 14-workday window the trend section
 * uses (shared `WorkdayWindow`), and inactive users are excluded before any
 * ratio is computed.
 *
 * A null scope means the requester covers nobody (deny-by-default): the
 * section is omitted instead of listing the whole organization.
 */
class AttentionSection implements SectionBuilder
{
    public const THRESHOLD_PERCENT = 60;

    public const MAX_USERS = 5;

    public function key(): string
    {
        return 'attention';
    }

    public function build(User $user, ?DashboardScope $scope): ?array
    {
        if (! $user->can('wfh.monitoring.view')) {
            return null; // seksi tidak untuk peminta (design D1).
        }

        if ($scope === null) {
            return null; // no scope ⇒ no data, never the full roster.
        }

        $dates = WorkdayWindow::last();
        $total = count($dates);

        $users = DashboardScope::rosterQuery();
        $scope->applyTo($users);
        $users = $users->with('team:id,name')->get(['id', 'name', 'team_id']);

        if ($total === 0 || $users->isEmpty()) {
            return ['users' => [], 'threshold_note' => $this->note()];
        }

        $compliant = $this->compliantByUser(
            $users->pluck('id')->all(),
            $dates,
        );

        $below = $users
            ->map(fn (User $u) => [
                'user_id' => $u->id,
                'name' => $u->name,
                'team' => $u->team?->name,
                'compliant' => $compliant[$u->id] ?? 0,
                'total' => $total,
                'ratio' => ($compliant[$u->id] ?? 0) / $total * 100,
            ])
            ->filter(fn (array $row) => $row['ratio'] < self::THRESHOLD_PERCENT)
            ->sortBy([['ratio', 'asc'], ['user_id', 'asc']])
            ->slice(0, self::MAX_USERS)
            ->map(fn (array $row) => [
                'user_id' => $row['user_id'],
                'name' => $row['name'],
                'team' => $row['team'],
                'compliant' => $row['compliant'],
                'total' => $row['total'],
            ])
            ->values()
            ->all();

        return ['users' => $below, 'threshold_note' => $this->note()];
    }

    private function note(): string
    {
        return sprintf(
            'kepatuhan < %d%% dalam %d hari kerja terakhir',
            self::THRESHOLD_PERCENT,
            WorkdayWindow::DAYS,
        );
    }

    /**
     * Distinct compliant days per user over the window, in one grouped query
     * over the EXACT workday dates — a report filed on a non-workday inside
     * the calendar span must never count as a compliant day, or a user's
     * ratio could exceed 100% and hide their noncompliance.
     *
     * @param  list<int>  $userIds
     * @param  list<string>  $dates
     * @return array<int, int>
     */
    private function compliantByUser(array $userIds, array $dates): array
    {
        if ($userIds === [] || $dates === []) {
            return [];
        }

        $rows = WfhReport::query()
            ->whereIn('user_id', $userIds)
            ->whereIn('status', ['approved', 'pending'])
            ->whereIn('report_date', $dates)
            ->selectRaw('user_id, count(distinct report_date) as compliant')
            ->groupBy('user_id')
            ->get();

        $byUser = [];

        foreach ($rows as $row) {
            $byUser[$row->user_id] = (int) $row->compliant;
        }

        return $byUser;
    }
}
