<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Http\Resources\TeamReportDetailResource;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamReportShowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    // === Repository detail data ===

    public function test_detail_data_lists_every_active_member_with_report_and_attendance(): void
    {
        [$team, $member] = $this->teamWithMember();
        $report = $this->personalReport($member, 'pending');
        $this->repo()->addActivityToReport($report, [
            'start_time' => '08:00',
            'end_time' => '10:00',
            'activity' => 'Kerja lapangan',
            'links' => ['https://contoh.id/1'],
        ]);
        $this->repo()->addAttendanceToReport($report, ['session' => 'pagi', 'photo_path' => 'wfh/foto.jpg']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertCount(1, $data);
        $row = $data[0];
        $this->assertSame($member->id, $row['user_id']);
        $this->assertSame($member->name, $row['name']);
        $this->assertSame($member->nip, $row['nip']);
        $this->assertSame($report->id, $row['report_id']);
        $this->assertSame('pending', $row['report_status']);
        $this->assertCount(1, $row['activities']);
        $this->assertSame('Kerja lapangan', $row['activities'][0]['activity']);
        $this->assertSame('08:00', $row['activities'][0]['start_time']);
        $this->assertSame(['https://contoh.id/1'], $row['activities'][0]['links']);
        $this->assertCount(1, $row['attendances']);
        $this->assertSame('pagi', $row['attendances'][0]['session']);
        $this->assertStringContainsString('/wfh/reports/'.$report->id.'/attendances/', $row['attendances'][0]['photo_url']);
    }

    public function test_detail_data_member_without_report_has_nulls_and_empty_arrays(): void
    {
        [$team, $member] = $this->teamWithMember();

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertCount(1, $data);
        $this->assertNull($data[0]['report_id']);
        $this->assertNull($data[0]['report_status']);
        $this->assertSame([], $data[0]['activities']);
        $this->assertSame([], $data[0]['attendances']);
        $this->assertSame($member->id, $data[0]['user_id']);
    }

    public function test_detail_data_ignores_inactive_members(): void
    {
        [$team] = $this->teamWithMember();
        User::factory()->create(['team_id' => $team->id, 'is_active' => false]);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertCount(1, $data);
    }

    public function test_detail_data_picks_latest_live_report_and_its_attendances_only(): void
    {
        [$team, $member] = $this->teamWithMember();

        // Rejected earlier draft, then a pending live report: the pending one wins.
        $rejected = $this->personalReport($member, 'rejected');
        $rejected->forceFill(['updated_at' => now()->subHour()])->save();
        $this->repo()->addAttendanceToReport($rejected, ['session' => 'pagi', 'photo_path' => 'wfh/lama.jpg']);
        // The unique index covers live rows only: supersede the rejected
        // attendance before the pending report adds a live one.
        $rejected->attendances()->first()->delete();

        $pending = $this->personalReport($member, 'pending');
        $this->repo()->addAttendanceToReport($pending, ['session' => 'pagi', 'photo_path' => 'wfh/baru.jpg']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame($pending->id, $data[0]['report_id']);
        $this->assertCount(1, $data[0]['attendances']);
        $this->assertStringContainsString('/wfh/reports/'.$pending->id.'/attendances/', $data[0]['attendances'][0]['photo_url']);
    }

    public function test_detail_data_prefers_pending_over_newer_rejected(): void
    {
        [$team, $member] = $this->teamWithMember();

        $rejected = $this->personalReport($member, 'rejected');
        $rejected->forceFill(['updated_at' => now()])->save();

        $pending = $this->personalReport($member, 'pending');
        $pending->forceFill(['updated_at' => now()->subDay()])->save();

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame($pending->id, $data[0]['report_id']);
    }

    // === HTTP endpoint ===

    public function test_show_returns_envelope_with_resource_fields_and_members(): void
    {
        [$team, $member] = $this->teamWithMember();
        $creator = User::factory()->create(['team_id' => $team->id]);
        $creator->assignRole('kepala_tim');
        $report = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);
        $personal = $this->personalReport($member, 'pending');

        $viewer = User::factory()->create(['team_id' => $team->id]);
        $viewer->assignRole('kepala_tim');
        Sanctum::actingAs($viewer);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $report->id)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.team.id', $team->id)
            ->assertJsonPath('data.members.0.user_id', $member->id)
            ->assertJsonPath('data.members.0.report_id', $personal->id);
    }

    public function test_show_returns_422_for_user_without_field(): void
    {
        [$team] = $this->teamWithMember();
        $report = $this->teamReport($team);

        $user = User::factory()->create(['team_id' => null]);
        $user->assignRole('kepala_tim');
        Sanctum::actingAs($user);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'User tidak terhubung dengan bidang manapun.');
    }

    public function test_show_returns_403_for_cross_field_viewer(): void
    {
        [$team] = $this->teamWithMember();
        $report = $this->teamReport($team);

        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);
        $kt = User::factory()->create(['team_id' => $teamB->id]);
        $kt->assignRole('kepala_tim');
        Sanctum::actingAs($kt);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Laporan tidak berada dalam bidang Anda.');
    }

    public function test_show_returns_403_for_kepala_tim_outside_own_team(): void
    {
        [$team, $member] = $this->teamWithMember();
        $report = $this->teamReport($team);
        $this->personalReport($member, 'pending');

        $otherTeam = Team::create(['field_id' => $team->field_id, 'name' => 'Tim Lain']);
        $kt = User::factory()->create(['team_id' => $otherTeam->id]);
        $kt->assignRole('kepala_tim');
        Sanctum::actingAs($kt);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Laporan tidak berada dalam bidang Anda.');
    }

    public function test_show_allows_admin_from_any_field(): void
    {
        [$team, $member] = $this->teamWithMember();
        $report = $this->teamReport($team);
        $personal = $this->personalReport($member, 'pending');

        $admin = User::factory()->create(['team_id' => null]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.id', $report->id)
            ->assertJsonPath('data.members.0.report_id', $personal->id);
    }

    public function test_show_requires_view_permission(): void
    {
        [$team] = $this->teamWithMember();
        $report = $this->teamReport($team);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        Sanctum::actingAs($staf);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(403);
    }

    // === Resource ===

    public function test_detail_resource_extends_team_report_resource_with_members(): void
    {
        [$team, $member] = $this->teamWithMember();
        $teamReport = $this->teamReport($team);
        $this->personalReport($member, 'pending');

        $teamReport->load(['team', 'creator', 'supervisor']);
        $payload = (new TeamReportDetailResource($teamReport))->toArray(request());

        $this->assertSame($teamReport->id, $payload['id']);
        $this->assertSame('pending', $payload['status']);
        $this->assertCount(1, $payload['members']);
        $this->assertSame($member->id, $payload['members'][0]['user_id']);
    }

    // === Helpers ===

    private function repo(): WfhRepositoryInterface
    {
        return app(WfhRepositoryInterface::class);
    }

    /**
     * @return array{0: Team, 1: User}
     */
    private function teamWithMember(): array
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $member = User::factory()->create(['team_id' => $team->id, 'is_active' => true]);

        return [$team, $member];
    }

    private function personalReport(User $member, string $status): WfhReport
    {
        return WfhReport::factory()->status($status)->create([
            'user_id' => $member->id,
            'report_date' => now()->toDateString(),
        ]);
    }

    private function teamReport(Team $team): WfhTeamReport
    {
        $otherTeam = Team::create(['field_id' => $team->field_id, 'name' => 'Tim Pembuat']);
        $creator = User::factory()->create(['team_id' => $otherTeam->id]);
        $creator->assignRole('admin');

        return WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);
    }
}
