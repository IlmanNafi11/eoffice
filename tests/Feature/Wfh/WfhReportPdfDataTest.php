<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Models\WfhReportLink;
use App\Domains\Wfh\Services\WfhReportPdfData;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WfhReportPdfDataTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_wfh_report_pdf_view_data_has_exact_keys(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($staf);

        $captured = $this->captureReportViewData($report);

        $this->assertEqualsCanonicalizing($this->reportKeys(), array_keys($captured));
    }

    public function test_wfh_report_admin_pdf_view_data_has_exact_keys(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $adminTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $adminTeam->id]);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);

        Sanctum::actingAs($admin);

        $captured = $this->captureAdminViewData($team);

        $this->assertEqualsCanonicalizing($this->adminKeys(), array_keys($captured));
    }

    public function test_report_builder_returns_the_exact_view_data_keys(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id, 'name' => 'Budi Santoso']);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'pending',
        ]);

        $activity = WfhReportActivity::create([
            'wfh_report_id' => $report->id,
            'start_time' => '08:00',
            'end_time' => '09:00',
            'activity' => 'Menyusun laporan',
            'sort_order' => 1,
        ]);
        WfhReportLink::create([
            'wfh_report_activity_id' => $activity->id,
            'url' => 'https://example.test/doc',
            'sort_order' => 1,
        ]);

        $data = app(WfhReportPdfData::class)->forReport(
            $report->load(['activities.links', 'user.team', 'supervisor'])
        );

        $this->assertEqualsCanonicalizing($this->reportKeys(), array_keys($data));
        $this->assertSame('Budi Santoso', $data['nama']);
        $this->assertSame('BUDI SANTOSO', $data['makerName']);
        $this->assertSame('Bidang Test', $data['unitKerja']);
        $this->assertFalse($data['isApproved']);
        $this->assertNull($data['qrSvg']);
        $this->assertNull($data['signatureSupervisorPath']);
        $this->assertSame(
            [[
                // start_time/end_time are datetime casts, so the rendered value
                // carries whatever date the row was written on. Derive it from
                // the persisted row instead of hard-coding today's date, which
                // made this test expire at midnight.
                'waktu' => $activity->fresh()->start_time->format('Y-m-d H:i:s')
                    .' – '.$activity->fresh()->end_time->format('Y-m-d H:i:s'),
                'kegiatan' => 'Menyusun laporan',
                'links' => ['https://example.test/doc'],
            ]],
            $data['kegiatan'],
        );
    }

    public function test_report_builder_sets_qr_code_only_for_approved_reports(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);

        $supervisor = User::factory()->create(['team_id' => $team->id]);
        $this->setUserSignature($supervisor);

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'approved',
            'supervisor_id' => $supervisor->id,
            'verification_token' => 'tok-123',
        ]);

        $data = app(WfhReportPdfData::class)->forReport(
            $report->load(['activities.links', 'user.team', 'supervisor'])
        );

        $this->assertTrue($data['isApproved']);
        $this->assertNotNull($data['qrSvg']);
        $this->assertNotNull($data['signatureSupervisorPath']);
    }

    public function test_team_builder_returns_the_exact_view_data_keys(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $adminTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim Admin']);
        $admin = User::factory()->create(['team_id' => $adminTeam->id, 'name' => 'Admin Example']);
        $admin->assignRole('admin');
        $this->setUserSignature($admin);

        $data = app(WfhReportPdfData::class)->forTeam(
            team: $team,
            admin: $admin,
            head: null,
            date: now()->toDateString(),
            isApproved: false,
        );

        $this->assertEqualsCanonicalizing($this->adminKeys(), array_keys($data));
        $this->assertSame('Tim Test', $data['namaTim']);
        $this->assertSame('Bidang Test', $data['unitKerja']);
        $this->assertSame('ADMIN EXAMPLE', $data['makerName']);
        $this->assertFalse($data['isApproved']);
        $this->assertNull($data['signatureSupervisorPath']);
        $this->assertSame(['pagi', 'siang', 'sore'], array_keys($data['sessions']));
    }

    /**
     * @return array<int, string>
     */
    private function reportKeys(): array
    {
        return [
            'nama',
            'nip',
            'pangkat',
            'jabatan',
            'unitKerja',
            'tanggalPelaksanaan',
            'kegiatan',
            'isApproved',
            'signatureMakerPath',
            'signatureSupervisorPath',
            'makerName',
            'makerNip',
            'supervisorName',
            'supervisorNip',
            'qrSvg',
        ];
    }

    /**
     * @return array<int, string>
     */
    private function adminKeys(): array
    {
        return [
            'namaTim',
            'unitKerja',
            'tanggalPelaksanaan',
            'staff',
            'sessions',
            'isApproved',
            'signatureMakerPath',
            'signatureSupervisorPath',
            'makerName',
            'makerNip',
            'supervisorName',
            'supervisorNip',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function captureReportViewData(WfhReport $report): array
    {
        /** @var array<string, mixed> $captured */
        $captured = [];
        View::composer('pdf.wfh-report', function ($view) use (&$captured) {
            $captured = $view->getData();
        });

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")->assertStatus(200);

        return $captured;
    }

    /**
     * @return array<string, mixed>
     */
    private function captureAdminViewData(Team $team): array
    {
        /** @var array<string, mixed> $captured */
        $captured = [];
        View::composer('pdf.wfh-report-admin', function ($view) use (&$captured) {
            $captured = $view->getData();
        });

        $this->getJson("/api/admin/wfh/teams/{$team->id}/pdf")->assertStatus(200);

        return $captured;
    }

    public function test_personal_pdf_export_does_not_lazy_load_team_field(): void
    {
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $staf = User::factory()->create(['team_id' => $team->id]);
        $staf->assignRole('staf');
        $this->setUserSignature($staf);

        $report = WfhReport::factory()->create([
            'user_id' => $staf->id,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($staf);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->getJson("/api/wfh/reports/{$report->id}/pdf")->assertStatus(200);

        // A lazy BelongsTo read is `... where "fields"."id" = ? ... limit 1`;
        // an eager load batches with `where "fields"."id" in (...)`. Only the
        // former is the hidden per-export query this task removes.
        $lazyFieldReads = 0;
        foreach (DB::getQueryLog() as $entry) {
            $query = strtolower(ltrim($entry['query']));
            if (str_starts_with($query, 'select * from "fields"') && str_contains($query, 'limit 1')) {
                $lazyFieldReads++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(
            0,
            $lazyFieldReads,
            'PDF export must eager-load user.team.field, not lazy-load it.'
        );
    }
}
