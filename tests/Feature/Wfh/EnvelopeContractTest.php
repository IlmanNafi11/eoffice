<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Envelope module (Task 4): WFH controllers must emit the single ApiResponse
 * contract — `success` on every response, exactly four pagination meta keys,
 * per_page clamped to 1..100, and 204 DELETEs without a body.
 */
class EnvelopeContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        // Monday, within the default wfh_allowed_days (1..5).
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── session-config ──────────────────────────────────────────

    public function test_session_config_emits_the_full_envelope(): void
    {
        $this->staf();

        $response = $this->getJson('/api/wfh/session-config')->assertOk();

        $body = $response->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertNull($body['message']);
        $this->assertNull($body['meta']);
        $this->assertSame(['sessions', 'allowed_days'], array_keys($body['data']));
    }

    // ─── report list pagination ──────────────────────────────────

    public function test_report_index_meta_has_exactly_four_keys_including_per_page(): void
    {
        $user = $this->staf();
        WfhReport::factory()->create(['user_id' => $user->id]);

        $body = $this->getJson('/api/wfh/reports')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
        $this->assertSame(15, $body['meta']['per_page']);
    }

    public function test_report_index_per_page_is_clamped_to_100(): void
    {
        $this->staf();

        $this->getJson('/api/wfh/reports?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_report_index_per_page_zero_is_clamped_to_1(): void
    {
        $this->staf();

        $this->getJson('/api/wfh/reports?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    public function test_admin_report_index_meta_has_exactly_four_keys(): void
    {
        [$admin, $team] = $this->adminInField();

        WfhReport::factory()->create([
            'user_id' => User::factory()->create(['team_id' => $team->id])->id,
        ]);

        $body = $this->getJson('/api/admin/wfh/reports')->assertOk()->json();

        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
    }

    public function test_admin_report_index_per_page_zero_is_clamped_to_1(): void
    {
        $this->adminInField();

        $this->getJson('/api/admin/wfh/reports?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    public function test_admin_report_index_per_page_is_clamped_to_100(): void
    {
        $this->adminInField();

        $this->getJson('/api/admin/wfh/reports?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    // ─── team reports ────────────────────────────────────────────

    public function test_team_report_index_admin_path_emits_paginated_envelope(): void
    {
        [$admin, $team] = $this->adminInField();
        $this->createTeamReport($team);
        Sanctum::actingAs($admin);

        $body = $this->getJson('/api/admin/wfh/team-reports')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
        $this->assertCount(1, $body['data']);
        $keys = $this->sortedKeys($body['data'][0]);
        $this->assertContains('id', $keys);
        $this->assertContains('team', $keys);
        $this->assertContains('creator', $keys);
        $this->assertNotContains('verification_token', $keys);
        $this->assertNotContains('signature_path', $keys);
    }

    public function test_team_report_index_field_path_emits_paginated_envelope(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $this->createTeamReport($team);
        Sanctum::actingAs($kb);

        $body = $this->getJson('/api/admin/wfh/team-reports')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
        $this->assertCount(1, $body['data']);
    }

    public function test_team_report_index_per_page_zero_is_clamped_to_1(): void
    {
        $this->adminInField();

        $this->getJson('/api/admin/wfh/team-reports?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    public function test_team_report_index_per_page_is_clamped_to_100(): void
    {
        $this->adminInField();

        $this->getJson('/api/admin/wfh/team-reports?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_team_report_store_returns_created_envelope(): void
    {
        [$admin, $team] = $this->adminInField();
        Sanctum::actingAs($admin);

        $body = $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
        ])->assertStatus(201)
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame('Laporan tim berhasil dibuat.', $body['message']);
        $this->assertSame('pending', $body['data']['status']);
    }

    public function test_team_report_approve_returns_envelope_with_message(): void
    {
        [$admin, $team] = $this->adminInField();
        $report = $this->createTeamReport($team);
        Sanctum::actingAs($admin);

        $body = $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertOk()
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame('Laporan tim berhasil disetujui.', $body['message']);
        $this->assertSame('approved', $body['data']['status']);
    }

    // ─── 204 deletes ─────────────────────────────────────────────

    public function test_report_destroy_returns_204_without_body(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create(['user_id' => $user->id, 'status' => 'draft']);

        $response = $this->deleteJson("/api/wfh/reports/{$report->id}")->assertNoContent();

        $this->assertNull($response->headers->get('Content-Type'));
        $this->assertSoftDeleted('wfh_reports', ['id' => $report->id]);
    }

    public function test_activity_destroy_returns_204_without_body(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create(['user_id' => $user->id, 'status' => 'draft']);
        $activity = $report->activities()->create(['activity' => 'Task', 'sort_order' => 0]);

        $this->deleteJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('wfh_report_activities', ['id' => $activity->id]);
    }

    public function test_attendance_destroy_returns_204_without_body(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
            'report_date' => now()->toDateString(),
        ]);

        $attendanceId = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'session' => 'pagi',
            'photo' => UploadedFile::fake()->image('pagi.jpg'),
        ])->assertStatus(201)->json('data.id');

        $this->deleteJson("/api/wfh/reports/{$report->id}/attendances/{$attendanceId}")
            ->assertNoContent();

        $this->assertSoftDeleted('wfh_attendances', ['id' => $attendanceId]);
    }

    // ─── error shapes ────────────────────────────────────────────

    // Route-model binding resolves this, so the framework raises the 404 and
    // its body shape is the `error-contract` module's concern. Status only.
    public function test_missing_report_returns_404(): void
    {
        $this->staf();

        $this->getJson('/api/wfh/reports/999999')
            ->assertNotFound();
    }

    public function test_signature_guard_rejection_keeps_success_false(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'pending',
            'report_date' => now()->toDateString(),
        ]);

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    // ─── helpers ─────────────────────────────────────────────────

    private function staf(): User
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        return $user;
    }

    /**
     * @return array{0: User, 1: Team}
     */
    private function adminInField(): array
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        return [$admin, $team];
    }

    private function createTeamReport(Team $team): WfhTeamReport
    {
        return WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => User::factory()->create(['team_id' => $team->id])->id,
        ]);
    }

    /**
     * @return list<string>
     */
    private function sortedKeys(array $payload): array
    {
        $keys = array_keys($payload);
        sort($keys);

        return $keys;
    }
}
