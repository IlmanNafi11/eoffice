<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportAttendanceSubResourceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createDraftReport(User $user, string $date = '2026-07-28'): WfhReport
    {
        return WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => $date,
        ]);
    }

    // === STORE ===

    public function test_append_attendance_on_draft_report(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(201);
        $response->assertJsonStructure([
            'success',
            'message',
            'data' => ['id', 'date', 'session', 'photo_url', 'check_in_at'],
        ]);
        $response->assertJson([
            'success' => true,
            'message' => 'Absensi WFH berhasil.',
        ]);

        $this->assertDatabaseHas('wfh_attendances', [
            'report_id' => $report->id,
            'user_id' => $user->id,
            'session' => 'pagi',
            'date' => '2026-07-28',
        ]);
    }

    public function test_append_attendance_rejects_backdated_report_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // report_date is yesterday — different from today
        $report = $this->createDraftReport($user, '2026-07-27');

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(422);
    }

    public function test_append_attendance_rejects_duplicate_session(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        // Create first attendance
        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => '2026-07-28',
            'session' => 'pagi',
            'report_id' => $report->id,
            'photo_path' => 'attendances/test.jpg',
            'check_in_at' => now(),
        ]);

        // Try duplicate session
        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(422);
    }

    public function test_append_attendance_on_approved_report_returns_422(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(422);
    }

    public function test_append_attendance_on_others_report_returns_403(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $other = User::factory()->create();
        $report = $this->createDraftReport($other, '2026-07-28');

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(403);
    }

    public function test_append_attendance_with_invalid_session_returns_422(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'malam',
        ]);

        $response->assertStatus(422);
    }

    public function test_attendance_photo_wrong_extension_gets_indonesian_message(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        // GIF adalah gambar valid, jadi `image` lolos dan `mimes` yang menolak
        // (spec upload-errors S8: pesan Indonesia, bukan default Inggris).
        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.gif'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('errors.photo.0', 'Format foto harus JPG, JPEG, atau PNG.');
    }

    public function test_attendance_photo_oversize_gets_indonesian_message(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        // 3MB > max:2048KB — pesan kustom server terkunci (ship #13: pesan
        // `photo.max` sebelumnya tanpa test, drift copy tidak terdeteksi).
        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->create('foto.png', 3 * 1024, 'image/png'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('errors.photo.0', 'Ukuran foto maksimal 2MB.');
    }

    /**
     * The attendance endpoint must resize once at write time: a 2400x1800
     * photo would otherwise be decompressed to ~16 MB per PDF cell.
     */
    public function test_append_attendance_stores_photo_with_longest_side_capped_at_600px(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user, '2026-07-28');

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => $this->largePhoto('jpg'),
            'session' => 'pagi',
        ]);

        $response->assertStatus(201);

        $attendance = WfhAttendance::query()->firstOrFail();
        $this->assertMatchesRegularExpression(
            '#^attendances/'.$user->id.'/2026-07-28/[^/]+\.jpg$#',
            $attendance->photo_path,
        );
        $info = getimagesizefromstring((string) Storage::disk('local')->get($attendance->photo_path));
        $this->assertIsArray($info);
        $this->assertLessThanOrEqual(600, max($info[0], $info[1]));
    }

    public function test_append_rejects_decode_bomb_with_422(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);
        $report = $this->createDraftReport($user, '2026-07-28');

        $bytes = "\x89PNG\r\n\x1a\n"
            .pack('N', 13).'IHDR'
            .pack('N', 5000).pack('N', 5000)
            .chr(8).chr(2).chr(0).chr(0).chr(0)
            .pack('N', 0);

        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->createWithContent('bomb.png', $bytes),
            'session' => 'pagi',
        ])->assertStatus(422)->assertJsonPath('errors.photo.0', 'Gambar terlalu besar untuk diproses.');

        $this->assertDatabaseCount('wfh_attendances', 0);
    }

    public function test_append_stores_valid_image_after_resize(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);
        $report = $this->createDraftReport($user, '2026-07-28');

        $file = $this->largePhoto('jpg');
        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => $file,
            'session' => 'pagi',
        ]);
        $response->assertStatus(201);

        $attendance = WfhAttendance::query()->firstOrFail();
        Storage::disk('local')->assertExists($attendance->photo_path);
    }

    public function test_duplicate_session_does_not_leave_an_orphan_photo(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);
        $report = $this->createDraftReport($user, '2026-07-28');

        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('first.jpg'),
            'session' => 'pagi',
        ])->assertStatus(201);

        $before = Storage::disk('local')->allFiles('attendances/'.$user->id);

        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('duplicate.jpg'),
            'session' => 'pagi',
        ])->assertStatus(422);

        $this->assertSame($before, Storage::disk('local')->allFiles('attendances/'.$user->id));
    }

    private function largePhoto(string $extension): UploadedFile
    {
        $gd = imagecreatetruecolor(2400, 1800);
        imagefill($gd, 0, 0, imagecolorallocate($gd, 30, 90, 160));
        imagefilledrectangle($gd, 100, 100, 500, 400, imagecolorallocate($gd, 230, 40, 40));

        ob_start();
        match ($extension) {
            'jpg' => imagejpeg($gd, null, 85),
            'png' => imagepng($gd, null, 6),
        };
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);

        return UploadedFile::fake()->createWithContent("foto.{$extension}", $bytes);
    }

    // === DELETE ===

    public function test_delete_attendance_on_draft_report(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $attendance = WfhAttendance::create([
            'user_id' => $user->id,
            'date' => '2026-07-28',
            'session' => 'pagi',
            'report_id' => $report->id,
            'photo_path' => 'attendances/test.jpg',
            'check_in_at' => now(),
        ]);

        $response = $this->deleteJson("/api/wfh/reports/{$report->id}/attendances/{$attendance->id}");

        $response->assertNoContent();
        $this->assertSoftDeleted($attendance);
    }

    public function test_delete_attendance_cross_report_returns_404(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = $this->createDraftReport($user);
        $otherReport = $this->createDraftReport($user, '2026-07-27');
        $attendance = WfhAttendance::create([
            'user_id' => $user->id,
            'date' => '2026-07-27',
            'session' => 'pagi',
            'report_id' => $otherReport->id,
            'photo_path' => 'attendances/test.jpg',
            'check_in_at' => now(),
        ]);

        // attendance belongs to $otherReport, not $report
        $response = $this->deleteJson("/api/wfh/reports/{$report->id}/attendances/{$attendance->id}");

        // Route binding scoped to report — cross-report should 404
        $response->assertStatus(404);
    }

    public function test_delete_attendance_on_approved_report_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);
        $attendance = WfhAttendance::create([
            'user_id' => $user->id,
            'date' => '2026-07-28',
            'session' => 'pagi',
            'report_id' => $report->id,
            'photo_path' => 'attendances/test.jpg',
            'check_in_at' => now(),
        ]);

        $response = $this->deleteJson("/api/wfh/reports/{$report->id}/attendances/{$attendance->id}");

        $response->assertStatus(422);
    }
}
