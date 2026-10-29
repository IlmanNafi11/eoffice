<?php

namespace Tests\Feature;

use App\Domains\ChangeManagement\Models\ChangeType;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChangePackageFlowTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private Team $team;

    private User $staf;

    private User $kepalaTim;

    private User $otherStaf;

    private User $admin;

    private ChangeType $typeA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $this->field = Field::factory()->create();
        $this->team = Team::factory()->create(['field_id' => $this->field->id]);
        $otherTeam = Team::factory()->create(['field_id' => $this->field->id]);

        $this->staf = User::factory()->create(['team_id' => $this->team->id]);
        $this->staf->assignRole('staf');
        $this->kepalaTim = User::factory()->create(['team_id' => $this->team->id]);
        $this->kepalaTim->assignRole('kepala_tim');
        $this->otherStaf = User::factory()->create(['team_id' => $otherTeam->id]);
        $this->otherStaf->assignRole('staf');
        $this->admin = User::factory()->create(['team_id' => $this->team->id]);
        $this->admin->assignRole('admin');

        $this->typeA = ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_staf_can_create_draft_package(): void
    {
        Sanctum::actingAs($this->staf);
        $response = $this->postJson('/api/changes', $this->validDraftPayload());
        $response->assertStatus(201)->assertJsonPath('success', true);
        $this->assertEquals('draft', $response->json('data.initiation.status'));
        $this->assertEquals('draft', $response->json('data.implementation.status'));
    }

    public function test_create_package_requires_initiation_fields(): void
    {
        Sanctum::actingAs($this->staf);
        $this->postJson('/api/changes', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['initiation.field_id', 'initiation.description', 'initiation.reason']);
    }

    public function test_staf_lists_only_own_packages(): void
    {
        Sanctum::actingAs($this->staf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->otherStaf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->staf);
        $response = $this->getJson('/api/changes');
        $response->assertStatus(200);
        $this->assertCount(2, $response->json('data'));
    }

    public function test_kepala_tim_lists_team_packages(): void
    {
        Sanctum::actingAs($this->staf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->otherStaf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->kepalaTim);
        $this->assertCount(1, $this->getJson('/api/changes')->json('data'));
    }

    public function test_admin_lists_all_packages(): void
    {
        Sanctum::actingAs($this->staf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->otherStaf);
        $this->postJson('/api/changes', $this->validDraftPayload());
        Sanctum::actingAs($this->admin);
        $this->assertCount(2, $this->getJson('/api/changes')->json('data'));
    }

    public function test_list_filters_by_status(): void
    {
        Sanctum::actingAs($this->admin);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $this->assertCount(1, $this->getJson('/api/changes?status=draft')->json('data'));
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());
        $this->assertCount(1, $this->getJson('/api/changes?status=pending')->json('data'));
        $this->assertCount(0, $this->getJson('/api/changes?status=rejected')->json('data'));
    }

    public function test_staf_cannot_view_others_package(): void
    {
        Sanctum::actingAs($this->otherStaf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');
        Sanctum::actingAs($this->staf);
        $this->getJson("/api/changes/{$pkg['id']}")->assertStatus(403);
    }

    public function test_staf_can_update_own_draft(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');
        $this->putJson("/api/changes/{$pkg['id']}", $this->validDraftPayload())->assertStatus(200);
    }

    public function test_staf_can_delete_own_draft(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');
        $this->deleteJson("/api/changes/{$pkg['id']}")->assertNoContent();
        $this->assertSoftDeleted('change_initiations', ['id' => $pkg['id']]);
    }

    public function test_cannot_delete_non_draft(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());
        $this->deleteJson("/api/changes/{$pkg['id']}")->assertStatus(422);
    }

    public function test_staf_can_submit_own_draft(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $response = $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());
        $response->assertStatus(200)->assertJsonPath('data.initiation.status', 'pending');
        $this->assertNotNull($response->json('data.initiation.initiator_signed_at'));
    }

    public function test_submit_fails_without_required_fields(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');
        $this->postJson("/api/changes/{$pkg['id']}/submit", [])->assertStatus(422);
    }

    public function test_cannot_submit_already_submitted(): void
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload())->assertStatus(422);
    }

    public function test_kepala_tim_can_approve_team_pending(): void
    {
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $response = $this->postJson("/api/changes/{$initId}/approve");
        $response->assertStatus(200)->assertJsonPath('data.initiation.status', 'approved');
        $this->assertEquals('completed', $response->json('data.implementation.status'));
        $this->assertEquals('diterima', $response->json('data.implementation.review_status'));
    }

    public function test_cannot_self_approve(): void
    {
        Sanctum::actingAs($this->admin);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());
        $this->postJson("/api/changes/{$pkg['id']}/approve")->assertStatus(403);
    }

    public function test_submit_persists_implementation_and_initiation_body(): void
    {
        // RED: prove the submit body is actually persisted, not just validated+discarded.
        Sanctum::actingAs($this->staf);
        // Start from a MINIMAL draft — no business fields stored yet.
        $pkg = $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Initial',
                'reason' => 'Initial reason',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ])->json('data.initiation');

        $response = $this->postJson("/api/changes/{$pkg['id']}/submit", [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Final desc',
                'reason' => 'Final reason',
                'needed_by_date' => '2026-09-01',
            ],
            'implementation' => [
                'priority' => 'emergency',
                'impact' => 'Mayor',
                'change_type_ids' => [$this->typeA->id],
                'test_plan' => 'Real test plan',
                'execution_date' => '2026-09-10',
                'release_date' => '2026-09-15',
                'implementation_result' => 'Real result',
                'review_response' => 'Tanggapan staf',
            ],
        ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.initiation.status', 'pending')
            ->assertJsonPath('data.initiation.description', 'Final desc')
            ->assertJsonPath('data.initiation.reason', 'Final reason')
            ->assertJsonPath('data.initiation.needed_by_date', '2026-09-01')
            ->assertJsonPath('data.implementation.priority', 'emergency')
            ->assertJsonPath('data.implementation.test_plan', 'Real test plan')
            ->assertJsonPath('data.implementation.execution_date', '2026-09-10')
            ->assertJsonPath('data.implementation.implementation_result', 'Real result')
            ->assertJsonPath('data.implementation.review_response', 'Tanggapan staf');
        $this->assertContains($this->typeA->id, $response->json('data.implementation.change_types.*.id'));
    }

    public function test_cross_team_kepala_tim_cannot_approve(): void
    {
        [$initId] = $this->createSubmittedPackage();
        $otherKt = User::factory()->create(['team_id' => Team::factory()->create()->id]);
        $otherKt->assignRole('kepala_tim');
        Sanctum::actingAs($otherKt);
        $this->postJson("/api/changes/{$initId}/approve")->assertStatus(403);
    }

    public function test_admin_can_approve_break_glass(): void
    {
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/changes/{$initId}/approve")->assertStatus(200);
    }

    public function test_kepala_tim_can_reject(): void
    {
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        // Reject is a pure decision — no reason body, staf's review_response stays untouched.
        $response = $this->postJson("/api/changes/{$initId}/reject");
        $response->assertStatus(200)->assertJsonPath('data.initiation.status', 'rejected');
        $this->assertEquals('rejected', $response->json('data.implementation.status'));
        $this->assertEquals('ditolak', $response->json('data.implementation.review_status'));
        $this->assertEquals('Catatan staf', $response->json('data.implementation.review_response'));
    }

    public function test_reject_is_terminal_cannot_resubmit(): void
    {
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/reject", ['reason' => 'No']);
        Sanctum::actingAs($this->staf);
        $this->postJson("/api/changes/{$initId}/submit", $this->validSubmitPayload())->assertStatus(422);
    }

    public function test_staf_can_upload_attachment_to_draft(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');
        $response = $this->postJson("/api/changes/{$pkg['id']}/attachments", [
            'files' => [UploadedFile::fake()->image('doc.jpg')],
        ]);
        $response->assertStatus(200);
        $this->assertCount(1, $response->json('data'));
    }

    public function test_submit_without_testing_result_succeeds(): void
    {
        // RED: testing_result was required on submit; it is now dropped (attachments carry the result).
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $payload = $this->validSubmitPayload();
        unset($payload['implementation']['testing_result']);

        $this->postJson("/api/changes/{$pkg['id']}/submit", $payload)
            ->assertStatus(200)
            ->assertJsonPath('data.initiation.status', 'pending');
    }

    public function test_cannot_upload_non_image_attachment(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftPayload())->json('data.initiation');

        $this->postJson("/api/changes/{$pkg['id']}/attachments", [
            'files' => [UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf')],
        ])->assertStatus(422)->assertJsonValidationErrors(['files.0']);
    }

    public function test_cannot_upload_to_non_draft(): void
    {
        Storage::fake('public');
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->staf);
        $this->postJson("/api/changes/{$initId}/attachments", [
            'files' => [UploadedFile::fake()->image('doc.jpg')],
        ])->assertStatus(422);
    }

    public function test_initiation_pdf_after_approve(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/approve");
        Sanctum::actingAs($this->admin);
        $this->get("/api/changes/{$initId}/pdf/initiation")
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_implementation_pdf_after_approve(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/approve");
        Sanctum::actingAs($this->admin);
        $this->get("/api/changes/{$initId}/pdf/implementation")
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_initiation_pdf_rejected_when_signature_unset(): void
    {
        $this->setUserSignature($this->staf);
        // kepalaTim (reviewer) intentionally left without signature.

        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/approve");
        Sanctum::actingAs($this->admin);
        // staf (initiator) has signature but reviewer (kepalaTim) does not.
        $this->getJson("/api/changes/{$initId}/pdf/initiation")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_implementation_pdf_rejected_if_signature_unset(): void
    {
        // evaluator unset (skipped by guard). reviewer = responsible =
        // kepalaTim — intentionally left without signature.

        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/approve");
        Sanctum::actingAs($this->admin);
        $this->getJson("/api/changes/{$initId}/pdf/implementation")
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_pdf_before_approve_returns_422(): void
    {
        [$initId] = $this->createSubmittedPackage();
        Sanctum::actingAs($this->admin);
        $this->get("/api/changes/{$initId}/pdf/initiation")->assertStatus(422);
    }

    // ── HELPERS ────────────────────────────────────────────────────

    private function validDraftPayload(): array
    {
        return [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ];
    }

    private function validDraftWithAll(): array
    {
        return [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test desc',
                'reason' => 'Test reason',
                'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'emergency', 'impact' => 'Mayor',
                'change_type_ids' => [$this->typeA->id],
                'test_plan' => 'Test plan', 'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15', 'implementation_result' => 'Done',
            ],
        ];
    }

    private function validSubmitPayload(): array
    {
        return [
            'initiation' => [
                'field_id' => $this->field->id, 'description' => 'Test desc',
                'reason' => 'Test reason', 'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'emergency', 'impact' => 'Mayor',
                'change_type_ids' => [$this->typeA->id],
                'test_plan' => 'Test plan', 'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15', 'implementation_result' => 'Done',
                'review_response' => 'Catatan staf',
            ],
        ];
    }

    /** @return array{0: int} */
    private function createSubmittedPackage(): array
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $submit = $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());

        return [$submit->json('data.initiation.id')];
    }
}
