<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Covers the PDF-export branches the existing tests skipped: the draft/pending
 * status guard, the cross-field refusal, the signature-missing 422, and the
 * team-PDF rules (garbage date, foreign team_report_id).
 *
 * Each branch is a refusal path, so each one is asserted to be a specific 4xx
 * and never a 500.
 */
class PdfExportGuardsTest extends TestCase
{
    use RefreshDatabase;

    private Field $fieldA;

    private Field $fieldB;

    private Team $teamA;

    private Team $teamB;

    private User $staff;

    private User $kepala;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        Storage::fake('local');

        $this->fieldA = Field::factory()->create();
        $this->fieldB = Field::factory()->create();
        $this->teamA = Team::factory()->create(['field_id' => $this->fieldA->id]);
        $this->teamB = Team::factory()->create(['field_id' => $this->fieldB->id]);

        $this->staff = User::factory()->create(['team_id' => $this->teamA->id]);
        $this->staff->assignRole('staf');

        $this->kepala = User::factory()->create(['team_id' => $this->teamA->id]);
        $this->kepala->assignRole('kepala_tim');
    }

    private function withSignature(User $user): User
    {
        $relative = 'signatures/'.$user->id.'.png';

        Storage::disk('local')->put($relative, UploadedFile::fake()->image('s.png')->getContent());
        $user->forceFill(['signature_path' => $relative])->save();

        return $user->fresh();
    }

    private function report(string $status): WfhReport
    {
        return WfhReport::factory()->create([
            'user_id' => $this->staff->id,
            'report_date' => now()->toDateString(),
            'status' => $status,
        ]);
    }

    public function test_draft_report_cannot_be_exported(): void
    {
        $this->withSignature($this->staff);
        Sanctum::actingAs($this->staff);

        $this->getJson('/api/wfh/reports/'.$this->report('draft')->id.'/pdf')->assertStatus(422);
    }

    public function test_own_pending_report_exports_when_signatures_exist(): void
    {
        $this->withSignature($this->staff);
        Sanctum::actingAs($this->staff);

        $response = $this->getJson('/api/wfh/reports/'.$this->report('pending')->id.'/pdf');

        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertOk();
    }

    public function test_export_is_refused_when_a_signature_is_missing(): void
    {
        // No signature configured: exporting a document that embeds signatures
        // must be refused, not rendered with a blank one.
        Sanctum::actingAs($this->staff);

        $response = $this->getJson('/api/wfh/reports/'.$this->report('pending')->id.'/pdf');

        $response->assertStatus(422);
    }

    public function test_a_staf_cannot_export_a_colleagues_pdf(): void
    {
        $this->withSignature($this->staff);

        $colleague = User::factory()->create(['team_id' => $this->teamA->id]);
        $colleague->assignRole('staf');
        $this->withSignature($colleague);

        Sanctum::actingAs($colleague);

        $this->getJson('/api/wfh/reports/'.$this->report('approved')->id.'/pdf')->assertForbidden();
    }

    public function test_team_pdf_refuses_a_team_from_another_field(): void
    {
        $this->withSignature($this->kepala);
        Sanctum::actingAs($this->kepala);

        $this->getJson('/api/admin/wfh/teams/'.$this->teamB->id.'/pdf')->assertForbidden();
    }

    public function test_team_pdf_rejects_a_garbage_date_with_422_not_500(): void
    {
        $this->withSignature($this->kepala);
        Sanctum::actingAs($this->kepala);

        $response = $this->getJson('/api/admin/wfh/teams/'.$this->teamA->id.'/pdf?date=kemarin');

        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertStatus(422);
    }

    public function test_team_pdf_ignores_another_teams_report_id(): void
    {
        // The critical branch: team_report_id belonging to a DIFFERENT team must
        // not mark this team's PDF approved — it would stamp the field head's
        // signature onto a document nobody approved.
        $this->withSignature($this->kepala);
        $head = User::factory()->create(['team_id' => $this->teamB->id]);
        $this->fieldA->forceFill(['head_id' => $head->id])->save();

        $foreignApproved = WfhTeamReport::factory()->create([
            'team_id' => $this->teamB->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($this->kepala);

        $response = $this->getJson(
            '/api/admin/wfh/teams/'.$this->teamA->id.'/pdf?team_report_id='.$foreignApproved->id
        );

        // isApproved must be false: the head has no signature configured, so
        // had the foreign id been honoured the signature guard would have
        // refused with 422. Rendering 200 here proves the id was ignored.
        $this->assertNotSame(500, $response->status(), $response->getContent());
        $this->assertSame(
            200,
            $response->status(),
            'A foreign team_report_id must be ignored: this PDF is not approved.',
        );
    }
}
