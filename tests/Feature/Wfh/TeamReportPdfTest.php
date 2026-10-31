<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
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
