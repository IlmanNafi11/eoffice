<?php

namespace Tests\Feature\Http;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeImplementationAttachment;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Ship review TestCoverage gap #4: the route-permission matrix was 33
 * permissions wide and only ~8 deep, so a one-line deletion in routes/api.php
 * failed no test.
 *
 * A bare authenticated user (no roles, no permissions) must be refused with
 * 403 at the middleware for every gated route.
 *
 * Note on fixtures: route-model binding (SubstituteBindings) runs BEFORE the
 * route's `permission:` middleware in this app's stack, so a nonexistent id
 * would answer 404 and mask the gate under test. Every id below therefore
 * points at a real row; the only thing missing is the permission.
 */
class RoutePermissionMatrixTest extends TestCase
{
    use RefreshDatabase;

    private User $outsider;

    private array $ids = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
        $this->artisan('db:seed', ['--class' => 'ChangeTypeSeeder']);

        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        // The owner of every fixture row; never the acting user.
        $owner = User::factory()->create([
            'team_id' => $team->id,
            'is_active' => true,
            'must_change_password' => false,
        ]);

        $this->ids = $this->buildFixtures($owner, $team);

        // No role, no permission: every gated route must refuse this actor.
        $this->outsider = User::factory()->create([
            'team_id' => $team->id,
            'is_active' => true,
            'must_change_password' => false,
        ]);

        Sanctum::actingAs($this->outsider);
    }

    private function buildFixtures(User $owner, Team $team): array
    {
        $report = WfhReport::factory()->create([
            'user_id' => $owner->id,
            'report_date' => now()->toDateString(),
        ]);

        $activity = WfhReportActivity::create([
            'wfh_report_id' => $report->id,
            'activity' => 'Kegiatan',
            'sort_order' => 1,
        ]);

        $attendance = WfhAttendance::create([
            'report_id' => $report->id,
            'user_id' => $owner->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'attendances/x.png',
        ]);

        $teamReport = WfhTeamReport::factory()->create([
            'team_id' => $team->id,
            'created_by' => $owner->id,
            'report_date' => now()->toDateString(),
        ]);

        $change = ChangeInitiation::factory()->create([
            'field_id' => $team->field_id,
            'initiator_id' => $owner->id,
        ]);

        $implementation = ChangeImplementation::create([
            'change_initiation_id' => $change->id,
        ]);

        $attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $implementation->id,
            'path' => 'change-attachments/x.png',
            'sort_order' => 1,
        ]);

        $otherUser = User::factory()->create(['team_id' => $team->id]);

        return [
            'user' => $otherUser->id,
            'report' => $report->id,
            'activity' => $activity->id,
            'attendance' => $attendance->id,
            'teamReport' => $teamReport->id,
            'team' => $team->id,
            'change' => $change->id,
            'attachment' => $attachment->id,
        ];
    }

    /**
     * @return array<string, array{0: string, 1: string}>
     */
    public static function gatedRoutes(): array
    {
        return [
            // --- organization / RBAC ---
            'admin users index (user.manage)' => ['GET', '/api/admin/users'],
            'admin user store (user.create)' => ['POST', '/api/admin/users'],
            'admin user update (user.update)' => ['PUT', '/api/admin/users/{user}'],
            'admin user delete (user.delete)' => ['DELETE', '/api/admin/users/{user}'],
            'admin user import (user.import)' => ['POST', '/api/admin/users/import'],
            'admin roles index (role.manage)' => ['GET', '/api/admin/roles'],
            'admin permissions index (permission.manage)' => ['GET', '/api/admin/permissions'],
            'admin settings index (setting.manage)' => ['GET', '/api/admin/settings'],

            // --- wfh personal ---
            'report store (wfh.report.create)' => ['POST', '/api/wfh/reports'],
            'report update (wfh.report.update)' => ['PUT', '/api/wfh/reports/{report}'],
            'report delete (wfh.report.delete)' => ['DELETE', '/api/wfh/reports/{report}'],
            'report submit (wfh.report.submit)' => ['POST', '/api/wfh/reports/{report}/submit'],
            'report revise (wfh.report.update)' => ['POST', '/api/wfh/reports/{report}/revise'],
            'report approve (wfh.report.approve)' => ['POST', '/api/wfh/reports/{report}/approve'],
            'report reject (wfh.report.reject)' => ['POST', '/api/wfh/reports/{report}/reject'],
            'report pdf (wfh.report.export_pdf)' => ['GET', '/api/wfh/reports/{report}/pdf'],
            'activity delete (wfh.report.activity.delete)' => ['DELETE', '/api/wfh/reports/{report}/activities/{activity}'],
            'attendance create (wfh.attendance.create)' => ['POST', '/api/wfh/reports/{report}/attendances'],
            'attendance delete (wfh.report.attendance.delete)' => ['DELETE', '/api/wfh/reports/{report}/attendances/{attendance}'],

            // --- wfh admin ---
            'monitoring (wfh.monitoring.view)' => ['GET', '/api/admin/wfh/monitoring'],
            'admin reports (wfh.monitoring.view)' => ['GET', '/api/admin/wfh/reports'],
            'team reports index (wfh.team_report.view)' => ['GET', '/api/admin/wfh/team-reports'],
            'team report store (wfh.team_report.create)' => ['POST', '/api/admin/wfh/team-reports'],
            'team report approve (wfh.team_report.approve)' => ['POST', '/api/admin/wfh/team-reports/{teamReport}/approve'],
            'team report reject (wfh.team_report.reject)' => ['POST', '/api/admin/wfh/team-reports/{teamReport}/reject'],
            'team pdf (wfh.report.export_pdf)' => ['GET', '/api/admin/wfh/teams/{team}/pdf'],

            // --- change management ---
            'changes index (change.initiation.view)' => ['GET', '/api/changes'],
            'changes store (change.initiation.create)' => ['POST', '/api/changes'],
            'changes show (change.initiation.view)' => ['GET', '/api/changes/{change}'],
            'changes update (change.initiation.update)' => ['PUT', '/api/changes/{change}'],
            'changes delete (change.initiation.delete)' => ['DELETE', '/api/changes/{change}'],
            'changes submit (change.initiation.submit)' => ['POST', '/api/changes/{change}/submit'],
            'changes approve (change.initiation.approve)' => ['POST', '/api/changes/{change}/approve'],
            'changes reject (change.initiation.reject)' => ['POST', '/api/changes/{change}/reject'],
            'changes attachments upload (change.implementation.update)' => ['POST', '/api/changes/{change}/attachments'],
            'changes attachment download (change.initiation.view)' => ['GET', '/api/changes/{change}/attachments/{attachment}'],
            'changes pdf initiation (change.initiation.export_pdf)' => ['GET', '/api/changes/{change}/pdf/initiation'],
            'changes pdf implementation (change.implementation.export_pdf)' => ['GET', '/api/changes/{change}/pdf/implementation'],
        ];
    }

    #[DataProvider('gatedRoutes')]
    public function test_actor_without_the_permission_is_refused_at_the_route_gate(
        string $verb,
        string $uri,
    ): void {
        // Substitute real ids so route-model binding cannot answer 404 first.
        foreach ($this->ids as $key => $id) {
            $uri = str_replace('{'.$key.'}', (string) $id, $uri);
        }

        $response = $this->json($verb, $uri);

        $response->assertStatus(403);

        // The refusal must be the canonical envelope, not a framework page.
        $response->assertJsonPath('success', false);
    }
}
