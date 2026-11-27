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
use Spatie\Permission\Models\Role;
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

    /** Ship review: anggota yang hanya punya draf tidak boleh mengekspos isi
     *  drafnya lewat detail laporan tim — draf adalah milik penulis
     *  (author-private di seluruh sistem). Konsisten dengan halaman daftar,
     *  anggota draf tampil "belum ada laporan". */
    public function test_detail_data_ignores_draft_only_member(): void
    {
        [$team, $member] = $this->teamWithMember();

        $draft = $this->personalReport($member, 'draft');
        $this->repo()->addActivityToReport($draft, ['activity' => 'Draf rahasia']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertNull($data[0]['report_id']);
        $this->assertNull($data[0]['report_status']);
        $this->assertSame([], $data[0]['activities']);
        $this->assertSame([], $data[0]['attendances']);
    }

    /** Draf yang lebih baru tidak menggeser laporan live yang dipilih. */
    public function test_detail_data_prefers_live_report_over_newer_draft(): void
    {
        [$team, $member] = $this->teamWithMember();

        $pending = $this->personalReport($member, 'pending');
        $pending->forceFill(['updated_at' => now()->subHour()])->save();

        $draft = $this->personalReport($member, 'draft');
        $draft->forceFill(['updated_at' => now()])->save();

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame($pending->id, $data[0]['report_id']);
        $this->assertSame('pending', $data[0]['report_status']);
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

    /** Anggota yang HANYA punya laporan rejected tetap tampil dengan status
     *  rejected (live) — bukan jatuh ke "belum ada laporan". */
    public function test_detail_data_rejected_only_member_surfaces_rejected_status(): void
    {
        [$team, $member] = $this->teamWithMember();

        $this->personalReport($member, 'rejected');

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame('rejected', $data[0]['report_status']);
    }

    /** Urutan anggota deterministik (nama) agar kartu detail stabil antar
     *  query plan — tanpa test ini urutan mengikuti plan DB. */
    public function test_detail_data_orders_members_by_name(): void
    {
        $field = Field::create(['name' => 'Bidang Urut']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Urut']);
        User::factory()->create(['team_id' => $team->id, 'name' => 'Zulkifli']);
        User::factory()->create(['team_id' => $team->id, 'name' => 'Ahmad']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame(['Ahmad', 'Zulkifli'], array_column($data, 'name'));
    }

    public function test_detail_data_returns_null_photo_url_when_attendance_has_no_photo(): void
    {
        [$team, $member] = $this->teamWithMember();
        $report = $this->personalReport($member, 'pending');
        $this->repo()->addAttendanceToReport($report, ['session' => 'pagi', 'photo_path' => '']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertCount(1, $data[0]['attendances']);
        $this->assertNull($data[0]['attendances'][0]['photo_url']);
    }

    /** Ship review #22: draf tidak boleh bocor ke PDF tim — draf adalah
     *  milik penulis di seluruh sistem, bukan hanya di endpoint detail. */
    public function test_team_pdf_data_ignores_draft_only_member(): void
    {
        [$team, $member] = $this->teamWithMember();

        $draft = $this->personalReport($member, 'draft');
        $this->repo()->addActivityToReport($draft, ['activity' => 'Draf rahasia', 'links' => ['https://draf.rahasia/1']]);
        $this->repo()->addAttendanceToReport($draft, ['session' => 'pagi', 'photo_path' => 'wfh/draf.jpg']);

        $data = $this->repo()->getTeamReportData($team->id, now()->toDateString());

        $this->assertSame([], $data[0]['links']);
        $this->assertSame([], $data[0]['photos']);
    }

    /** Draf yang lebih baru tidak menggeser laporan live yang dicetak ke PDF. */
    public function test_team_pdf_data_prefers_live_report_over_newer_draft(): void
    {
        [$team, $member] = $this->teamWithMember();

        $pending = $this->personalReport($member, 'pending');
        $this->repo()->addActivityToReport($pending, ['activity' => 'Kerja live', 'links' => ['https://live.id/1']]);
        $pending->forceFill(['updated_at' => now()->subHour()])->save();

        $draft = $this->personalReport($member, 'draft');
        $this->repo()->addActivityToReport($draft, ['activity' => 'Draf rahasia', 'links' => ['https://draf.rahasia/1']]);
        $draft->forceFill(['updated_at' => now()])->save();

        $data = $this->repo()->getTeamReportData($team->id, now()->toDateString());

        $this->assertSame(['https://live.id/1'], $data[0]['links']);
    }

    /** Anggota yang HANYA punya laporan rejected tetap tercetak di PDF
     *  (rejected adalah status live), konsisten dengan halaman detail. */
    public function test_team_pdf_data_rejected_only_member_still_prints(): void
    {
        [$team, $member] = $this->teamWithMember();

        $rejected = $this->personalReport($member, 'rejected');
        $this->repo()->addActivityToReport($rejected, ['activity' => 'Kerja ditolak', 'links' => ['https://ditolak.id/1']]);

        $data = $this->repo()->getTeamReportData($team->id, now()->toDateString());

        $this->assertSame(['https://ditolak.id/1'], $data[0]['links']);
    }

    /** Foto presensi di PDF diambil dari laporan yang TERPILIH: presensi milik
     *  laporan rejected tidak boleh muncul di bawah laporan live yang tidak
     *  punya presensi. Indeks unik (user, date, session) hanya menutup baris
     *  live, jadi presensi rejected + laporan live tanpa presensi bisa ada
     *  bersamaan — tepat kasus yang dulu membocorkan foto di PDF. */
    public function test_team_pdf_data_takes_photos_from_the_selected_report_only(): void
    {
        [$team, $member] = $this->teamWithMember();

        $rejected = $this->personalReport($member, 'rejected');
        $this->repo()->addAttendanceToReport($rejected, ['session' => 'pagi', 'photo_path' => 'wfh/rejected.jpg']);
        $rejected->forceFill(['updated_at' => now()->subHour()])->save();

        $pending = $this->personalReport($member, 'pending');
        $pending->forceFill(['updated_at' => now()])->save();

        $data = $this->repo()->getTeamReportData($team->id, now()->toDateString());

        $this->assertSame([], $data[0]['photos']);
    }

    /** Urutan anggota PDF tim deterministik (nama) — dua unduhan PDF untuk
     *  tim yang sama tidak boleh mengurutkan staf berbeda. */
    public function test_team_pdf_data_orders_members_by_name(): void
    {
        $field = Field::create(['name' => 'Bidang Urut Pdf']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Urut Pdf']);
        User::factory()->create(['team_id' => $team->id, 'name' => 'Zulkifli', 'is_active' => true]);
        User::factory()->create(['team_id' => $team->id, 'name' => 'Ahmad', 'is_active' => true]);

        $data = $this->repo()->getTeamReportData($team->id, now()->toDateString());

        $this->assertSame(['AHMAD', 'ZULKIFLI'], array_column($data, 'name'));
    }

    public function test_detail_data_returns_empty_array_for_team_without_active_members(): void
    {
        $field = Field::create(['name' => 'Bidang Kosong']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Kosong']);

        $data = $this->repo()->getTeamReportDetailData($team->id, now()->toDateString());

        $this->assertSame([], $data);
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

        $response = $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $report->id)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.team.id', $team->id);

        // Urutan kartu deterministik per nama, jadi cari anggota by id.
        $row = collect($response->json('data.members'))->firstWhere('user_id', $member->id);
        $this->assertNotNull($row);
        $this->assertSame($personal->id, $row['report_id']);
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

    /**
     * Ship review High gap: the privilege-GRANTING branch of show() — a field
     * head reading a sibling team's report inside their own field — was only
     * exercised negatively. A regression flipping `||` to `&&` in
     * TeamReportScope::denialFor would 403 every kepala_bidang detail view
     * while the current suite stays green; this test pins it.
     */
    public function test_show_allows_field_head_to_read_sibling_team_in_own_field(): void
    {
        [$team, $member] = $this->teamWithMember();
        $report = $this->teamReport($team);
        $personal = $this->personalReport($member, 'pending');

        // kepala_bidang of the field: head_id on the field row, own team different.
        $fieldHead = User::factory()->create(['team_id' => null]);
        $fieldHead->assignRole('kepala_bidang');
        Field::where('id', $team->field_id)->update(['head_id' => $fieldHead->id]);
        $fieldHeadTeam = Team::create(['field_id' => $team->field_id, 'name' => 'Tim Kepala']);
        $fieldHead->update(['team_id' => $fieldHeadTeam->id]);
        Sanctum::actingAs($fieldHead);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.id', $report->id)
            ->assertJsonPath('data.members.0.report_id', $personal->id);
    }

    public function test_show_returns_404_for_nonexistent_report(): void
    {
        $viewer = User::factory()->create(['team_id' => null]);
        $viewer->assignRole('admin');
        Sanctum::actingAs($viewer);

        $this->getJson('/api/admin/wfh/team-reports/999999')
            ->assertStatus(404);
    }

    /**
     * Dual permission (ship review): the payload embeds monitoring-grade
     * content, so `wfh.monitoring.view` is required on top of
     * `wfh.team_report.view`. Uses a dedicated role carrying only
     * `wfh.team_report.view`, because the standard roles bundle both
     * permissions and a direct revoke would not strip the role-granted one.
     */
    public function test_show_refuses_viewer_without_monitoring_permission(): void
    {
        [$team] = $this->teamWithMember();
        $report = $this->teamReport($team);

        $role = Role::firstOrCreate(['name' => 'view-only-test', 'guard_name' => 'web']);
        $role->syncPermissions(['wfh.team_report.view']);
        $viewer = User::factory()->create(['team_id' => $team->id]);
        $viewer->assignRole($role);
        Sanctum::actingAs($viewer);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(403);
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

        $teamReport->load(['team', 'creator', 'supervisor']);
        // Members are resolved by the caller (controller) and passed in — the
        // resource is a plain serializer, never a service locator.
        $members = $this->repo()->getTeamReportDetailData($team->id, $teamReport->report_date->format('Y-m-d'));
        $payload = (new TeamReportDetailResource($teamReport, $members))->toArray(request());

        $this->assertSame($teamReport->id, $payload['id']);
        $this->assertSame('pending', $payload['status']);
        $this->assertCount(1, $payload['members']);
        $this->assertSame($member->id, $payload['members'][0]['user_id']);
    }

    /** Ship review #22: HTTP-level empty team — resource + envelope harus
     *  meneruskan members: [] (repo-level sudah diuji, jalur HTTP belum). */
    public function test_show_returns_empty_members_for_team_without_active_members(): void
    {
        $field = Field::create(['name' => 'Bidang Kosong Http']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Kosong Http']);
        $report = $this->teamReport($team);

        $admin = User::factory()->create(['team_id' => null]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson("/api/admin/wfh/team-reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.members', []);
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
