<?php

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Contract: route middleware permissions reflect the verb (spec authz §4).
 * Each targeted user holds the OLD permission but not the NEW one, so the
 * request must be denied at the route with 403 — never reach the controller.
 */
class RoutePermissionContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
        Cache::flush();
    }

    public function test_delete_activity_requires_activity_delete_permission(): void
    {
        $user = User::factory()->create();
        // Old permission only — the route now demands wfh.report.activity.delete.
        $user->givePermissionTo('wfh.report.update');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
        ]);
        $activity = $report->activities()->create([
            'activity' => 'To delete',
            'sort_order' => 1,
        ]);

        $this->deleteJson("/api/wfh/reports/{$report->id}/activities/{$activity->id}")
            ->assertStatus(403);
    }

    public function test_delete_attendance_requires_attendance_delete_permission(): void
    {
        $user = User::factory()->create();
        $user->givePermissionTo('wfh.report.update');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'draft',
        ]);
        $attendance = WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $report->report_date->format('Y-m-d'),
            'session' => 'pagi',
            'photo_path' => 'attendances/test.jpg',
            'report_id' => $report->id,
        ]);

        $this->deleteJson("/api/wfh/reports/{$report->id}/attendances/{$attendance->id}")
            ->assertStatus(403);
    }

    public function test_delete_change_package_requires_initiation_delete_permission(): void
    {
        $user = User::factory()->create();
        // Old permission only — the route now demands change.initiation.delete.
        $user->givePermissionTo(['change.initiation.create', 'change.initiation.update']);
        Sanctum::actingAs($user);

        $package = ChangeInitiation::factory()->create([
            'initiator_id' => $user->id,
        ]);
        $this->deleteJson("/api/changes/{$package->id}")
            ->assertStatus(403);
    }

    public function test_submit_report_requires_submit_permission(): void
    {
        $user = User::factory()->create();
        // Owner able to create reports but not submit them.
        $user->givePermissionTo('wfh.report.create');
        Sanctum::actingAs($user);

        $reportId = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Meeting with team', 'start_time' => '09:00', 'end_time' => '10:00'],
            ],
        ])->json('data.id');

        $this->postJson("/api/wfh/reports/{$reportId}/submit")
            ->assertStatus(403);
    }

    public function test_append_attendance_requires_attendance_create_permission(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        // Old permission only — the route now demands wfh.attendance.create.
        $user->givePermissionTo('wfh.report.create');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
            'status' => 'draft',
        ]);

        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ])->assertStatus(403);
    }

    public function test_revise_report_requires_update_permission(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'rejected',
        ]);

        $this->postJson("/api/wfh/reports/{$report->id}/revise")
            ->assertStatus(403);
    }

    public function test_store_and_delete_admin_users_require_per_verb_permissions(): void
    {
        $manager = User::factory()->create();
        // Legacy umbrella permission only — store/destroy now demand
        // user.create / user.delete.
        $manager->givePermissionTo('user.manage');
        Sanctum::actingAs($manager);

        $this->getJson('/api/admin/users')
            ->assertStatus(200);

        $this->postJson('/api/admin/users', [
            'name' => 'New User',
            'nip' => '0000000100',
            'email' => 'new@test.com',
            'roles' => ['staf'],
        ])->assertStatus(403);

        $target = User::factory()->create();
        $this->deleteJson("/api/admin/users/{$target->id}")
            ->assertStatus(403);
    }

    public function test_reject_team_report_requires_reject_permission_not_approve(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $user = User::factory()->create(['team_id' => $team->id]);
        $user->givePermissionTo('wfh.team_report.reject');
        $field->update(['head_id' => $user->id]);
        Sanctum::actingAs($user);

        // created_by must be somebody else: the segregation guard rejects a
        // creator acting on their own report, which would mask the route gate
        // this test is about.
        $creator = User::factory()->create(['team_id' => $team->id]);

        $report = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        // The reject gate must be wfh.team_report.reject, not .approve: this
        // caller holds reject alone and must reach the controller (200), not
        // be blocked at the route (403) for lacking approve.
        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", [
            'reason' => 'Data tidak lengkap',
        ])->assertStatus(200);
    }
}
