<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UniqueActiveDraftTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_reject_duplicate_active_draft(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
    }

    public function test_allow_new_draft_after_rejected(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('rejected')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $draft = WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->assertDatabaseHas('wfh_reports', ['id' => $draft->id]);
        $this->assertDatabaseCount('wfh_reports', 2);
    }

    public function test_reject_pending_alongside_draft(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
    }

    public function test_reject_second_pending_report(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhReport::factory()->status('pending')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
    }

    public function test_reject_approved_alongside_draft(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
    }

    public function test_reject_draft_alongside_approved(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->expectException(QueryException::class);
        $this->expectExceptionCode(23505);

        WfhReport::factory()->status('approved')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);
    }

    public function test_allow_multiple_rejected_reports_for_same_user_date(): void
    {
        $user = User::factory()->create();

        WfhReport::factory()->status('rejected')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        WfhReport::factory()->status('rejected')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-27',
        ]);

        $this->assertDatabaseCount('wfh_reports', 2);
    }
}
