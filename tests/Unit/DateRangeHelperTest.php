<?php

namespace Tests\Unit;

use App\Support\Dates\DateRangeHelper;
use Illuminate\Http\Request;
use Tests\TestCase;

class DateRangeHelperTest extends TestCase
{
    public function test_resolves_specific_date_to_exact_day_bounds(): void
    {
        $bounds = DateRangeHelper::resolve('2026-01-15', null);

        $this->assertSame(['date_from' => '2026-01-15', 'date_to' => '2026-01-15'], $bounds);
    }

    public function test_resolves_month_to_first_and_last_day(): void
    {
        $bounds = DateRangeHelper::resolve(null, '2026-01');

        $this->assertSame(['date_from' => '2026-01-01', 'date_to' => '2026-01-31'], $bounds);
    }

    public function test_date_takes_precedence_over_month(): void
    {
        $bounds = DateRangeHelper::resolve('2026-01-15', '2026-02');

        $this->assertSame(['date_from' => '2026-01-15', 'date_to' => '2026-01-15'], $bounds);
    }

    public function test_returns_null_bounds_when_neither_given(): void
    {
        $bounds = DateRangeHelper::resolve(null, null);

        $this->assertSame(['date_from' => null, 'date_to' => null], $bounds);
    }

    public function test_resolves_february_leap_year(): void
    {
        $bounds = DateRangeHelper::resolve(null, '2024-02');

        $this->assertSame(['date_from' => '2024-02-01', 'date_to' => '2024-02-29'], $bounds);
    }

    public function test_resolves_february_non_leap_year(): void
    {
        $bounds = DateRangeHelper::resolve(null, '2023-02');

        $this->assertSame(['date_from' => '2023-02-01', 'date_to' => '2023-02-28'], $bounds);
    }

    // -- fromRequest(): date_from/date_to take precedence, then date/month
    public function test_from_request_prefers_range_over_date_and_month(): void
    {
        $bounds = DateRangeHelper::fromRequest(
            new Request([
                'date_from' => '2026-01-10',
                'date_to' => '2026-01-20',
                'date' => '2026-01-15',
                'month' => '2026-01',
            ]),
        );

        $this->assertSame(['date_from' => '2026-01-10', 'date_to' => '2026-01-20'], $bounds);
    }

    public function test_from_request_uses_partial_range_when_only_from_given(): void
    {
        $bounds = DateRangeHelper::fromRequest(
            new Request(['date_from' => '2026-01-10', 'date' => '2026-01-15']),
        );

        $this->assertSame(['date_from' => '2026-01-10', 'date_to' => null], $bounds);
    }

    public function test_from_request_falls_back_to_date_month(): void
    {
        $bounds = DateRangeHelper::fromRequest(
            new Request(['date' => '2026-01-15', 'month' => '2026-01']),
        );

        $this->assertSame(['date_from' => '2026-01-15', 'date_to' => '2026-01-15'], $bounds);
    }

    public function test_from_request_returns_null_bounds_without_filters(): void
    {
        $bounds = DateRangeHelper::fromRequest(new Request);

        $this->assertSame(['date_from' => null, 'date_to' => null], $bounds);
    }
}
