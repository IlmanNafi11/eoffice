<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Models\WfhReportLink;
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
 * Rejected is terminal and its rows are archive: "Buat Laporan" for the same
 * date creates a NEW draft that RECEIVES COPIES of the rejected report's
 * activities, links, attendances and photo bytes. Nothing is moved, nothing
 * on the rejected report changes, and re-running create never duplicates.
 */
class RejectedReportCorrectionTest extends TestCase
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

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * A rejected report with one activity (two links) and one attendance whose
     * photo bytes exist on the private disk.
     */
    private function rejectedReportWithArchiveData(string $date, string $session = 'pagi'): WfhReport
    {
        $report = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => $date,
        ]);

        $activity = $report->activities()->create([
            'start_time' => '08:00',
            'end_time' => '10:00',
            'activity' => 'Menyusun laporan harian',
            'sort_order' => 0,
        ]);

        $activity->links()->createMany([
            ['url' => 'https://example.com/dokumen-a', 'sort_order' => 0],
            ['url' => 'https://example.com/dokumen-b', 'sort_order' => 1],
        ]);

        $photoPath = "attendances/{$this->user->id}/{$date}/old-{$session}.jpg";
        Storage::disk('local')->put($photoPath, 'photo-bytes');

        WfhAttendance::create([
            'user_id' => $this->user->id,
            'date' => $date,
            'session' => $session,
            'report_id' => $report->id,
            'photo_path' => $photoPath,
            'check_in_at' => Carbon::parse("{$date} 07:15:00"),
        ]);

        return $report->fresh(['activities.links', 'attendances']);
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

    public function test_correction_draft_copies_rejected_activities_and_links(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $this->rejectedReportWithArchiveData('2026-07-28');

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);

        $response->assertStatus(201);
        $newId = $response->json('data.id');

        $activities = WfhReportActivity::query()
            ->where('wfh_report_id', $newId)
            ->with('links')
            ->orderBy('sort_order')
            ->get();

        $this->assertCount(1, $activities);
        $this->assertSame('Menyusun laporan harian', $activities[0]->activity);
        $this->assertSame('08:00', $activities[0]->start_time->format('H:i'));
        $this->assertSame('10:00', $activities[0]->end_time->format('H:i'));
        $this->assertSame(0, $activities[0]->sort_order);

        $this->assertSame(
            ['https://example.com/dokumen-a', 'https://example.com/dokumen-b'],
            $activities[0]->links->pluck('url')->all(),
        );
        $this->assertSame([0, 1], $activities[0]->links->pluck('sort_order')->all());

        // Copied rows are new rows, never shared with the archive.
        $sourceIds = WfhReportLink::query()
            ->where('wfh_report_activity_id', '!=', $activities[0]->id)
            ->pluck('id');
        $this->assertCount(2, $sourceIds, 'The rejected report must still own its two links.');
    }

    public function test_correction_draft_copies_attendance_rows_and_photo_bytes(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $rejected = $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);

        $response->assertStatus(201);
        $newId = $response->json('data.id');

        $copied = WfhAttendance::query()
            ->where('report_id', $newId)
            ->where('session', 'pagi')
            ->sole();

        // Evidence timestamps survive the copy (design decision #8).
        $this->assertSame('2026-07-28', $copied->date->format('Y-m-d'));
        $this->assertSame('07:15', $copied->check_in_at->format('H:i'));

        // Photo bytes are copied onto the private disk under the new row's own
        // path, so deleting one report's evidence cannot blank the other.
        $this->assertNotSame(
            $rejected->attendances->first()->photo_path,
            $copied->photo_path,
        );
        $this->assertTrue(Storage::disk('local')->exists($copied->photo_path));
        $this->assertSame('photo-bytes', Storage::disk('local')->get($copied->photo_path));

        // Response exposes the copy on the new draft.
        $sessions = collect($response->json('data.attendances'))->pluck('session');
        $this->assertContains('pagi', $sessions);
    }

    public function test_rejected_report_keeps_its_archive_after_correction(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $rejected = $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');

        $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28'])->assertStatus(201);

        $source = $rejected->fresh(['activities.links', 'attendances']);

        $this->assertSame('rejected', $source->status);
        $this->assertCount(1, $source->activities);
        $this->assertCount(2, $source->activities[0]->links);
        $this->assertCount(1, $source->attendances);
        $this->assertSame('pagi', $source->attendances[0]->session);
        $this->assertTrue(
            Storage::disk('local')->exists($source->attendances[0]->photo_path),
            'The archive photo must not be deleted by the copy.',
        );
    }

    public function test_recreate_returns_existing_draft_without_duplicating_copies(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');

        $first = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);
        $first->assertStatus(201);

        $second = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);
        $second->assertOk();
        $second->assertJsonPath('message', 'Laporan WFH sudah ada.');
        $this->assertSame($first->json('data.id'), $second->json('data.id'));

        $this->assertSame(1, WfhReportActivity::query()->where('wfh_report_id', $first->json('data.id'))->count());
        $this->assertSame(1, WfhAttendance::query()->where('report_id', $first->json('data.id'))->count());
    }

    public function test_explicit_activities_are_not_overwritten_by_prefill(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $this->rejectedReportWithArchiveData('2026-07-28');

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'activities' => [
                ['start_time' => '13:00', 'end_time' => '15:00', 'activity' => 'Rapat koordinasi'],
            ],
        ]);

        $response->assertStatus(201);

        $activities = WfhReportActivity::query()
            ->where('wfh_report_id', $response->json('data.id'))
            ->get();

        $this->assertCount(1, $activities);
        $this->assertSame('Rapat koordinasi', $activities[0]->activity);
    }

    public function test_conflicting_session_photo_on_correction_deletes_orphan_upload(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        Storage::fake('local');

        $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('foto.jpg')],
            ],
        ]);

        $response->assertStatus(201);

        // Exactly one pagi row survives on the new draft — the copy.
        $rows = WfhAttendance::query()
            ->where('report_id', $response->json('data.id'))
            ->where('session', 'pagi')
            ->get();
        $this->assertCount(1, $rows);

        // Exactly two files may remain: the copy (the new row's own path) and
        // the archive photo. The fresh upload — stored before the conflict
        // check under a hash name — must be gone.
        $uploadedPath = "attendances/{$this->user->id}/2026-07-28";
        $this->assertEqualsCanonicalizing(
            [$rows[0]->photo_path, "attendances/{$this->user->id}/2026-07-28/old-pagi.jpg"],
            Storage::disk('local')->allFiles($uploadedPath),
            'Orphan upload kept on local disk.',
        );
    }

    public function test_copied_session_blocks_a_second_attendance_on_the_same_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28 09:00:00'));
        Storage::fake('local');

        $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');

        $draftId = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28'])
            ->assertStatus(201)
            ->json('data.id');

        $response = $this->postJson("/api/wfh/reports/{$draftId}/attendances", [
            'session' => 'pagi',
            'photo' => UploadedFile::fake()->image('ulang.png'),
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Anda sudah melakukan absensi untuk sesi ini.');
        $this->assertSame(
            [],
            Storage::disk('local')->allFiles('attendances/'.$this->user->id.'/2026-07-28/ulang'),
            'Rejected duplicate must not leak its upload.',
        );
    }

    public function test_missing_source_photo_still_copies_the_row(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        Storage::fake('local');

        $rejected = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-28',
        ]);

        WfhAttendance::create([
            'user_id' => $this->user->id,
            'date' => '2026-07-28',
            'session' => 'sore',
            'report_id' => $rejected->id,
            'photo_path' => "attendances/{$this->user->id}/2026-07-28/hilang.jpg",
            'check_in_at' => now(),
        ]);

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);
        $response->assertStatus(201);

        // The row is copied even though no bytes exist; the UI already renders
        // a placeholder for unloadable photos (design decision #9).
        $this->assertSame(
            1,
            WfhAttendance::query()
                ->where('report_id', $response->json('data.id'))
                ->where('session', 'sore')
                ->count(),
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
            'report_date' => '2026-07-28',
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

        // Reject is gated on the same pending-only transition; a second reject
        // must be refused by the state machine, not by a missing route.
        $this->postJson("/api/wfh/reports/{$rejected->id}/reject", [
            'reason' => 'Tolak ulang',
        ])->assertStatus(422);
    }

    /**
     * The revision flow is gone: the route must not resolve at all. Without
     * this assertion a regression re-adding the route + controller method
     * would leave the whole suite green.
     */
    public function test_revise_route_no_longer_exists(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $rejected = WfhReport::factory()->status('rejected')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-28',
        ]);

        $this->postJson("/api/wfh/reports/{$rejected->id}/revise")->assertNotFound();
    }

    /**
     * The attendance unique index is only unique among LIVE rows: a
     * soft-deleted session must not occupy the slot forever, or the user can
     * never upload that session again (the duplicate guard only reads live
     * rows, so the INSERT would hit the index instead of the friendly 422).
     */
    public function test_soft_deleted_attendance_does_not_block_correction_upload(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        Storage::fake('local');

        $rejected = $this->rejectedReportWithArchiveData('2026-07-28', 'pagi');
        WfhAttendance::query()->where('report_id', $rejected->id)->sole()->delete();

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => '2026-07-28',
            'attendances' => [
                'pagi' => ['photo' => UploadedFile::fake()->image('foto.jpg')],
            ],
        ]);

        $response->assertStatus(201);

        $live = WfhAttendance::query()
            ->where('report_id', $response->json('data.id'))
            ->where('session', 'pagi')
            ->get();

        $this->assertCount(1, $live, 'The correction report must own exactly one live pagi attendance.');
        $this->assertNotSame(
            "attendances/{$this->user->id}/2026-07-28/old-pagi.jpg",
            $live[0]->photo_path,
            'A trashed source row is not copied; the fresh upload wins.',
        );

        // The trashed row stays history of the rejected report; it is not moved.
        $trashed = WfhAttendance::withTrashed()
            ->where('user_id', $this->user->id)
            ->where('date', '2026-07-28')
            ->where('session', 'pagi')
            ->whereNotNull('deleted_at')
            ->sole();
        $this->assertSame($rejected->id, $trashed->report_id);
    }

    /** Ship review #25: the copy path is a write path too — a legacy
     *  non-https link on the rejected report must not silently inherit into
     *  the correction draft (the boundary rule is https-only). */
    public function test_correction_prefill_skips_non_https_links(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));
        $rejected = $this->rejectedReportWithArchiveData('2026-07-28');

        $rejected->activities[0]->links()->createMany([
            ['url' => 'javascript:alert(1)', 'sort_order' => 2],
            ['url' => 'http://intranet.example.com/sop', 'sort_order' => 3],
        ]);

        $response = $this->postJson('/api/wfh/reports', ['report_date' => '2026-07-28']);

        $response->assertStatus(201);

        $draftLinks = WfhReportLink::query()
            ->whereIn(
                'wfh_report_activity_id',
                WfhReportActivity::query()
                    ->where('wfh_report_id', $response->json('data.id'))
                    ->pluck('id')
            )
            ->orderBy('sort_order')
            ->pluck('url')
            ->all();

        $this->assertSame(
            ['https://example.com/dokumen-a', 'https://example.com/dokumen-b'],
            $draftLinks,
            'Non-https source links must not be copied into the draft.',
        );
    }
}
