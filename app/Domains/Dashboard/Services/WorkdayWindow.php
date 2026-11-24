<?php

namespace App\Domains\Dashboard\Services;

use App\Models\Setting;
use Illuminate\Support\Carbon;

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

    /**
     * Ascending `Y-m-d` dates of the last 14 workdays, ending today when
     * today is a workday (or the most recent workday before it otherwise).
     *
     * @return list<string>
     */
    public static function last(): array
    {
        $allowed = array_map('intval', (array) Setting::get('wfh_allowed_days', [1, 2, 3, 4, 5]));

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

    /** First/last date of the window, or null when there are no workdays. */
    public static function bounds(array $dates): ?array
    {
        if ($dates === []) {
            return null;
        }

        return [$dates[0], $dates[count($dates) - 1]];
    }

    /** Carbon parse helper keeps call sites readable. */
    public static function toDate(string $date): Carbon
    {
        return Carbon::parse($date);
    }
}
