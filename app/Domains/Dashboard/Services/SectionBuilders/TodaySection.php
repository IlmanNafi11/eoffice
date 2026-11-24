<?php

namespace App\Domains\Dashboard\Services\SectionBuilders;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\Setting;
use App\Models\User;

/**
 * "Meja Kerja Hari Ini" — the personal half of the dashboard, available to
 * every role. The monitoring recap (`scope`) is added in T2.
 */
class TodaySection implements SectionBuilder
{
    public function key(): string
    {
        return 'today';
    }

    public function build(User $user): ?array
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
        ];
    }

    private function isWorkday(): bool
    {
        $allowedDays = Setting::get('wfh_allowed_days', [1, 2, 3, 4, 5]);

        // Empty setting = fail-closed: every day is a non-workday.
        return in_array(now()->dayOfWeekIso, (array) $allowedDays, true);
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
