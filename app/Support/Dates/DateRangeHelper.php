<?php

namespace App\Support\Dates;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DateRangeHelper
{
    /**
     * Resolve request filters into [date_from, date_to] bounds.
     *
     * Precedence: date_from/date_to > date/month > none (returns null bounds
     * = no date filter). Shared by the personal and admin report controllers
     * so their range semantics cannot drift.
     *
     * @return array{date_from: ?string, date_to: ?string}
     */
    public static function fromRequest(Request $request): array
    {
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');

        if ($dateFrom !== null || $dateTo !== null) {
            return ['date_from' => $dateFrom, 'date_to' => $dateTo];
        }

        if ($request->hasAny(['date', 'month'])) {
            return self::resolve($request->input('date'), $request->input('month'));
        }

        return ['date_from' => null, 'date_to' => null];
    }

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
