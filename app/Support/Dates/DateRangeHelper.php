<?php

namespace App\Support\Dates;

use Illuminate\Support\Carbon;

class DateRangeHelper
{
    /**
     * Resolve date/month inputs into [date_from, date_to] bounds.
     *
     * Precedence: date > month > none (returns null bounds = no date filter).
     *
     * @return array{date_from: ?string, date_to: ?string}
     */
    public static function resolve(?string $date, ?string $month): array
    {
        if ($date) {
            return ['date_from' => $date, 'date_to' => $date];
        }

        if ($month) {
            $start = Carbon::createFromFormat('!Y-m', $month)->startOfMonth();

            return [
                'date_from' => $start->format('Y-m-d'),
                'date_to' => $start->copy()->endOfMonth()->format('Y-m-d'),
            ];
        }

        return ['date_from' => null, 'date_to' => null];
    }
}
