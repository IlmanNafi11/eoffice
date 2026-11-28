<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SchemaRelationshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_report_has_many_attendances(): void
    {
        $user = User::factory()->create();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
        ]);

        $sessions = ['pagi', 'siang', 'sore'];
        foreach ($sessions as $session) {
            $attendance = WfhAttendance::create([
                'user_id' => $user->id,
                'date' => $report->report_date->format('Y-m-d'),
                'session' => $session,
                'photo_path' => "attendances/{$user->id}/{$report->report_date->format('Y-m-d')}/{$session}.jpg",
                'report_id' => $report->id,
            ]);
            $this->assertNotNull($attendance);
        }

        $report->load('attendances');
        $this->assertCount(3, $report->attendances);
        $this->assertEquals(['pagi', 'siang', 'sore'], $report->attendances->pluck('session')->toArray());
    }

    public function test_attendance_unique_key_is_scoped_to_report(): void
    {
        // One evidence row per (report, session): the same session may exist
        // on another report (a correction draft copies the rejected evidence),
        // but not twice on one report.
        $user = User::factory()->create();
        $rejected = WfhReport::factory()->status('rejected')->create(['user_id' => $user->id]);
        $draft = WfhReport::factory()->status('draft')->create(['user_id' => $user->id]);

        foreach ([$rejected, $draft] as $report) {
            WfhAttendance::create([
                'user_id' => $user->id,
                'date' => $report->report_date->format('Y-m-d'),
                'session' => 'pagi',
                'photo_path' => "attendances/{$user->id}/{$report->report_date->format('Y-m-d')}/pagi.jpg",
                'report_id' => $report->id,
            ]);
        }

        $this->assertDatabaseCount('wfh_attendances', 2);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $draft->report_date->format('Y-m-d'),
            'session' => 'pagi',
            'photo_path' => "attendances/{$user->id}/{$draft->report_date->format('Y-m-d')}/pagi-2.jpg",
            'report_id' => $draft->id,
        ]);
    }

    public function test_migration_deletes_orphan_attendance_rows(): void
    {
        // Rows without a report are unreferencable; the migration removes
        // them so the new (report_id, session) key holds for all rows. The
        // migration is exercised against a database that already contains an
        // orphan: roll it back and re-apply it.
        $user = User::factory()->create();

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => '2026-07-27',
            'session' => 'pagi',
            'photo_path' => 'attendances/2026-07-27/pagi.jpg',
            'report_id' => null,
        ]);

        $this->assertDatabaseCount('wfh_attendances', 1);

        $this->artisan('migrate:rollback', ['--step' => 1]);
        $this->artisan('migrate');

        $this->assertDatabaseCount('wfh_attendances', 0);
    }

    public function test_find_attendance_by_user_and_date_scopes_to_active_report(): void
    {
        // The (user, date, session) rule is now derived: a session is taken
        // when the user's ACTIVE report for that date already has it. Rows on
        // rejected reports must not block a fresh correction draft.
        $repository = app(WfhRepositoryInterface::class);
        $user = User::factory()->create();
        $date = '2026-07-27';

        $rejected = WfhReport::factory()->status('rejected')->create([
            'user_id' => $user->id,
            'report_date' => $date,
        ]);
        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $date,
            'session' => 'pagi',
            'photo_path' => "attendances/{$user->id}/{$date}/pagi.jpg",
            'report_id' => $rejected->id,
        ]);

        $this->assertNull($repository->findAttendanceByUserAndDate($user->id, $date, 'pagi'));

        $draft = WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => $date,
        ]);
        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $date,
            'session' => 'pagi',
            'photo_path' => "attendances/{$user->id}/{$date}/pagi.jpg",
            'report_id' => $draft->id,
        ]);

        $found = $repository->findAttendanceByUserAndDate($user->id, $date, 'pagi');

        $this->assertNotNull($found);
        $this->assertSame($draft->id, $found->report_id);
    }

    /** Ship review #25: the fail-fast collision guard of the date-lock
     *  migration. Two live reports for one (user, date) were legal under the
     *  old draft-only index; the migration must abort with the offending
     *  pairs instead of silently corrupting data. */
    public function test_date_lock_migration_fails_fast_on_active_duplicates(): void
    {
        // The widened unique index blocks the fixture itself, so drop it —
        // the migration's own collision guard is what must catch the state.
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');

        $user = User::factory()->create();

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->artisan('migrate:rollback', ['--step' => 1]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Cannot lock report dates');

        $this->artisan('migrate');
    }
}
