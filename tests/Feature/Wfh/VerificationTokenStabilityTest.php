<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Repositories\WfhRepositoryInterface;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The verification token is what the QR code on an exported PDF points at. If a
 * re-approval minted a new token, every QR code already printed on an approved
 * report would silently stop verifying — a real integrity regression for
 * documents already handed to staff.
 *
 * ensureVerificationToken() must be idempotent: once issued, the token never
 * changes for the life of the report.
 */
class VerificationTokenStabilityTest extends TestCase
{
    use RefreshDatabase;

    private User $staff;

    private User $kepala;

    private WfhReportStateMachine $stateMachine;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $this->staff = User::factory()->create(['team_id' => $team->id]);
        $this->staff->assignRole('staf');

        $this->kepala = User::factory()->create(['team_id' => $team->id]);
        $this->kepala->assignRole('kepala_tim');

        $this->stateMachine = new WfhReportStateMachine(
            app(WfhRepositoryInterface::class),
        );
    }

    /**
     * A report that has genuinely been through submit(): the QR verification
     * endpoint requires maker_signed_at, which only submit() stamps. Building a
     * row straight in 'pending' would verify nothing and the test would pass for
     * the wrong reason.
     */
    private function pendingReport(?string $date = null): WfhReport
    {
        $draft = WfhReport::factory()->create([
            'user_id' => $this->staff->id,
            'report_date' => $date ?? now()->toDateString(),
            'status' => 'draft',
        ]);

        // submit() requires at least one activity or attendance.
        WfhReportActivity::create([
            'wfh_report_id' => $draft->id,
            'activity' => 'Kegiatan',
            'sort_order' => 1,
        ]);

        return $this->stateMachine->submit($draft, $this->staff);
    }

    public function test_a_report_without_a_token_gets_one_on_approval(): void
    {
        $report = $this->pendingReport();
        $this->assertNull($report->verification_token);

        $approved = $this->stateMachine->approve($report, $this->kepala);

        $token = $approved->verification_token;

        $this->assertNotNull($token);
        $this->assertSame(64, strlen($token), 'Token must be 32 random bytes, hex encoded.');
    }

    public function test_rejected_report_keeps_token_and_new_report_verifies_independently(): void
    {
        // Rejected is terminal: the report keeps its token so an already
        // printed QR URL still resolves — but to a non-approved status, not
        // "terverifikasi". Correction happens in a NEW report with its own
        // token.
        $report = $this->pendingReport();
        $tokenA = $this->stateMachine->approve($report, $this->kepala)->verification_token;

        $report->fresh()->forceFill(['status' => 'rejected'])->save();
        $this->assertSame($tokenA, $report->fresh()->verification_token, 'Rejected report must keep its token.');

        // The QR endpoint only resolves approved reports; a rejected one 404s
        // instead of ever answering "terverifikasi".
        $this->getJson('/api/verify/'.$tokenA)->assertNotFound();

        $second = $this->pendingReport(now()->subDay()->toDateString());
        $this->stateMachine->approve($second, $this->kepala);
        $tokenB = $second->fresh()->verification_token;

        $this->assertNotSame($tokenA, $tokenB);
        $this->getJson('/api/verify/'.$tokenB)
            ->assertOk()
            ->assertJsonPath('data.status', 'terverifikasi');
    }

    public function test_an_existing_token_is_never_overwritten(): void
    {
        $known = bin2hex(random_bytes(32));

        $report = WfhReport::factory()->create([
            'user_id' => $this->staff->id,
            'report_date' => now()->toDateString(),
            'status' => 'pending',
            'verification_token' => $known,
        ]);

        $this->assertSame($known, $this->stateMachine->approve($report, $this->kepala)->verification_token);
    }

    public function test_two_reports_never_share_a_token(): void
    {
        $a = $this->stateMachine->approve($this->pendingReport(), $this->kepala)->verification_token;

        $other = WfhReport::factory()->create([
            'user_id' => $this->staff->id,
            'report_date' => now()->subDay()->toDateString(),
            'status' => 'pending',
        ]);

        $b = $this->stateMachine->approve($other, $this->kepala)->verification_token;

        $this->assertNotSame($a, $b);
    }

    public function test_the_issued_token_actually_verifies_over_the_public_endpoint(): void
    {
        // The PDF embeds a QR path, not the token string, so the consumer
        // contract is the thing to assert: the token that approval issued must
        // resolve to this document at /api/verify/{token}.
        $report = $this->pendingReport();
        $approved = $this->stateMachine->approve($report, $this->kepala);

        $response = $this->getJson('/api/verify/'.$approved->verification_token);

        $response->assertOk();
        $response->assertJsonPath('data.doc_type', 'WFH Report');
        $response->assertJsonPath('data.status', 'terverifikasi');
        $response->assertJsonPath('data.doc_number', 'WFH-'.$approved->id);
    }

    public function test_an_unapproved_report_does_not_verify(): void
    {
        $report = $this->pendingReport();
        $report->forceFill(['verification_token' => bin2hex(random_bytes(32))])->save();

        $this->getJson('/api/verify/'.$report->fresh()->verification_token)->assertNotFound();
    }

    public function test_a_malformed_token_is_rejected_without_a_database_lookup(): void
    {
        $this->getJson('/api/verify/not-a-token')->assertNotFound();
        $this->getJson('/api/verify/'.strtoupper(bin2hex(random_bytes(32))))->assertNotFound();
    }
}
