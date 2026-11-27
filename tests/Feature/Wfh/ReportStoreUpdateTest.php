<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportStoreUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    // === Get-or-create ===

    public function test_second_store_same_date_returns_existing_draft(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $first = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);
        $first->assertStatus(201);
        $firstId = $first->json('data.id');

        // Second call same (user, date) — should return same report
        $second = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);
        $second->assertStatus(200);
        $this->assertEquals($firstId, $second->json('data.id'));

        // Only one report in DB
        $this->assertDatabaseCount('wfh_reports', 1);
    }

    public function test_store_creates_new_when_no_existing_draft(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ])->assertStatus(201);

        $this->assertDatabaseCount('wfh_reports', 1);
    }

    /** M1: a client-supplied status must never skip the submit flow. */
    public function test_store_ignores_client_supplied_status(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-29',
            'status' => 'approved',
        ])->assertStatus(201);

        $this->assertSame('draft', WfhReport::sole()->status);
    }

    public function test_store_allows_draft_and_approved_same_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Create approved report
        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        // Creating a draft for same date should still work (get-or-create returns existing draft,
        // but here no draft exists — creates a new one)
        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ])->assertStatus(201);

        $this->assertDatabaseCount('wfh_reports', 2);
    }

    // === PUT metadata-only ===

    public function test_update_metadata_only_ignores_activities_attendances(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Create report with activities via POST
        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Task A', 'start_time' => '08:00', 'end_time' => '10:00'],
                ['activity' => 'Task B', 'start_time' => '13:00', 'end_time' => '15:00'],
            ],
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('pagi.jpg')],
            ],
        ]);
        $response->assertStatus(201);

        $reportId = $response->json('data.id');

        // PUT with different activities/attendances — should NOT replace existing ones
        $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Should be ignored'],
            ],
        ])->assertStatus(200);

        $report = WfhReport::withCount(['activities', 'attendances'])->find($reportId);
        $this->assertEquals(2, $report->activities_count, 'Activities should be unchanged');
        $this->assertEquals(1, $report->attendances_count, 'Attendances should be unchanged');
    }

    public function test_update_nonexistent_report_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->putJson('/api/wfh/reports/99999', [
            'report_date' => now()->toDateString(),
        ])->assertStatus(404);
    }

    public function test_update_does_not_allow_status_change_via_put(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
        ]);
        $reportId = $create->json('data.id');

        // Attempt to self-approve via PUT — status must be ignored.
        $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => now()->toDateString(),
            'status' => 'approved',
        ])->assertStatus(200);

        $this->assertSame('draft', WfhReport::find($reportId)->status);
    }

    public function test_store_rejects_future_report_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => now()->addYear()->toDateString(),
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['report_date']);
    }

    public function test_store_rejects_absurdly_old_report_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2019-12-31',
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['report_date']);
    }

    /** Ship review: `url` menerima skema berbahaya yang lolos
     *  FILTER_VALIDATE_URL (`file://host/...`, `about://` — terverifikasi lolos
     *  `Str::isUrl`) dan tautan dirender ke `href` di halaman detail laporan
     *  tim, jadi skema dibatasi https di boundary, selaras dengan
     *  StoreActivityRequest. */
    public function test_store_rejects_non_https_bulk_link_with_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                [
                    'activity' => 'Kerja lapangan',
                    'links' => ['file://host/etc/passwd'],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['activities.0.links.0']);
    }

    public function test_store_accepts_https_bulk_link(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                [
                    'activity' => 'Kerja lapangan',
                    'links' => ['https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12'],
                ],
            ],
        ])->assertStatus(201);
    }

    /** Ship review #22: `http://` (non-s) juga ditolak — bukan hanya skema
     *  eksotis; pesan validasi mengarah ke tautan yang sama. */
    public function test_store_rejects_http_bulk_link_with_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                [
                    'activity' => 'Kerja lapangan',
                    'links' => ['http://intranet.kominfo.go.id/wfh'],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['activities.0.links.0']);
    }

    /** Ship review #22: `starts_with:https://` peka huruf besar-kecil —
     *  `HTTPS://` tidak lolos (perilaku validator, dipin agar tidak berubah
     *  diam-diam). */
    public function test_store_rejects_uppercase_https_bulk_link(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                [
                    'activity' => 'Kerja lapangan',
                    'links' => ['HTTPS://git.kominfo.go.id/x'],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['activities.0.links.0']);
    }

    /** Ship #23: `activities.*.links` harus berbentuk array — tanpa aturan
     *  `array` di sini, nilai skalar/array asosiatif melewati `url` dan gagal
     *  dengan pesan "format tautan tidak valid" yang menyesatkan (asimetri
     *  dengan StoreActivityRequest yang mempertahankan aturan `array`). */
    public function test_store_rejects_scalar_links_with_array_error(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                [
                    'activity' => 'Kerja lapangan',
                    'links' => 'https://git.kominfo.go.id/not-an-array',
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['activities.0.links']);
    }
}
