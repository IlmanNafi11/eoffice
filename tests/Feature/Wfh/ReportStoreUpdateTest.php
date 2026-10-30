<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportStoreUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    // === Get-or-create ===

    public function test_second_store_same_date_returns_existing_draft(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $first = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);
        $first->assertStatus(201);
        $firstId = $first->json('data.id');

        // Second call same (user, date) — should return same report
        $second = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);
        $second->assertStatus(200);
        $this->assertEquals($firstId, $second->json('data.id'));

        // Only one report in DB
        $this->assertDatabaseCount('wfh_reports', 1);
    }

    public function test_store_creates_new_when_no_existing_draft(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ])->assertStatus(201);

        $this->assertDatabaseCount('wfh_reports', 1);
    }

    /** M1: a client-supplied status must never skip the submit flow. */
    public function test_store_ignores_client_supplied_status(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-29',
            'status' => 'approved',
        ])->assertStatus(201);

        $this->assertSame('draft', WfhReport::sole()->status);
    }

    public function test_store_allows_draft_and_approved_same_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Create approved report
        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        // Creating a draft for same date should still work (get-or-create returns existing draft,
        // but here no draft exists — creates a new one)
        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ])->assertStatus(201);

        $this->assertDatabaseCount('wfh_reports', 2);
    }

    // === PUT metadata-only ===

    public function test_update_metadata_only_ignores_activities_attendances(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Create report with activities via POST
        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Task A', 'start_time' => '08:00', 'end_time' => '10:00'],
                ['activity' => 'Task B', 'start_time' => '13:00', 'end_time' => '15:00'],
            ],
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('pagi.jpg')],
            ],
        ]);
        $response->assertStatus(201);

        $reportId = $response->json('data.id');

        // PUT with different activities/attendances — should NOT replace existing ones
        $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Should be ignored'],
            ],
        ])->assertStatus(200);

        $report = WfhReport::withCount(['activities', 'attendances'])->find($reportId);
        $this->assertEquals(2, $report->activities_count, 'Activities should be unchanged');
        $this->assertEquals(1, $report->attendances_count, 'Attendances should be unchanged');
    }

    public function test_update_nonexistent_report_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->putJson('/api/wfh/reports/99999', [
            'report_date' => now()->toDateString(),
        ])->assertStatus(404);
    }

    public function test_update_does_not_allow_status_change_via_put(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
        ]);
        $reportId = $create->json('data.id');

        // Attempt to self-approve via PUT — status must be ignored.
        $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => now()->toDateString(),
            'status' => 'approved',
        ])->assertStatus(200);

        $this->assertSame('draft', WfhReport::find($reportId)->status);
    }
}
