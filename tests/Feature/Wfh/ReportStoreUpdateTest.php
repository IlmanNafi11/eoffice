<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
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

    public function test_store_rejects_draft_when_approved_locks_the_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Approved is final: it locks the date for any further report until a
        // rejection reopens it (owner decision 2026-11-28). The 23505 → 4xx
        // mapping is Task 6; this test pins the lock itself.
        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);

        $this->assertNotSame(201, $response->status(), $response->getContent());
        $this->assertDatabaseCount('wfh_reports', 1);
    }

    /** Task 6: a 23505 from the date lock must surface as a domain answer,
     *  never a 500. Pending means the supervisor still has to decide. */
    public function test_store_with_pending_lock_returns_422_waiting_message(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $response->assertJsonPath(
            'message',
            'Masih ada laporan WFH pada tanggal ini yang menunggu keputusan atasan.',
        );
        $this->assertDatabaseCount('wfh_reports', 1);
    }

    /** Approved is final (owner decision 2026-11-28): the message must say so
     *  and differ from the pending one. */
    public function test_store_with_approved_lock_returns_422_final_message(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $response->assertJsonPath(
            'message',
            'Laporan WFH pada tanggal ini sudah final dan tidak dapat dibuat ulang.',
        );
        $this->assertDatabaseCount('wfh_reports', 1);
    }

    /** Moving a draft onto a locked date must fail with 422 and leave the
     *  report on its original date. */
    public function test_update_to_locked_date_returns_422_and_keeps_original_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-27',
        ]);
        $reportId = $create->json('data.id');

        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => '2026-07-28',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath(
            'message',
            'Laporan WFH pada tanggal ini sudah final dan tidak dapat dibuat ulang.',
        );
        $this->assertSame('2026-07-27', WfhReport::find($reportId)->report_date->format('Y-m-d'));
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

    /**
     * The create-report path must resize once at write time, just like the
     * append-attendance endpoint: a 2400x1800 photo otherwise decompresses to
     * ~16 MB per PDF cell. The evidence path contract must not change.
     */
    public function test_store_attendance_photo_with_longest_side_capped_at_600px(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $date = '2026-07-28';
        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => $date,
            'attendances' => [
                'pagi' => ['photo' => $this->largePhoto()],
            ],
        ]);

        $response->assertStatus(201);

        $path = DB::table('wfh_attendances')->value('photo_path');
        $this->assertMatchesRegularExpression(
            '#^attendances/'.$user->id.'/'.$date.'/[^/]+\.jpg$#',
            $path,
        );
        $info = getimagesizefromstring((string) Storage::disk('local')->get($path));
        $this->assertIsArray($info);
        $this->assertLessThanOrEqual(600, max($info[0], $info[1]));
    }

    public function test_store_rejects_decode_bomb_with_422_and_no_partial_write(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => $this->decodeBomb()],
            ],
        ]);
        $response->assertStatus(422);
        $this->assertContains(
            'Gambar terlalu besar untuk diproses.',
            collect($response->json('errors'))->flatten()->all(),
        );

        $this->assertDatabaseCount('wfh_reports', 0);
        $this->assertSame([], Storage::disk('local')->allFiles('attendances/'.$user->id));
    }

    public function test_store_multi_session_resizes_every_photo(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => $this->largePhoto()],
                'siang' => ['photo' => $this->largePhoto()],
                'sore' => ['photo' => $this->largePhoto()],
            ],
        ])->assertStatus(201);

        foreach (DB::table('wfh_attendances')->pluck('photo_path') as $path) {
            $info = getimagesizefromstring((string) Storage::disk('local')->get($path));
            $this->assertLessThanOrEqual(600, max($info[0], $info[1]));
        }
        $this->assertSame(3, DB::table('wfh_attendances')->count());
    }

    public function test_store_keeps_resized_photos_on_the_private_disk(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => $this->largePhoto()],
            ],
        ])->assertStatus(201);

        $path = DB::table('wfh_attendances')->value('photo_path');
        Storage::disk('public')->assertMissing($path);
        Storage::disk('local')->assertExists($path);
    }

    private function largePhoto(): UploadedFile
    {
        $gd = imagecreatetruecolor(2400, 1800);
        imagefill($gd, 0, 0, imagecolorallocate($gd, 30, 90, 160));
        imagefilledrectangle($gd, 100, 100, 500, 400, imagecolorallocate($gd, 230, 40, 40));

        ob_start();
        imagejpeg($gd, null, 85);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);

        return UploadedFile::fake()->createWithContent('foto.jpg', $bytes);
    }

    private function decodeBomb(): UploadedFile
    {
        $bytes = "\x89PNG\r\n\x1a\n"
            .pack('N', 13).'IHDR'
            .pack('N', 5000).pack('N', 5000)
            .chr(8).chr(2).chr(0).chr(0).chr(0)
            .pack('N', 0);

        return UploadedFile::fake()->createWithContent('bomb.png', $bytes);
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

    /** Ship review #25: moving a draft to another date must carry its
     *  attendance rows along — the row's `date` is the report's date by
     *  invariant (the copy path already re-dates copied rows). Without the
     *  sync, (user, date) lookups miss the evidence and monitoring/PDF render
     *  it on the wrong day. */
    public function test_update_moving_date_resyncs_attendance_dates(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('pagi.jpg')],
            ],
        ]);
        $reportId = $create->json('data.id');
        $attendanceId = DB::table('wfh_attendances')->where('report_id', $reportId)->value('id');

        $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => '2026-07-27',
        ])->assertStatus(200);

        $attendance = DB::table('wfh_attendances')->find($attendanceId);
        $this->assertSame('2026-07-27', $attendance->date, 'Attendance date must follow the report date.');
    }

    /** Ship review #25: the pending branch of the date-lock answer through
     *  the PUT savepoint path — the report must stay on its original date. */
    public function test_update_to_pending_locked_date_returns_422_and_keeps_original_date(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $create = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-27',
        ]);
        $reportId = $create->json('data.id');

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->putJson("/api/wfh/reports/{$reportId}", [
            'report_date' => '2026-07-28',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath(
            'message',
            'Masih ada laporan WFH pada tanggal ini yang menunggu keputusan atasan.',
        );
        $this->assertSame('2026-07-27', WfhReport::find($reportId)->report_date->format('Y-m-d'));
    }
}
