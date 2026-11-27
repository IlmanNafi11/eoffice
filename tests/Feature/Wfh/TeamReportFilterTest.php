<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamReportFilterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    // === Filter narrows within scope ===

    public function test_status_filter_narrows_list(): void
    {
        $admin = $this->adminWithTeam();
        $this->createReport($admin->team, 'pending', '2026-11-01');
        $this->createReport($admin->team, 'approved', '2026-11-02');
        $this->createReport($admin->team, 'rejected', '2026-11-03');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/wfh/team-reports?status=pending')
            ->assertStatus(200);

        $statuses = collect($response->json('data'))->pluck('status')->unique();
        $this->assertSame(['pending'], $statuses->all());
    }

    public function test_date_range_filter_is_inclusive_of_both_bounds(): void
    {
        $admin = $this->adminWithTeam();
        $this->createReport($admin->team, 'pending', '2026-11-01');
        $this->createReport($admin->team, 'pending', '2026-11-15');
        $this->createReport($admin->team, 'pending', '2026-11-30');
        $this->createReport($admin->team, 'pending', '2026-12-01');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/wfh/team-reports?date_from=2026-11-01&date_to=2026-11-30')
            ->assertStatus(200);

        $dates = collect($response->json('data'))->pluck('report_date')->sort()->values();
        $this->assertSame(['2026-11-01', '2026-11-15', '2026-11-30'], $dates->all());
    }

    /** Rentang terbalik (from > to) tidak 422/500: hasil kosong, perilaku
     *  whereDate>=from AND whereDate<=to yang alami. Dipin agar tidak drift. */
    public function test_inverted_date_range_returns_empty_list(): void
    {
        $admin = $this->adminWithTeam();
        $this->createReport($admin->team, 'pending', '2026-11-15');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/wfh/team-reports?date_from=2026-11-30&date_to=2026-11-01')
            ->assertStatus(200);

        $this->assertSame([], $response->json('data'));
    }

    public function test_team_id_filter_narrows_list(): void
    {
        $admin = $this->adminWithTeam();
        $field = $admin->team->field;
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $this->createReport($admin->team, 'pending');
        $this->createReport($teamB, 'pending');
        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/admin/wfh/team-reports?team_id={$teamB->id}")
            ->assertStatus(200);

        $teamIds = collect($response->json('data'))->pluck('team_id')->unique();
        $this->assertSame([$teamB->id], $teamIds->all());
    }

    public function test_combined_filters_work(): void
    {
        $admin = $this->adminWithTeam();
        $field = $admin->team->field;
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $this->createReport($admin->team, 'pending', '2026-11-10');
        $this->createReport($admin->team, 'approved', '2026-11-11');
        $this->createReport($teamB, 'pending', '2026-11-10');
        $this->createReport($admin->team, 'pending', '2026-12-01');
        Sanctum::actingAs($admin);

        $response = $this->getJson(
            "/api/admin/wfh/team-reports?status=pending&team_id={$admin->team->id}&date_from=2026-11-01&date_to=2026-11-30",
        )->assertStatus(200);

        $this->assertCount(1, $response->json('data'));
        $this->assertSame($admin->team->id, $response->json('data.0.team_id'));
        $this->assertSame('pending', $response->json('data.0.status'));
    }

    // === Validation: bad input is 422, not 500 ===

    public function test_unknown_status_returns_422(): void
    {
        $admin = $this->adminWithTeam();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/team-reports?status=bogus')
            ->assertStatus(422);
    }

    public function test_non_numeric_team_id_returns_422(): void
    {
        $admin = $this->adminWithTeam();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/team-reports?team_id=abc')
            ->assertStatus(422);
    }

    public function test_nonexistent_team_id_returns_422(): void
    {
        $admin = $this->adminWithTeam();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/team-reports?team_id=999999')
            ->assertStatus(422);
    }

    public function test_invalid_date_returns_422(): void
    {
        $admin = $this->adminWithTeam();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/team-reports?date_from=not-a-date')
            ->assertStatus(422);
    }

    // === Scope is never loosened by filters ===

    public function test_kepala_tim_filtering_other_team_returns_empty(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $kt = User::factory()->create(['team_id' => $teamA->id]);
        $kt->assignRole('kepala_tim');
        $teamA->update(['leader_id' => $kt->id]);

        $this->createReport($teamA, 'pending');
        $this->createReport($teamB, 'pending');
        Sanctum::actingAs($kt);

        $response = $this->getJson("/api/admin/wfh/team-reports?team_id={$teamB->id}")
            ->assertStatus(200);

        $this->assertSame([], $response->json('data'));
    }

    public function test_kepala_bidang_cross_field_team_filter_returns_empty(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $kb = User::factory()->create(['team_id' => $teamA->id]);
        $kb->assignRole('kepala_bidang');
        $fieldA->update(['head_id' => $kb->id]);

        $this->createReport($teamA, 'pending');
        $this->createReport($teamB, 'pending');
        Sanctum::actingAs($kb);

        $response = $this->getJson("/api/admin/wfh/team-reports?team_id={$teamB->id}")
            ->assertStatus(200);

        $this->assertSame([], $response->json('data'));
    }

    public function test_admin_cross_field_team_filter_returns_data(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $admin = User::factory()->create(['team_id' => $teamA->id]);
        $admin->assignRole('admin');

        $this->createReport($teamB, 'pending');
        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/admin/wfh/team-reports?team_id={$teamB->id}")
            ->assertStatus(200);

        $this->assertCount(1, $response->json('data'));
    }

    // === No filter: behavior identical to before ===

    public function test_no_filter_keeps_existing_scope(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $kt = User::factory()->create(['team_id' => $teamA->id]);
        $kt->assignRole('kepala_tim');
        $teamA->update(['leader_id' => $kt->id]);

        $this->createReport($teamA, 'pending');
        $this->createReport($teamB, 'pending');
        Sanctum::actingAs($kt);

        $response = $this->getJson('/api/admin/wfh/team-reports')
            ->assertStatus(200);

        $teamIds = collect($response->json('data'))->pluck('team_id')->unique();
        $this->assertSame([$teamA->id], $teamIds->all());
    }

    // === Helpers ===

    private function adminWithTeam(): User
    {
        $field = Field::create(['name' => 'Bidang Admin']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $admin->setRelation('team', $team->load('field'));

        return $admin;
    }

    private function createReport(Team $team, string $status, ?string $date = null): WfhTeamReport
    {
        // created_by hanya butuh user apa pun — jangan beri role admin pada
        // actor uji yang tidak memerlukannya (ship review).
        $creator = User::factory()->create(['team_id' => $team->id]);

        return WfhTeamReport::factory()->status($status)->create([
            'team_id' => $team->id,
            'report_date' => $date ?? now()->toDateString(),
            'created_by' => $creator->id,
        ]);
    }
}
