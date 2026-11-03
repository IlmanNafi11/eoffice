<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportDateFilterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Carbon::setTestNow('2026-08-10');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_index_filters_by_specific_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $matching = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-15',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-16',
        ]);

        $this->getJson('/api/wfh/reports?date=2026-07-15')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $matching->id);
    }

    public function test_index_filters_by_month(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-01-10',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-01-31',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-02-01',
        ]);

        $this->getJson('/api/wfh/reports?month=2026-01')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);
    }

    public function test_index_defaults_to_all_when_no_filter(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-08-10',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-08-09',
        ]);

        $this->getJson('/api/wfh/reports')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);
    }

    public function test_date_takes_precedence_over_month(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $target = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-15',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-20',
        ]);

        $this->getJson('/api/wfh/reports?date=2026-07-15&month=2026-07')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $target->id);
    }

    public function test_invalid_date_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->getJson('/api/wfh/reports?date=not-a-date')
            ->assertStatus(422);
    }

    public function test_invalid_month_format_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->getJson('/api/wfh/reports?month=2026/01')
            ->assertStatus(422);
    }

    public function test_index_filters_by_date_range(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $insideFrom = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-10',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-20',
        ]);
        $insideTo = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-15',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-09',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-21',
        ]);

        $this->getJson('/api/wfh/reports?date_from=2026-07-10&date_to=2026-07-15')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);

        $ids = $this->getJson('/api/wfh/reports?date_from=2026-07-10&date_to=2026-07-15')
            ->assertStatus(200)
            ->json('data.*.id');

        // Repository orders by report_date desc: 07-15 first, then 07-10.
        $this->assertSame([$insideTo->id, $insideFrom->id], $ids);
    }

    public function test_date_range_takes_precedence_over_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-15',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-20',
        ]);

        // `date` alone matches only 2026-07-20; the range must win and return both.
        $this->getJson('/api/wfh/reports?date_from=2026-07-15&date_to=2026-07-20&date=2026-07-20')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);
    }

    public function test_invalid_date_from_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->getJson('/api/wfh/reports?date_from=not-a-date')
            ->assertStatus(422);
    }

    public function test_partial_range_from_only_still_filters(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-01',
        ]);
        WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-15',
        ]);

        $response = $this->getJson('/api/wfh/reports?date_from=2026-07-10');

        $response->assertStatus(200)->assertJsonPath('meta.total', 1);
        $this->assertSame('2026-07-15', $response->json('data.0.report_date'));
    }
}
