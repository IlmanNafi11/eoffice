<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\Dashboard\Services\DashboardScope;
use App\Domains\Dashboard\Services\WorkdayWindow;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Setting;
use App\Models\User;

/**
 * "Meja Kerja Hari Ini" — the personal half of the dashboard, available to
 * every role, plus the monitoring recap (`scope`) for viewers with a real
 * scope (Tim/Bidang/Organisasi).
 */
class TodaySection implements SectionBuilder
{
    public function key(): string
    {
        return 'today';
    }

    public function build(User $user, ?DashboardScope $scope = null): ?array
    {
        if (! $this->isWorkday()) {
            // A non-workday must not read as "everyone is absent": send the
            // neutral flag and no figures at all.
            return ['is_workday' => false, 'me' => null];
        }

        return [
            'is_workday' => true,
            'me' => [
                'attendance' => $this->attendance($user),
                'report' => $this->report($user),
            ],
        ] + $this->scope($user, $scope);
    }

    private function isWorkday(): bool
    {
        $allowedDays = Setting::get('wfh_allowed_days', WorkdayWindow::DEFAULT_ALLOWED_DAYS);

        // Empty setting = fail-closed: every day is a non-workday.
        return in_array(now()->dayOfWeekIso, (array) $allowedDays, true);
    }

    /**
     * Monitoring recap for viewers with a scope (staf has none — key absent,
     * design D1). Every count is over ACTIVE users only: the dashboard
     * denominator deliberately excludes inactive users, unlike the existing
     * monitoring list.
     *
     * @return array<string, mixed>
     */
    private function scope(User $user, ?DashboardScope $scope): array
    {

        if ($scope === null || $scope->isSelf()) {
            return [];
        }

        $users = DashboardScope::rosterQuery();
        $scope->applyTo($users);

        $teamReports = WfhTeamReport::query()->where('status', 'pending');
        $scope->applyToTeams($teamReports);

        return [
            'scope' => [
                'label' => $scope->label(),
                'users_total' => (clone $users)->count(),
                'absent' => (clone $users)->whereDoesntHave('wfhAttendances', fn ($q) => $q->where('date', now()->toDateString()))->count(),
                'no_report' => (clone $users)->whereDoesntHave('wfhReports', fn ($q) => $q->where('report_date', now()->toDateString()))->count(),
                // Only meaningful to someone allowed to act on team reports;
                // null otherwise (contract: value present iff permission held).
                'team_reports_pending' => $user->can('wfh.team_report.approve') ? $teamReports->count() : null,
            ],
        ];
    }

    /**
     * @return array{sessions_done: int, sessions_total: int, next_session: string|null}
     */
    private function attendance(User $user): array
    {
        $sessions = array_values((array) Setting::get('wfh_sessions', ['pagi', 'siang', 'sore']));

        $done = WfhAttendance::query()
            ->where('user_id', $user->id)
            ->whereDate('date', now()->toDateString())
            ->distinct()
            ->pluck('session')
            ->all();

        $next = null;
        foreach ($sessions as $session) {
            if (! in_array($session, $done, true)) {
                $next = $session;
                break;
            }
        }

        return [
            'sessions_done' => count(array_intersect($sessions, $done)),
            'sessions_total' => count($sessions),
            'next_session' => $next,
        ];
    }

    /**
     * @return array{status: string, report_id: int}|null
     */
    private function report(User $user): ?array
    {
        $report = WfhReport::query()
            ->where('user_id', $user->id)
            ->whereDate('report_date', now()->toDateString())
            ->latest('id')
            ->first(['id', 'status']);

        if ($report === null) {
            return null;
        }

        return [
            'status' => $report->status,
            'report_id' => $report->id,
        ];
    }
}
