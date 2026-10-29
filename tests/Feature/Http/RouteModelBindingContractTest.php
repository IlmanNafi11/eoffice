<?php

namespace Tests\Feature\Http;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Envelope module (Task 6): route-model binding — model-typehinted parameters
 * with framework-driven 404s. The manual `int $id` + find() branches are gone.
 *
 * Discriminator between binding and manual find(): a **non-numeric** segment.
 * `find()` on an int-typed parameter never runs (TypeError 500); real binding
 * fails resolution in the router and yields 404 before the controller runs.
 * The 404 body shape itself is normalized later (error-contract module), so
 * these tests only assert the status and that the response is JSON.
 */
class RouteModelBindingContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        // Monday, within the default wfh_allowed_days (1..5).
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // ─── non-numeric segment → 404, not a 500 TypeError ─────────

    public function test_show_missing_user_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->getJson('/api/admin/users/not-a-number')->assertNotFound();
    }

    public function test_update_missing_user_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->putJson('/api/admin/users/not-a-number', ['name' => 'X'])
            ->assertNotFound();
    }

    public function test_destroy_missing_user_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->deleteJson('/api/admin/users/not-a-number')->assertNotFound();
    }

    public function test_show_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->getJson('/api/wfh/reports/not-a-number')->assertNotFound();
    }

    public function test_update_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->putJson('/api/wfh/reports/not-a-number', [
            'report_date' => now()->toDateString(),
        ])->assertNotFound();
    }

    public function test_destroy_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->deleteJson('/api/wfh/reports/not-a-number')->assertNotFound();
    }

    public function test_submit_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->postJson('/api/wfh/reports/not-a-number/submit')->assertNotFound();
    }

    public function test_approve_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->postJson('/api/wfh/reports/not-a-number/approve')->assertNotFound();
    }

    public function test_reject_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->postJson('/api/wfh/reports/not-a-number/reject', [
            'reason' => 'perlu revisi',
        ])->assertNotFound();
    }

    public function test_revise_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->postJson('/api/wfh/reports/not-a-number/revise')->assertNotFound();
    }

    public function test_pdf_export_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $user = User::factory()->create();
        $user->givePermissionTo('wfh.report.export_pdf');
        Sanctum::actingAs($user);

        $this->getJson('/api/wfh/reports/not-a-number/pdf')->assertNotFound();
    }

    public function test_team_report_approve_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->adminInField();

        $this->postJson('/api/admin/wfh/team-reports/not-a-number/approve')
            ->assertNotFound();
    }

    public function test_team_report_reject_missing_report_by_non_numeric_segment_returns_404(): void
    {
        $this->adminInField();

        $this->postJson('/api/admin/wfh/team-reports/not-a-number/reject', [
            'reason' => 'perlu revisi',
        ])->assertNotFound();
    }

    public function test_role_permissions_missing_role_by_non_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->putJson('/api/admin/roles/not-a-number/permissions', [
            'permissions' => ['user.manage'],
        ])->assertNotFound();
    }

    // ─── numeric-but-missing segment → still 404 ─────────────────

    public function test_show_missing_user_by_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->getJson('/api/admin/users/999999')->assertNotFound();
    }

    public function test_show_missing_report_by_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->getJson('/api/wfh/reports/999999')->assertNotFound();
    }

    public function test_submit_missing_report_by_numeric_segment_returns_404(): void
    {
        $this->staf();

        $this->postJson('/api/wfh/reports/999999/submit')->assertNotFound();
    }

    public function test_team_report_approve_missing_report_by_numeric_segment_returns_404(): void
    {
        $this->adminInField();

        $this->postJson('/api/admin/wfh/team-reports/999999/approve')
            ->assertNotFound();
    }

    public function test_role_permissions_missing_role_by_numeric_segment_returns_404(): void
    {
        $this->admin();

        $this->putJson('/api/admin/roles/999999/permissions', [
            'permissions' => ['user.manage'],
        ])->assertNotFound();
    }

    // ─── existing models still resolve, 404-before-controller removed ──

    public function test_user_show_resolves_bound_user_with_relations(): void
    {
        $this->admin();

        $target = User::factory()->create();

        $body = $this->getJson('/api/admin/users/'.$target->id)
            ->assertOk()
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame($target->id, $body['data']['id']);
        $this->assertArrayHasKey('roles', $body['data']);
    }

    public function test_user_destroy_resolves_bound_user_and_deletes(): void
    {
        $this->admin();

        $target = User::factory()->create();

        $this->deleteJson('/api/admin/users/'.$target->id)->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $target->id]);
    }

    public function test_report_show_resolves_bound_report_with_relations(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
        ]);

        $body = $this->getJson('/api/wfh/reports/'.$report->id)
            ->assertOk()
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame($report->id, $body['data']['id']);
        // findReportWithRelations eager-load contract preserved through binding.
        $this->assertArrayHasKey('activities', $body['data']);
        $this->assertArrayHasKey('attendances', $body['data']);
    }

    public function test_report_update_response_keeps_eager_loaded_relations(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
            'report_date' => now()->toDateString(),
        ]);
        $report->activities()->create(['activity' => 'Kerja', 'sort_order' => 0]);

        $body = $this->putJson('/api/wfh/reports/'.$report->id, [
            'report_date' => now()->toDateString(),
        ])->assertOk()
            ->json();

        // The PUT response used to come from findReportWithRelations(); binding
        // must not silently shrink it to a bare model.
        $this->assertArrayHasKey('activities', $body['data']);
        $this->assertArrayHasKey('attendances', $body['data']);
        $this->assertSame('Kerja', $body['data']['activities'][0]['activity']);
    }

    public function test_report_submit_resolves_bound_report(): void
    {
        $user = $this->staf();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
            'report_date' => now()->toDateString(),
        ]);
        $report->activities()->create(['activity' => 'Kerja', 'sort_order' => 0]);

        $body = $this->postJson("/api/wfh/reports/{$report->id}/submit")
            ->assertOk()
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame('pending', $body['data']['status']);
    }

    public function test_role_permissions_resolves_bound_role(): void
    {
        $this->admin();

        $role = Role::firstOrCreate(['name' => 'kasubag', 'guard_name' => 'web']);

        $body = $this->putJson("/api/admin/roles/{$role->id}/permissions", [
            'permissions' => ['user.manage'],
        ])->assertOk()
            ->json();

        $this->assertTrue($body['success']);
        $this->assertSame($role->id, $body['data']['id']);
        $this->assertContains('user.manage', $body['data']['permissions']);
    }

    // ─── /changes keeps int $id (custom relation loading) ────────

    public function test_change_show_missing_package_returns_404_with_message(): void
    {
        $this->staf();

        // Manual find() contract: numeric miss keeps the domain message and
        // shape (normalized by error-contract later, not here).
        $this->getJson('/api/changes/999999')
            ->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Paket perubahan tidak ditemukan.');
    }

    public function test_change_show_non_numeric_segment_returns_404(): void
    {
        $this->staf();

        // int $id is kept (custom relation loading), so the segment is
        // constrained by Route::pattern('id', '[0-9]+'): a non-numeric value
        // misses the route entirely and the framework answers 404.
        $this->getJson('/api/changes/not-a-number')
            ->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Data tidak ditemukan.');
    }

    // ─── guards keep running after binding ───────────────────────

    public function test_report_show_of_other_users_report_still_requires_monitoring_permission(): void
    {
        $this->staf();

        $other = User::factory()->create();
        $report = WfhReport::factory()->create([
            'user_id' => $other->id,
            'status' => 'draft',
        ]);

        $this->getJson('/api/wfh/reports/'.$report->id)->assertForbidden();
    }

    public function test_team_report_approve_of_other_field_still_forbidden(): void
    {
        $this->adminInField();

        $otherField = Field::create(['name' => 'Bidang B']);
        $otherTeam = Team::create(['field_id' => $otherField->id, 'name' => 'Tim B']);
        $report = WfhTeamReport::create([
            'team_id' => $otherTeam->id,
            'report_date' => now()->toDateString(),
            'status' => 'pending',
            'created_by' => User::factory()->create(['team_id' => $otherTeam->id])->id,
        ]);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertForbidden();
    }

    // ─── helpers ─────────────────────────────────────────────────

    private function admin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

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
}
