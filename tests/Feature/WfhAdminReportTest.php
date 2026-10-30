<?php

namespace Tests\Feature;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WfhAdminReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    // === Admin bidang-scoped report listing ===

    public function test_admin_sees_only_reports_from_own_field(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $admin = User::factory()->create(['team_id' => $teamA->id]);
        $admin->assignRole('admin');

        $stafA = User::factory()->create(['team_id' => $teamA->id]);
        $stafB = User::factory()->create(['team_id' => $teamB->id]);

        WfhReport::factory()->create([
            'user_id' => $stafA->id,
            'status' => 'approved',
        ]);
        WfhReport::factory()->create([
            'user_id' => $stafB->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/reports')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_admin_can_filter_reports_by_team(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team1 = Team::create(['field_id' => $field->id, 'name' => 'Tim 1']);
        $team2 = Team::create(['field_id' => $field->id, 'name' => 'Tim 2']);

        $admin = User::factory()->create(['team_id' => $team1->id]);
        $admin->assignRole('admin');

        $staf1 = User::factory()->create(['team_id' => $team1->id]);
        $staf2 = User::factory()->create(['team_id' => $team2->id]);

        WfhReport::factory()->create(['user_id' => $staf1->id]);
        WfhReport::factory()->create(['user_id' => $staf2->id]);

        Sanctum::actingAs($admin);

        $this->getJson("/api/admin/wfh/reports?team_id={$team1->id}")
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1);
    }

    public function test_admin_without_field_gets_422(): void
    {
        $admin = User::factory()->create(); // no team_id
        $admin->assignRole('admin');

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/reports')
            ->assertStatus(422);
    }

    // === Admin date/month filter ===

    public function test_admin_filters_by_date(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $staf = User::factory()->create(['team_id' => $team->id]);

        $matching = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'report_date' => '2026-07-15',
        ]);
        WfhReport::factory()->create([
            'user_id' => $staf->id,
            'report_date' => '2026-07-16',
        ]);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/reports?date=2026-07-15')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.id', $matching->id);
    }

    public function test_admin_filters_by_month(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $staf = User::factory()->create(['team_id' => $team->id]);

        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-01-10']);
        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-01-31']);
        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-02-01']);

        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/wfh/reports?month=2026-01')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);
    }

    public function test_admin_date_from_takes_precedence_over_date(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $staf = User::factory()->create(['team_id' => $team->id]);

        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-07-10']);
        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-07-20']);
        WfhReport::factory()->create(['user_id' => $staf->id, 'report_date' => '2026-07-25']);

        Sanctum::actingAs($admin);

        // date_from=2026-07-20 overrides date=2026-07-10 — range wins
        $this->getJson('/api/admin/wfh/reports?date_from=2026-07-20&date=2026-07-10')
            ->assertStatus(200)
            ->assertJsonPath('meta.total', 2);
    }

    // === WFH PDF export from pending ===

    public function test_pdf_can_be_exported_from_pending_status(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'pending',
        ]);

        $this->setUserSignature($staf);

        Sanctum::actingAs($staf);

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_wfh_pdf_rejected_when_signature_unset(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($staf);

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_pdf_cannot_be_exported_from_draft_status(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'draft',
        ]);

        Sanctum::actingAs($staf);

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")
            ->assertStatus(422);
    }

    public function test_admin_report_list_excludes_verification_token(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');

        WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'approved',
            'verification_token' => 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/admin/wfh/reports')->assertStatus(200);

        $response->assertJsonPath('meta.total', 1);
        $response->assertJsonMissingPath('data.0.verification_token');
    }

    public function test_admin_report_list_does_not_lazy_load_actor_team_field(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');

        WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($admin);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->getJson('/api/admin/wfh/reports')->assertStatus(200);

        $lazyFieldReads = 0;
        foreach (DB::getQueryLog() as $entry) {
            $query = strtolower(ltrim($entry['query']));
            if (str_starts_with($query, 'select * from "fields"') && str_contains($query, 'limit 1')) {
                $lazyFieldReads++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(
            0,
            $lazyFieldReads,
            'Admin report list must eager-load the actor team.field, not lazy-load it.'
        );
    }
}
