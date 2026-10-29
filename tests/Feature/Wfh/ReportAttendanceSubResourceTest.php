<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
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

    private function createDraftReport(User $user, string $date = '2026-07-28'): WfhReport
    {
        return WfhReport::create([
            'user_id' => $user->id,
            'report_date' => $date,
            'status' => 'draft',
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

        $report = WfhReport::create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
            'status' => 'approved',
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

        $report = WfhReport::create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
            'status' => 'approved',
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
