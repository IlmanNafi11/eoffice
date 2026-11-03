<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Admin report list uses the same DateRangeHelper::fromRequest wiring as the
 * personal list, but it changed in this range with no admin-side test. Close
 * that gap: full range, to-only upper bound, and invalid date_from 422.
 */
class AdminDateRangeWiringTest extends TestCase
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

    private function context(): object
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        // Report owner inside the admin's field, else the field scope
        // excludes it before any date filter applies.
        $owner = User::factory()->create(['team_id' => $team->id]);

        return (object) ['owner' => $owner];
    }

    public function test_admin_index_filters_by_full_range(): void
    {
        $owner = $this->context()->owner;

        WfhReport::factory()->create([
            'user_id' => $owner->id,
            'report_date' => '2026-07-10',
        ]);
        WfhReport::factory()->create([
            'user_id' => $owner->id,
            'report_date' => '2026-07-20',
        ]);

        $this->getJson('/api/admin/wfh/reports?date_from=2026-07-10&date_to=2026-07-15')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_admin_index_filters_by_to_only(): void
    {
        $owner = $this->context()->owner;

        WfhReport::factory()->create([
            'user_id' => $owner->id,
            'report_date' => '2026-07-10',
        ]);
        WfhReport::factory()->create([
            'user_id' => $owner->id,
            'report_date' => '2026-07-20',
        ]);

        $this->getJson('/api/admin/wfh/reports?date_to=2026-07-10')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_admin_index_invalid_date_from_returns_422(): void
    {
        $this->context();

        $this->getJson('/api/admin/wfh/reports?date_from=not-a-date')
            ->assertStatus(422);
    }
}
