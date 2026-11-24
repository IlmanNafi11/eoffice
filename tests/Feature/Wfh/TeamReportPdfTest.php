<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Pdf\PdfImage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamReportPdfTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_team_pdf_hides_kb_signature_when_team_report_pending(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $teamReport = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $admin->id,
        ]);

        $captured = $this->capturePdfViewData($team, $teamReport->id);

        $this->assertFalse($captured['isApproved']);
        $this->assertNull($captured['signatureSupervisorPath']);
    }

    public function test_team_pdf_shows_kb_signature_when_team_report_approved(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);
        $this->setUserSignature($kb);
        Sanctum::actingAs($admin);

        $teamReport = WfhTeamReport::factory()->status('approved')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $admin->id,
            'supervisor_id' => $kb->id,
            'supervisor_signed_at' => now(),
        ]);

        $captured = $this->capturePdfViewData($team, $teamReport->id);

        $this->assertTrue($captured['isApproved']);
        $this->assertNotNull($captured['signatureSupervisorPath']);
    }

    public function test_team_pdf_without_team_report_id_hides_kb_signature(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);
        Sanctum::actingAs($admin);

        $captured = $this->capturePdfViewData($team, null);

        $this->assertFalse($captured['isApproved']);
        $this->assertNull($captured['signatureSupervisorPath']);
    }

    public function test_team_pdf_with_invalid_team_report_id_hides_kb_signature(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $captured = $this->capturePdfViewData($team, 99999);

        $this->assertFalse($captured['isApproved']);
        $this->assertNull($captured['signatureSupervisorPath']);
    }

    public function test_team_pdf_maker_is_the_report_creator_not_the_downloader(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $creator = User::factory()->create(['team_id' => $team->id, 'name' => 'Pembuat Laporan']);
        $creator->assignRole('staf');
        $this->setUserSignature($creator);

        $admin = User::factory()->create(['team_id' => $team->id, 'name' => 'Admin Unduh']);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $teamReport = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        $captured = $this->capturePdfViewData($team, $teamReport->id);

        $this->assertSame('PEMBUAT LAPORAN', $captured['makerName']);
        $this->assertNotSame('ADMIN UNDUH', $captured['makerName']);
        $this->assertNotNull($captured['signatureMakerPath']);
    }

    public function test_team_pdf_without_any_team_report_renders_dash_maker(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $captured = $this->capturePdfViewData($team, null);

        // Spec decision 4: absent maker renders the em-dash "—", not '-'.
        $this->assertSame('—', $captured['makerName']);
        $this->assertSame('—', $captured['makerNip']);
        $this->assertNull($captured['signatureMakerPath']);
        $this->assertSame(200, $this->getJson("/api/admin/wfh/teams/{$team->id}/pdf?date=".now()->toDateString())->status());
    }

    /** ship#17 (test-engineer gap): the DATE-based lookup path (no
     * `team_report_id`) must resolve the maker from the report for that
     * team+date — the daily board only ever sends a date. */
    public function test_team_pdf_date_path_resolves_maker_from_report(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $creator = User::factory()->create(['team_id' => $team->id, 'name' => 'Pembuat Tanggal']);
        $creator->assignRole('staf');
        $this->setUserSignature($creator);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        // No team_report_id — the date path must find the report above.
        $captured = $this->capturePdfViewData($team, null);

        $this->assertSame('PEMBUAT TANGGAL', $captured['makerName']);
        $this->assertFalse($captured['isApproved']);
        $this->assertSame(200, $this->getJson("/api/admin/wfh/teams/{$team->id}/pdf?date=".now()->toDateString())->status());
    }

    public function test_team_pdf_guard_names_the_creator_when_signature_missing(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $creator = User::factory()->create(['team_id' => $team->id, 'name' => 'Pembuat Laporan']);
        $creator->assignRole('staf');

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $teamReport = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        $response = $this->getJson("/api/admin/wfh/teams/{$team->id}/pdf?team_report_id={$teamReport->id}");

        $response->assertStatus(422);
        $this->assertStringContainsString('Pembuat Laporan', (string) $response->json('message'));
    }

    /**
     * M2: passing another team's approved report id must not stamp THIS PDF as
     * approved — that would attach the field head's signature to a report they
     * never approved.
     */
    public function test_team_pdf_ignores_approved_report_belonging_to_another_team(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $otherTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $kb = User::factory()->create(['team_id' => $team->id]);
        $kb->assignRole('kepala_bidang');
        $field->update(['head_id' => $kb->id]);
        $this->setUserSignature($kb);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);
        Sanctum::actingAs($admin);

        $foreign = WfhTeamReport::factory()->status('approved')->create([
            'team_id' => $otherTeam->id,
            'report_date' => now()->toDateString(),
            'created_by' => $admin->id,
            'supervisor_id' => $kb->id,
        ]);

        $captured = $this->capturePdfViewData($team, $foreign->id);

        $this->assertFalse($captured['isApproved']);
        $this->assertNull($captured['signatureSupervisorPath']);
    }

    /**
     * ship#18: the team PDF now carries the report creator's identity (name,
     * NIP, signature) and, when approved, the field head's signature — data a
     * plain staf must not harvest for a NEIGHBOURING team. The endpoint's only
     * permission gate is wfh.report.export_pdf (which staf hold), so the
     * non-own-team path requires wfh.monitoring.view, mirroring export().
     */
    public function test_staf_without_monitoring_permission_cannot_download_other_teams_pdf(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $otherTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        // staf of Tim B: same bidang, holds wfh.report.export_pdf but NOT
        // wfh.monitoring.view (RolePermissionSeeder staf block).
        $staf = User::factory()->create(['team_id' => $otherTeam->id]);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);
        Sanctum::actingAs($staf);

        $teamReport = WfhTeamReport::factory()->status('approved')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $staf->id,
        ]);

        $this->getJson("/api/admin/wfh/teams/{$team->id}/pdf?team_report_id={$teamReport->id}")
            ->assertForbidden();
    }

    /** ship#18: a staf may still export THEIR OWN team's PDF (the daily board
     * use case) — the monitoring gate applies only to other teams. */
    public function test_staf_can_download_own_teams_pdf(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);
        Sanctum::actingAs($staf);

        $teamReport = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $staf->id,
        ]);

        $captured = $this->capturePdfViewData($team, $teamReport->id);
        $this->assertSame(strtoupper($staf->name), $captured['makerName']);
    }

    /** ship#19: a staf WITH wfh.monitoring.view (e.g. kepala tim path) CAN
     * download a NEIGHBOURING team's PDF. Proves the 403 in the negative test
     * comes from the new gate, not the field guard, and that the gate is not
     * over-tightened for monitoring holders. */
    public function test_staf_with_monitoring_permission_can_download_other_teams_pdf(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $otherTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $staf = User::factory()->create(['team_id' => $otherTeam->id]);
        $staf->assignRole('staf');
        $staf->givePermissionTo('wfh.monitoring.view');
        $this->setUserSignature($staf);
        Sanctum::actingAs($staf);

        // The PDF embeds the MAKER's signature, so the creator needs one.
        $creator = User::factory()->create(['team_id' => $team->id, 'name' => 'Pembuat Tim A']);
        $this->setUserSignature($creator);
        $teamReport = WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $creator->id,
        ]);

        $captured = $this->capturePdfViewData($team, $teamReport->id);
        $this->assertSame('PEMBUAT TIM A', $captured['makerName']);
    }

    public function test_team_report_data_contains_raw_photo_path(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $user = User::factory()->create(['team_id' => $team->id, 'is_active' => true]);

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'attendances/test/photo.jpg',
            'check_in_at' => now(),
        ]);

        $repo = app(WfhRepositoryInterface::class);
        $data = $repo->getTeamReportData($team->id, now()->toDateString());

        $this->assertCount(1, $data);
        $this->assertArrayHasKey('photos', $data[0]);
        $this->assertCount(1, $data[0]['photos']);
        $this->assertArrayHasKey('photo_path', $data[0]['photos'][0]);
        $this->assertSame('attendances/test/photo.jpg', $data[0]['photos'][0]['photo_path']);
    }

    public function test_team_pdf_contains_sessions_data_and_all_members(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $adminTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $adminTeam->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $memberWithPhoto = User::factory()->create([
            'team_id' => $team->id, 'is_active' => true, 'name' => 'User A',
        ]);
        $memberNoPhoto = User::factory()->create([
            'team_id' => $team->id, 'is_active' => true, 'name' => 'User B',
        ]);
        $memberNoData = User::factory()->create([
            'team_id' => $team->id, 'is_active' => true, 'name' => 'User C',
        ]);

        WfhTeamReport::factory()->status('pending')->create([
            'team_id' => $team->id,
            'report_date' => now()->toDateString(),
            'created_by' => $admin->id,
        ]);

        WfhAttendance::create([
            'user_id' => $memberWithPhoto->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => 'attendances/test/pagi.jpg',
            'check_in_at' => now(),
        ]);

        // Fake the public disk: photos are private in production now, and the
        // fixture must never leak bytes into a real storage/app during a run.
        Storage::fake('public');
        Storage::disk('public')->put('attendances/test/pagi.jpg', 'dummy');

        $captured = $this->capturePdfViewData($team, null);

        $this->assertArrayHasKey('sessions', $captured);
        $this->assertCount(3, $captured['staff']);
        $this->assertEqualsCanonicalizing(
            ['USER A', 'USER B', 'USER C'],
            array_column($captured['staff'], 'name'),
        );
        $this->assertCount(3, $captured['sessions']['pagi']);
        $this->assertStringContainsString('pagi.jpg', $captured['sessions']['pagi'][0]['photo'] ?? '');
        $this->assertNull($captured['sessions']['pagi'][1]['photo']);
        $this->assertNull($captured['sessions']['pagi'][2]['photo']);
    }

    public function test_team_pdf_template_renders_documentation_page(): void
    {
        $staff = [
            ['name' => 'USER A', 'nip' => '123', 'links' => ['http://link1']],
            ['name' => 'USER B', 'nip' => '456', 'links' => []],
        ];

        $sessions = [
            'pagi' => [
                ['no' => 1, 'name' => 'USER A', 'photo' => '/path/to/pagi.jpg'],
                ['no' => 2, 'name' => 'USER B', 'photo' => null],
            ],
            'siang' => [
                ['no' => 1, 'name' => 'USER A', 'photo' => null],
                ['no' => 2, 'name' => 'USER B', 'photo' => null],
            ],
            'sore' => [
                ['no' => 1, 'name' => 'USER A', 'photo' => null],
                ['no' => 2, 'name' => 'USER B', 'photo' => null],
            ],
        ];

        $html = view('pdf.wfh-report-admin', [
            'namaTim' => 'Tim Test',
            'unitKerja' => 'Bidang Test',
            'tanggalPelaksanaan' => '25 Juli 2026',
            'staff' => $staff,
            'sessions' => $sessions,
            'isApproved' => false,
            'signatureMakerPath' => null,
            'signatureSupervisorPath' => null,
            'makerName' => 'ADMIN',
            'makerNip' => '789',
            'supervisorName' => 'KB',
            'supervisorNip' => '012',
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ])->render();

        // Page 1: '-' for empty links
        $this->assertStringContainsString('-', $html);

        // Page 2: documentation title
        $this->assertStringContainsString('DOKUMENTASI TIM TIM TEST WORK FROM HOME', $html);
        $this->assertStringContainsString('SESI PAGI', $html);
        $this->assertStringContainsString('SESI SIANG', $html);
        $this->assertStringContainsString('SESI SORE', $html);
        $this->assertStringContainsString('<img', $html);

        // '-' for missing photos
        $this->assertStringContainsString('USER B', $html);
    }

    public function test_team_template_renders_logo_and_no_legal_paragraph(): void
    {
        $html = view('pdf.wfh-report-admin', [
            'namaTim' => 'Tim Test',
            'unitKerja' => 'Bidang Test',
            'tanggalPelaksanaan' => '25 Juli 2026',
            'staff' => [['name' => 'USER A', 'nip' => '1', 'links' => []]],
            'sessions' => ['pagi' => [], 'siang' => [], 'sore' => []],
            'isApproved' => false,
            'signatureMakerPath' => null,
            'signatureSupervisorPath' => null,
            'makerName' => 'ADMIN',
            'makerNip' => '789',
            'supervisorName' => 'KB',
            'supervisorNip' => '012',
            'logoDoc' => PdfImage::dataUri('images/logo-doc.webp'),
        ])->render();

        $this->assertStringContainsString('data:image/webp;base64,', $html);
        $this->assertStringContainsString('DINAS KOMUNIKASI DAN INFORMATIKA', $html);
        $this->assertStringNotContainsString('ditandatangani secara elektronik', $html);
        $this->assertStringNotContainsString('LOGO<br>', $html);
    }

    public function test_team_pdf_sessions_all_keys_present_with_multiple_attendance(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $adminTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $adminTeam->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);
        $this->setUserSignature($admin);

        $member1 = User::factory()->create([
            'team_id' => $team->id, 'is_active' => true, 'name' => 'User A',
        ]);
        $member2 = User::factory()->create([
            'team_id' => $team->id, 'is_active' => true, 'name' => 'User B',
        ]);

        // member1: attendance pagi + siang, no sore
        foreach (['pagi', 'siang'] as $session) {
            WfhAttendance::create([
                'user_id' => $member1->id,
                'date' => now()->toDateString(),
                'session' => $session,
                'photo_path' => "attendances/test/{$session}.jpg",
                'check_in_at' => now(),
            ]);
        }

        // Fake the public disk: photos are private in production now, and the
        // fixture must never leak bytes into a real storage/app during a run.
        Storage::fake('public');
        foreach (['pagi', 'siang'] as $session) {
            Storage::disk('public')->put("attendances/test/{$session}.jpg", 'dummy');
        }

        $captured = $this->capturePdfViewData($team, null);

        // All 3 session keys present
        $this->assertArrayHasKey('pagi', $captured['sessions']);
        $this->assertArrayHasKey('siang', $captured['sessions']);
        $this->assertArrayHasKey('sore', $captured['sessions']);

        // Each session has 2 entries (2 team members)
        $this->assertCount(2, $captured['sessions']['pagi']);
        $this->assertCount(2, $captured['sessions']['siang']);
        $this->assertCount(2, $captured['sessions']['sore']);

        // member1 (index 0) has photo in pagi + siang, null in sore
        $this->assertStringContainsString('pagi.jpg', $captured['sessions']['pagi'][0]['photo'] ?? '');
        $this->assertStringContainsString('siang.jpg', $captured['sessions']['siang'][0]['photo'] ?? '');
        $this->assertNull($captured['sessions']['sore'][0]['photo']);

        // member2 (index 1) has no attendance → all null
        $this->assertNull($captured['sessions']['pagi'][1]['photo']);
        $this->assertNull($captured['sessions']['siang'][1]['photo']);
        $this->assertNull($captured['sessions']['sore'][1]['photo']);
    }

    public function test_team_pdf_sessions_all_null_when_no_attendance(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $adminTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $adminTeam->id]);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);
        Sanctum::actingAs($admin);

        User::factory()->count(2)->create([
            'team_id' => $team->id, 'is_active' => true,
        ]);

        $captured = $this->capturePdfViewData($team, null);

        // All session entries have null photo
        foreach (['pagi', 'siang', 'sore'] as $session) {
            foreach ($captured['sessions'][$session] as $entry) {
                $this->assertNull($entry['photo']);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function capturePdfViewData(Team $team, ?int $teamReportId): array
    {
        /** @var array<string, mixed> $captured */
        $captured = [];
        View::composer('pdf.wfh-report-admin', function ($view) use (&$captured) {
            $captured = $view->getData();
        });

        $url = "/api/admin/wfh/teams/{$team->id}/pdf";
        if ($teamReportId) {
            $url .= "?team_report_id={$teamReportId}";
        }

        $this->getJson($url)->assertStatus(200);

        return $captured;
    }
}
