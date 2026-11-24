<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\Dashboard\Services\DashboardScope;
use App\Domains\Dashboard\Services\WorkdayWindow;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;

/**
 * "Tren 14 hari kerja" — compliance of the requester's scope over the last 14
 * workdays from `wfh_allowed_days` (never a hardcoded Mon–Fri week).
 *
 * Metric (SPEC-locked, not a builder choice): a user is compliant on a day
 * when their report for that day is `approved` OR `pending`; `draft`,
 * `rejected` and "no report" are not compliant. The denominator is always the
 * full active roster — it never shrinks to flatter the ratio.
 *
 * One aggregate query for all 14 days (group by date, distinct users), plus
 * two reads over `users` (roster count + ids): no per-day loop, no N+1.
 */
class TrendSection implements SectionBuilder
{
    public function key(): string
    {
        return 'trend';
    }

    public function build(User $user): ?array
    {
        $dates = WorkdayWindow::last();

        $users = User::query()->where('is_active', true);
        $scope = DashboardScope::for($user);

        if ($scope !== null) {
            $scope->applyTo($users);
        }

        $total = (clone $users)->count();
        $compliant = $this->compliantByDate($users->pluck('id')->all(), $dates);

        $days = [];
        $summaryCompliant = 0;

        foreach ($dates as $date) {
            $count = $compliant[$date] ?? 0;
            $summaryCompliant += $count;
            $days[] = ['date' => $date, 'compliant' => $count, 'total' => $total];
        }

        return [
            'days' => $days,
            'summary' => [
                'compliant' => $summaryCompliant,
                'total' => $total * count($dates),
            ],
        ];
    }

    /**
     * Distinct compliant users per workday, in a single grouped query scoped
     * to the roster.
     *
     * @param  list<int>  $userIds
     * @param  list<string>  $dates
     * @return array<string, int>
     */
    private function compliantByDate(array $userIds, array $dates): array
    {
        $bounds = WorkdayWindow::bounds($dates);

        if ($bounds === null || $userIds === []) {
            return [];
        }

        $rows = WfhReport::query()
            ->whereIn('user_id', $userIds)
            ->whereIn('status', ['approved', 'pending'])
            ->whereBetween('report_date', $bounds)
            ->selectRaw('report_date, count(distinct user_id) as compliant')
            ->groupBy('report_date')
            ->get();

        $byDate = [];

        foreach ($rows as $row) {
            $byDate[$row->report_date->toDateString()] = (int) $row->compliant;
        }

        return $byDate;
    }
}
