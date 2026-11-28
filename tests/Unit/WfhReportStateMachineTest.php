<?php

namespace Tests\Unit;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use DomainException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WfhReportStateMachineTest extends TestCase
{
    use RefreshDatabase;

    private WfhReportStateMachine $machine;

    private User $user;

    private User $supervisor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->machine = app(WfhReportStateMachine::class);
        $this->user = User::factory()->create();
        $this->supervisor = User::factory()->create();
    }

    public function test_can_submit_draft_report(): void
    {
        $report = WfhReport::factory()->create([
            'status' => 'draft',
            'user_id' => $this->user->id,
        ]);
        $report->activities()->create(['activity' => 'Test', 'sort_order' => 0]);

        $result = $this->machine->submit($report, $this->user);

        $this->assertEquals('pending', $result->status);
        $this->assertNotNull($result->maker_signed_at);
    }

    public function test_submit_assigns_field_head_as_supervisor(): void
    {
        $head = User::factory()->create();
        $field = Field::factory()->create(['head_id' => $head->id]);
        $team = Team::factory()->create(['field_id' => $field->id]);
        $maker = User::factory()->create(['team_id' => $team->id]);

        $report = WfhReport::factory()->create([
            'status' => 'draft',
            'user_id' => $maker->id,
        ]);
        $report->activities()->create(['activity' => 'Test', 'sort_order' => 0]);

        $result = $this->machine->submit($report, $maker);

        $this->assertEquals($head->id, $result->supervisor_id);
    }

    public function test_submit_skips_supervisor_when_maker_is_field_head(): void
    {
        $head = User::factory()->create();
        $field = Field::factory()->create(['head_id' => $head->id]);
        $team = Team::factory()->create(['field_id' => $field->id]);

        $report = WfhReport::factory()->create([
            'status' => 'draft',
            'user_id' => $head->id,
        ]);
        $report->activities()->create(['activity' => 'Test', 'sort_order' => 0]);

        $result = $this->machine->submit($report, $head);

        $this->assertNull($result->supervisor_id);
    }

    public function test_cannot_submit_non_draft_report(): void
    {
        $this->expectException(DomainException::class);
        $this->expectExceptionMessage('Hanya laporan dengan status draft yang dapat disubmit.');

        $report = WfhReport::factory()->create([
            'status' => 'pending',
            'user_id' => $this->user->id,
        ]);

        $this->machine->submit($report, $this->user);
    }

    public function test_cannot_submit_approved_report(): void
    {
        $this->expectException(DomainException::class);

        $report = WfhReport::factory()->create([
            'status' => 'approved',
            'user_id' => $this->user->id,
        ]);

        $this->machine->submit($report, $this->user);
    }

    public function test_can_approve_pending_report(): void
    {
        $report = WfhReport::factory()->create([
            'status' => 'pending',
            'user_id' => $this->user->id,
            'supervisor_id' => $this->supervisor->id,
            'report_date' => '2026-08-09',
        ]);

        $result = $this->machine->approve($report, $this->supervisor);

        $this->assertEquals('approved', $result->status);
        $this->assertNotNull($result->supervisor_signed_at);
        $this->assertEquals($this->supervisor->id, $result->supervisor_id);
    }

    public function test_cannot_approve_non_pending_report(): void
    {
        $this->expectException(DomainException::class);

        $report = WfhReport::factory()->create([
            'status' => 'draft',
            'user_id' => $this->user->id,
        ]);

        $this->machine->approve($report, $this->supervisor);
    }

    public function test_can_reject_pending_report(): void
    {
        $report = WfhReport::factory()->create([
            'status' => 'pending',
            'user_id' => $this->user->id,
        ]);

        $result = $this->machine->reject($report, $this->supervisor, 'Dokumen kurang lengkap');

        $this->assertEquals('rejected', $result->status);
        $this->assertEquals('Dokumen kurang lengkap', $result->reject_reason);
    }

    public function test_can_edit_only_draft(): void
    {
        $draft = WfhReport::factory()->create(['status' => 'draft', 'user_id' => $this->user->id]);
        $rejected = WfhReport::factory()->create(['status' => 'rejected', 'user_id' => $this->user->id, 'report_date' => '2026-08-09']);
        $pending = WfhReport::factory()->create(['status' => 'pending', 'user_id' => $this->user->id, 'report_date' => '2026-08-08']);
        $approved = WfhReport::factory()->create(['status' => 'approved', 'user_id' => $this->user->id, 'report_date' => '2026-08-07']);

        $this->assertTrue($this->machine->canEdit($draft));
        $this->assertFalse($this->machine->canEdit($rejected));
        $this->assertFalse($this->machine->canEdit($pending));
        $this->assertFalse($this->machine->canEdit($approved));
    }

    public function test_rejected_is_immutable(): void
    {
        $rejected = WfhReport::factory()->create(['status' => 'rejected', 'user_id' => $this->user->id]);
        $draft = WfhReport::factory()->create(['status' => 'draft', 'user_id' => $this->user->id, 'report_date' => '2026-08-09']);

        $this->assertTrue($this->machine->isImmutable($rejected));
        $this->assertFalse($this->machine->isImmutable($draft));
    }

    public function test_approved_is_immutable(): void
    {
        $approved = WfhReport::factory()->create(['status' => 'approved', 'user_id' => $this->user->id]);
        $draft = WfhReport::factory()->create(['status' => 'draft', 'user_id' => $this->user->id, 'report_date' => '2026-08-09']);

        $this->assertTrue($this->machine->isImmutable($approved));
        $this->assertFalse($this->machine->isImmutable($draft));
    }

    public function test_cannot_submit_draft_when_active_report_exists_for_date(): void
    {
        // Cross-report guard: two pending reports for the same (user, date)
        // must be impossible through the application path. The widened
        // unique index already blocks the fixture itself, so it is dropped
        // for this test — the guard is what must catch the violation.
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');

        WfhReport::factory()->status('pending')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-27',
        ]);

        $report = WfhReport::factory()->status('draft')->create([
            'user_id' => $this->user->id,
            'report_date' => '2026-07-27',
        ]);
        $report->activities()->create(['activity' => 'Test', 'sort_order' => 0]);

        try {
            $this->machine->submit($report, $this->user);
            $this->fail('Submit must be blocked when an active report exists for the date.');
        } catch (DomainException $e) {
            $this->assertSame('Tanggal laporan sudah memiliki laporan yang menunggu keputusan atau sudah final.', $e->getMessage());
        }
    }
}
