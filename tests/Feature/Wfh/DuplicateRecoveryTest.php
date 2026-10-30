<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ship review TestCoverage gaps #1 and #2: the duplicate-submit and
 * duplicate-attendance handlers must recover from a Postgres unique violation
 * (SQLSTATE 23505) instead of 500-ing.
 *
 * A real 23505 cannot be staged inside a test transaction — the failing INSERT
 * rolls back everything, including the colliding row — so these tests swap in a
 * repository double that raises the exact exception the unique index raises in
 * production, then drive the genuine HTTP request path. A reverted handler
 * (rethrow on 23505, or swallow-everything) fails these tests.
 */
class DuplicateRecoveryTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        $this->user = User::factory()->create(['is_active' => true, 'must_change_password' => false]);
        $this->user->assignRole('staf');
        Sanctum::actingAs($this->user);
    }

    private function swapRepository(UniqueViolatingWfhRepository $double): void
    {
        app()->instance(WfhRepositoryInterface::class, $double);
    }

    public function test_duplicate_report_insert_returns_existing_draft_instead_of_500(): void
    {
        $date = now()->toDateString();

        // The row the handler must fall back to, re-read via
        // findDraftForUserDate once the simulated violation fires.
        $existing = WfhReport::factory()->create([
            'user_id' => $this->user->id,
            'report_date' => $date,
        ]);

        $this->swapRepository(
            (new UniqueViolatingWfhRepository(app(WfhRepositoryInterface::class)))
                ->failWith('createReportWithRelations', '23505', 'insert into "wfh_reports"')
                ->hideDraftUntilViolation(),
        );

        $response = $this->postJson('/api/wfh/reports', ['report_date' => $date]);

        // Recovery hands back the surviving draft (200), never a generic 500.
        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertOk();
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('message', 'Laporan WFH sudah ada.');
        $response->assertJsonPath('data.id', $existing->id);
    }

    public function test_duplicate_attendance_insert_deletes_the_orphan_photo(): void
    {
        // Attendance is only accepted on the report's own date, on an allowed
        // WFH weekday; 2026-11-02 is a Monday.
        $this->travelTo('2026-11-02 08:00:00');

        $report = WfhReport::factory()->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-11-02',
        ]);

        Storage::fake('public');

        $this->swapRepository(
            (new UniqueViolatingWfhRepository(app(WfhRepositoryInterface::class)))
                ->failWith('addAttendanceToReport', '23505', 'insert into "wfh_attendances"')
                ->forceMissingAttendanceLookup(),
        );

        $response = $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'session' => 'pagi',
            'photo' => UploadedFile::fake()->image('absen.png'),
        ]);

        // Recovery returns the domain 422 "already checked in" answer, never a
        // generic 500, and the just-stored photo is cleaned up.
        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $response->assertJsonPath('message', 'Anda sudah melakukan absensi untuk sesi ini.');

        $remaining = Storage::disk('public')->allFiles('attendances/'.$this->user->id.'/2026-11-02');
        $this->assertSame([], $remaining, 'Duplicate attendance must not leak its photo.');
    }

    public function test_non_unique_sqlstate_is_not_swallowed(): void
    {
        // 40P01 (deadlock) is NOT recoverable: the handler must rethrow rather
        // than answer 200 with data it cannot vouch for.
        $this->swapRepository(
            (new UniqueViolatingWfhRepository(app(WfhRepositoryInterface::class)))
                ->failWith('createReportWithRelations', '40P01', 'insert into "wfh_reports"'),
        );

        $this->withoutExceptionHandling();

        $this->expectException(QueryException::class);

        $this->postJson('/api/wfh/reports', ['report_date' => now()->toDateString()]);
    }
}
