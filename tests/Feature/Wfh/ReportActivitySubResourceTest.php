<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportActivitySubResourceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    private function createDraftReport(User $user, string $date = '2026-07-28'): WfhReport
    {
        return WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => $date,
        ]);
    }

    // === CREATE ===

    public function test_create_activity_on_draft_report(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);

        $response = $this->postJson("/api/wfh/reports/{$report->id}/activities", [
            'activity' => 'Mengikuti pelatihan diklat Kominfo',
            'start_time' => '08:00',
            'end_time' => '10:00',
            'links' => [
                ['url' => 'https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12'],
            ],
        ]);

        $response->assertStatus(201);
        $response->assertJsonStructure([
            'success',
            'message',
            'data' => ['id', 'activity', 'start_time', 'end_time', 'sort_order', 'links'],
        ]);
        $response->assertJson([
            'success' => true,
            'message' => 'Kegiatan berhasil ditambahkan.',
            'data' => [
                'activity' => 'Mengikuti pelatihan diklat Kominfo',
                'start_time' => '08:00',
                'end_time' => '10:00',
            ],
        ]);
        $this->assertDatabaseHas('wfh_report_activities', [
            'wfh_report_id' => $report->id,
            'activity' => 'Mengikuti pelatihan diklat Kominfo',
        ]);
    }

    public function test_create_activity_on_approved_report_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson("/api/wfh/reports/{$report->id}/activities", [
            'activity' => 'Test',
        ]);

        $response->assertStatus(422);
    }

    public function test_create_activity_on_others_report_returns_403(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $other = User::factory()->create();
        $report = $this->createDraftReport($other);

        $response = $this->postJson("/api/wfh/reports/{$report->id}/activities", [
            'activity' => 'Test',
        ]);

        $response->assertStatus(403);
    }

    public function test_create_activity_on_nonexistent_report_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports/99999/activities', [
            'activity' => 'Test',
        ]);

        $response->assertStatus(404);
    }

    // === UPDATE ===

    public function test_update_activity_on_draft_report(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $activity = $report->activities()->create([
            'activity' => 'Old activity',
            'start_time' => '08:00',
            'end_time' => '10:00',
            'sort_order' => 1,
        ]);

        $response = $this->putJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}", [
            'activity' => 'Updated activity',
            'start_time' => '09:00',
            'end_time' => '11:00',
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'data' => [
                'id' => $activity->id,
                'activity' => 'Updated activity',
                'start_time' => '09:00',
                'end_time' => '11:00',
            ],
        ]);
    }

    public function test_update_activity_with_link_id_diff(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $activity = $report->activities()->create([
            'activity' => 'Test',
            'sort_order' => 1,
        ]);
        $link = $activity->links()->create([
            'url' => 'https://old-link.example.com',
            'sort_order' => 0,
        ]);

        $response = $this->putJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}", [
            'activity' => 'Test',
            'links' => [
                ['id' => $link->id, 'url' => 'https://updated-link.example.com'],
                ['url' => 'https://new-link.example.com'],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('wfh_report_links', [
            'id' => $link->id,
            'url' => 'https://updated-link.example.com',
        ]);
        $this->assertDatabaseHas('wfh_report_links', [
            'wfh_report_activity_id' => $activity->id,
            'url' => 'https://new-link.example.com',
        ]);
    }

    public function test_update_activity_on_approved_report_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);
        $activity = $report->activities()->create([
            'activity' => 'Test',
            'sort_order' => 1,
        ]);

        $response = $this->putJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}", [
            'activity' => 'Updated',
        ]);

        $response->assertStatus(422);
    }

    public function test_update_nonexistent_activity_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);

        $response = $this->putJson("/api/wfh/reports/{$report->id}/activities/99999", [
            'activity' => 'Test',
        ]);

        $response->assertStatus(404);
    }

    // === DELETE ===

    public function test_delete_activity_on_draft_report(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $activity = $report->activities()->create([
            'activity' => 'To delete',
            'sort_order' => 1,
        ]);
        $activity->links()->create([
            'url' => 'https://example.com',
            'sort_order' => 0,
        ]);

        $response = $this->deleteJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('wfh_report_activities', ['id' => $activity->id]);
        // Links cascade-deleted via FK
        $this->assertDatabaseMissing('wfh_report_links', ['wfh_report_activity_id' => $activity->id]);
    }

    public function test_delete_activity_cross_report_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $otherReport = $this->createDraftReport($user, '2026-07-27');
        $activity = $otherReport->activities()->create([
            'activity' => 'Belongs to other report',
            'sort_order' => 1,
        ]);

        // activity belongs to $otherReport, not $report
        $response = $this->deleteJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}");

        $response->assertStatus(404);
    }

    // === REORDER ===

    public function test_reorder_activities(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $a1 = $report->activities()->create(['activity' => 'A', 'sort_order' => 0]);
        $a2 = $report->activities()->create(['activity' => 'B', 'sort_order' => 1]);
        $a3 = $report->activities()->create(['activity' => 'C', 'sort_order' => 2]);

        $response = $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => [$a3->id, $a1->id, $a2->id],
        ]);

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
        ]);

        $this->assertDatabaseHas('wfh_report_activities', ['id' => $a3->id, 'sort_order' => 0]);
        $this->assertDatabaseHas('wfh_report_activities', ['id' => $a1->id, 'sort_order' => 1]);
        $this->assertDatabaseHas('wfh_report_activities', ['id' => $a2->id, 'sort_order' => 2]);
    }

    public function test_reorder_with_duplicate_ids_returns_422(): void
    {
        // A repeated id produces duplicate CASE WHEN clauses (first wins) and
        // silently drops the intended ordering (ship review #3).
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $a1 = $report->activities()->create(['activity' => 'A', 'sort_order' => 0]);
        $a2 = $report->activities()->create(['activity' => 'B', 'sort_order' => 1]);

        $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => [$a2->id, $a1->id, $a2->id],
        ])->assertStatus(422);

        $this->assertDatabaseHas('wfh_report_activities', ['id' => $a1->id, 'sort_order' => 0]);
        $this->assertDatabaseHas('wfh_report_activities', ['id' => $a2->id, 'sort_order' => 1]);
    }

    public function test_reorder_with_invalid_ids_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $a1 = $report->activities()->create(['activity' => 'A', 'sort_order' => 0]);

        $response = $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => [$a1->id, 99999],
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Some activity ids do not belong to this report.');
    }

    public function test_reorder_on_approved_report_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);
        $activity = $report->activities()->create(['activity' => 'A', 'sort_order' => 0]);

        $response = $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => [$activity->id],
        ]);

        $response->assertStatus(422);
    }

    public function test_reorder_with_non_array_ids_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);

        $response = $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => 'not-an-array',
        ]);

        $response->assertStatus(422);
    }

    public function test_reorder_with_missing_ids_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);

        $response = $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", []);

        $response->assertStatus(422);
    }

    public function test_reorder_activities_issues_a_single_update(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $a1 = $report->activities()->create(['activity' => 'A', 'sort_order' => 0]);
        $a2 = $report->activities()->create(['activity' => 'B', 'sort_order' => 1]);
        $a3 = $report->activities()->create(['activity' => 'C', 'sort_order' => 2]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->patchJson("/api/wfh/reports/{$report->id}/activities/reorder", [
            'ids' => [$a3->id, $a1->id, $a2->id],
        ])->assertStatus(200);

        $updates = 0;
        foreach (DB::getQueryLog() as $entry) {
            if (str_starts_with(strtolower(ltrim($entry['query'])), 'update')) {
                $updates++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(1, $updates, 'Reorder must issue exactly one UPDATE.');
    }
}
