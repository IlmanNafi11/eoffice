<?php

namespace App\Domains\Dashboard\Services;

use App\Models\Setting;

/**
 * The single definition of "the last 14 workdays" used by both the trend
 * section and the attention list, so their denominators can never disagree.
 *
 * Workdays come from the `wfh_allowed_days` setting (ISO-8601 day numbers,
 * Mon = 1). An empty setting is fail-closed — every day is a non-workday and
 * the window is empty, matching `TodaySection::isWorkday()`.
 */
final class WorkdayWindow
{
    public const DAYS = 14;

    /** Default workdays when the setting is absent: Monday–Friday. */
    public const DEFAULT_ALLOWED_DAYS = [1, 2, 3, 4, 5];

    /**
     * Ascending `Y-m-d` dates of the last 14 workdays, ending today when
     * today is a workday (or the most recent workday before it otherwise).
     *
     * @return list<string>
     */
    public static function last(): array
    {
        $allowed = array_map('intval', (array) Setting::get('wfh_allowed_days', self::DEFAULT_ALLOWED_DAYS));

        if ($allowed === []) {
            return [];
        }

        $dates = [];
        $cursor = now()->copy()->startOfDay();

        // Hard bound so a misconfigured (or empty) setting can never loop
        // forever: 14 workdays cannot span more than 14 weeks.
        $limit = self::DAYS * 7 + 7;

        for ($i = 0; $i < $limit && count($dates) < self::DAYS; $i++) {
            if (in_array($cursor->dayOfWeekIso, $allowed, true)) {
                $dates[] = $cursor->toDateString();
            }

            $cursor->subDay();
        }

        return array_reverse($dates);
    }

    /**
     * Whether today is a workday per the `wfh_allowed_days` setting — the
     * single workday rule `TodaySection` renders from (same source as
     * `last()`, so the recap and the window can never disagree). Empty
     * setting = fail-closed: every day is a non-workday.
     */
    public static function todayIsWorkday(): bool
    {
        $allowed = array_map('intval', (array) Setting::get('wfh_allowed_days', self::DEFAULT_ALLOWED_DAYS));

        return in_array(now()->dayOfWeekIso, $allowed, true);
    }
}
