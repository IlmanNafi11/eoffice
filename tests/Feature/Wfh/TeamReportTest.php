<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    // === CRUD ===

    public function test_admin_can_create_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
        ])
            ->assertStatus(201)
            ->assertJsonPath('data.status', 'pending');
    }

    public function test_non_admin_cannot_create_team_report(): void
    {
        $team = Team::factory()->create();
        $staf = User::factory()->create();
        $staf->assignRole('staf');
        Sanctum::actingAs($staf);

        $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
        ])->assertStatus(403);
    }

    public function test_admin_cannot_create_team_report_for_other_field(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamB = Team::create(['field_id' => Field::create(['name' => 'Bidang B'])->id, 'name' => 'Tim B']);

        $admin = User::factory()->create(['team_id' => Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A'])->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $teamB->id,
            'report_date' => now()->toDateString(),
        ])->assertStatus(403);
    }

    // === Approval ===

    public function test_kb_can_approve_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($team);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_admin_can_approve_team_report_in_same_field(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');

        $report = $this->createTeamReport($team);
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_admin_cross_field_team_report_approve_returns_403(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $admin = User::factory()->create(['team_id' => $teamA->id]);
        $admin->assignRole('admin');

        $report = $this->createTeamReport($teamB);
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(403);
    }

    public function test_kb_can_reject_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($team);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", [
            'reason' => 'Data tidak lengkap',
        ])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'rejected');
    }

    // === Data compilation ===

    public function test_get_team_report_data_includes_all_members(): void
    {
        $team = Team::factory()->create();
        $member1 = User::factory()->create(['team_id' => $team->id]);
        $member2 = User::factory()->create(['team_id' => $team->id]);
        $member3 = User::factory()->create(['team_id' => $team->id]);

        WfhReport::factory()->create([
            'user_id' => $member1->id,
            'report_date' => now()->toDateString(),
            'status' => 'pending',
        ]);
        WfhAttendance::create([
            'user_id' => $member2->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'photo.jpg',
            'check_in_at' => now(),
        ]);

        $data = app(WfhRepositoryInterface::class)
            ->getTeamReportData($team->id, now()->toDateString());

        $this->assertCount(3, $data);
        $names = collect($data)->pluck('name')->toArray();
        $this->assertContains(strtoupper($member1->name), $names);
        $this->assertContains(strtoupper($member2->name), $names);
        $this->assertContains(strtoupper($member3->name), $names);
    }

    public function test_member_without_report_has_no_links_and_no_photos(): void
    {
        $team = Team::factory()->create();
        $member = User::factory()->create(['team_id' => $team->id]);

        $data = app(WfhRepositoryInterface::class)
            ->getTeamReportData($team->id, now()->toDateString());

        $this->assertCount(1, $data);
        $this->assertEmpty($data[0]['links']);
        $this->assertEmpty($data[0]['photos']);
    }

    public function test_duplicate_team_report_for_same_date_returns_error(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
        ])->assertStatus(201);

        // Second create for same team+date
        $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_approve_non_pending_team_report_returns_422(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);
        Sanctum::actingAs($kb);

        $report = $this->createTeamReport($team);
        $report->forceFill(['status' => 'approved'])->save();

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(422);
    }

    public function test_reject_non_pending_team_report_returns_422(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);
        Sanctum::actingAs($kb);

        $report = $this->createTeamReport($team);
        $report->forceFill(['status' => 'rejected'])->save();

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", [
            'reason' => 'Already rejected',
        ])->assertStatus(422);
    }

    /** Segregation of duties: the creator cannot approve their own report. */
    public function test_creator_cannot_approve_own_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $creator = User::factory()->create(['team_id' => $team->id]);
        $creator->assignRole('kepala_bidang');
        $field->update(['head_id' => $creator->id]);
        Sanctum::actingAs($creator);

        $report = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(403)
            ->assertJsonPath('message', 'Pembuat laporan tidak dapat menyetujui laporannya sendiri.');

        $this->assertSame('pending', $report->fresh()->status);
    }

    /** The same segregation rule applies to reject, not just approve. */
    public function test_creator_cannot_reject_own_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $creator = User::factory()->create(['team_id' => $team->id]);
        $creator->assignRole('kepala_bidang');
        $field->update(['head_id' => $creator->id]);
        Sanctum::actingAs($creator);

        $report = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", ['reason' => 'nope'])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Pembuat laporan tidak dapat menolak laporannya sendiri.');

        $this->assertSame('pending', $report->fresh()->status);
    }

    /** A different kepala of the same bidang still approves normally. */
    public function test_non_creator_can_approve_team_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);
        Sanctum::actingAs($kb);

        $report = $this->createTeamReport($team);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'approved');
    }

    // === List (TDD Phase 1) ===

    public function test_kb_can_list_team_reports(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $this->createTeamReport($team);
        Sanctum::actingAs($kb);

        $this->getJson('/api/admin/wfh/team-reports')
            ->assertStatus(200);
    }

    public function test_non_kb_cannot_list_team_reports(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        Sanctum::actingAs($staf);

        $this->getJson('/api/admin/wfh/team-reports')
            ->assertStatus(403);
    }

    public function test_kepala_tim_can_list_own_team_reports(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $field->id, 'name' => 'Tim A', 'leader_id' => null]);
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B', 'leader_id' => null]);

        $kt = User::factory()->create(['team_id' => $teamA->id]);
        $kt->assignRole('kepala_tim');
        $teamA->update(['leader_id' => $kt->id]);

        $this->createTeamReport($teamA);
        $this->createTeamReport($teamB);
        Sanctum::actingAs($kt);

        $response = $this->getJson('/api/admin/wfh/team-reports')
            ->assertStatus(200);

        $teamIds = collect($response->json('data'))->pluck('team_id')->unique();
        $this->assertEquals([$teamA->id], $teamIds->all(), 'KT hanya boleh lihat team-report tim sendiri');
    }

    public function test_user_without_field_returns_422(): void
    {
        $user = User::factory()->create(['team_id' => null]);
        $user->assignRole('kepala_tim');
        Sanctum::actingAs($user);

        $this->getJson('/api/admin/wfh/team-reports')
            ->assertStatus(422)
            ->assertJsonPath('message', 'User tidak terhubung dengan bidang manapun.');
    }

    public function test_cross_field_team_report_approve_returns_403(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $kb = User::factory()->create(['team_id' => $teamA->id]);
        $kb->assignRole('kepala_bidang');
        $fieldA->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($teamB);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(403);
    }

    public function test_cross_field_team_report_reject_returns_403(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $kb = User::factory()->create(['team_id' => $teamA->id]);
        $kb->assignRole('kepala_bidang');
        $fieldA->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($teamB);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", [
            'reason' => 'Alasan',
        ])
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Laporan tidak berada dalam bidang Anda.');
    }

    public function test_kepala_bidang_has_team_report_reject_permission(): void
    {
        $kb = User::factory()->create();
        $kb->assignRole('kepala_bidang');

        $this->assertTrue($kb->hasPermissionTo('wfh.team_report.reject'));
        $this->assertTrue($kb->hasPermissionTo('wfh.team_report.approve'));
    }

    public function test_approve_team_report_sets_supervisor_id(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($team);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(200);

        $fresh = WfhTeamReport::find($report->id);
        $this->assertEquals($kb->id, $fresh->supervisor_id, 'supervisor_id harus terisi = actor');
        $this->assertNotNull($fresh->supervisor_signed_at, 'supervisor_signed_at harus terisi');
    }

    public function test_reject_team_report_does_not_change_supervisor_id(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($team);
        // Set a supervisor_id first, then confirm reject doesn't clear it
        $otherUser = User::factory()->create();
        // supervisor_id is non-fillable (SEC-07): seed it explicitly.
        $report->forceFill(['supervisor_id' => $otherUser->id])->save();
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/reject", [
            'reason' => 'Data tidak lengkap',
        ])->assertStatus(200);

        $fresh = WfhTeamReport::find($report->id);
        $this->assertEquals($otherUser->id, $fresh->supervisor_id, 'reject tidak boleh mengubah supervisor_id');
        $this->assertNull($fresh->supervisor_signed_at, 'reject tidak boleh mengubah supervisor_signed_at');
    }

    public function test_cross_field_team_report_approve_has_consistent_error_shape(): void
    {
        $fieldA = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $fieldA->id, 'name' => 'Tim A']);
        $fieldB = Field::create(['name' => 'Bidang B']);
        $teamB = Team::create(['field_id' => $fieldB->id, 'name' => 'Tim B']);

        $kb = User::factory()->create(['team_id' => $teamA->id]);
        $kb->assignRole('kepala_bidang');
        $fieldA->update(['head_id' => $kb->id]);

        $report = $this->createTeamReport($teamB);
        Sanctum::actingAs($kb);

        $this->postJson("/api/admin/wfh/team-reports/{$report->id}/approve")
            ->assertStatus(403)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Laporan tidak berada dalam bidang Anda.');
    }

    // === Helpers ===

    private function createTeamReport(Team $team): mixed
    {
        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');

        return WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $admin->id,
        ]);
    }
}
