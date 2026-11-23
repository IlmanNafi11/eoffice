<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Rejected is terminal: "Buat Laporan" for the same date must produce a NEW
 * draft (never resurrect the rejected report), the rejected report's live
 * attendances move to the new report (they belong to user+date+session), a
 * conflicting session upload is skipped with its orphan photo deleted, and
 * the rejected report itself rejects every mutation (Task 2 / design #3).
 */
class RejectedReportRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $this->user = User::factory()->create();
        $this->user->assignRole('staf');
        Sanctum::actingAs($this->user);
    }

    private function rejectedReportWithAttendance(string $date, string $session = 'pagi'): WfhReport
    {
        $report = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => $date,
        ]);

        WfhAttendance::create([
            'user_id' => $this->user->id,
            'date' => $date,
            'session' => $session,
            'report_id' => $report->id,
            'photo_path' => "attendances/{$this->user->id}/{$date}/old-{$session}.jpg",
            'check_in_at' => now(),
        ]);

        return $report;
    }

    public function test_store_after_reject_creates_new_draft_not_rejected(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $rejected = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-28',
        ]);

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);

        $response->assertStatus(201);
        $this->assertNotSame($rejected->id, $response->json('data.id'));
        $this->assertDatabaseCount('wfh_reports', 2);
        $this->assertDatabaseHas('wfh_reports', ['id' => $rejected->id, 'status' => 'rejected']);
        $this->assertDatabaseHas('wfh_reports', ['id' => $response->json('data.id'), 'status' => 'draft']);
    }

    public function test_new_report_inherits_rejected_attendances(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $rejected = $this->rejectedReportWithAttendance('2026-07-28', 'pagi');

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);

        $response->assertStatus(201);
        $newId = $response->json('data.id');

        $sessions = collect($response->json('data.attendances'))->pluck('session');
        $this->assertContains('pagi', $sessions);

        // The moved attendance now belongs to the new report, with the same photo.
        $moved = WfhAttendance::query()
            ->where('user_id', $this->user->id)
            ->where('date', '2026-07-28')
            ->where('session', 'pagi')
            ->firstOrFail();
        $this->assertSame($newId, $moved->report_id);
        $this->assertSame("attendances/{$this->user->id}/2026-07-28/old-pagi.jpg", $moved->photo_path);

        // The rejected report no longer owns any attendance.
        $this->assertSame(0, WfhAttendance::query()->where('report_id', $rejected->id)->count());
    }

    public function test_conflicting_session_photo_on_recovery_is_skipped(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        Storage::fake('local');

        $this->rejectedReportWithAttendance('2026-07-28', 'pagi');

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('foto.jpg')],
            ],
        ]);

        $response->assertStatus(201);

        // Exactly one pagi attendance survives — the moved one, with the old photo.
        $rows = WfhAttendance::query()
            ->where('user_id', $this->user->id)
            ->where('date', '2026-07-28')
            ->where('session', 'pagi')
            ->get();
        $this->assertCount(1, $rows);
        $this->assertSame(
            "attendances/{$this->user->id}/2026-07-28/old-pagi.jpg",
            $rows[0]->photo_path,
        );

        // The fresh upload was stored before the conflict check, so it must
        // be deleted: the fake disk holds no file at that path.
        $uploadedPath = "attendances/{$this->user->id}/2026-07-28";
        $this->assertSame(
            [],
            array_filter(
                Storage::disk('local')->allFiles($uploadedPath),
                fn (string $path) => ! str_contains($path, 'old-pagi.jpg'),
            ),
            'Orphan upload kept on local disk.',
        );
    }

    public function test_rejected_report_rejects_mutation(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $rejected = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-28',
        ]);

        $this->putJson("/api/wfh/reports/{$rejected->id}", [
            'report_date' => '2026-07-29',
        ])->assertStatus(422);

        $this->deleteJson("/api/wfh/reports/{$rejected->id}")->assertStatus(422);

        $this->postJson("/api/wfh/reports/{$rejected->id}/submit")->assertStatus(422);

        // Approve needs a role holding wfh.report.approve plus a supervisor
        // in the same bidang; the state-machine pending guard is what this
        // assertion targets.
        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $this->user->update(['team_id' => $team->id]);
        $this->user->assignRole('kepala_bidang');
        $field->update(['head_id' => $this->user->id]);

        $this->postJson("/api/wfh/reports/{$rejected->id}/approve")->assertStatus(422);
    }
}
