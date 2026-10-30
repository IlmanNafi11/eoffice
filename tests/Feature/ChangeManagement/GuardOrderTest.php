<?php

namespace Tests\Feature\ChangeManagement;

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

/**
 * Authorization-consistency module (Task 2) — AC#2: every listed change-package
 * action answers 403 for a cross-owner actor and 404 for a missing resource,
 * proving resource resolution precedes the ownership guard.
 *
 * Canonical order as shipped in ChangePackageDecision::decide():
 *   state (422) → visibility (403/404) → self-approval (403) → execute
 * The 422-before-403 ordering is deliberate and pinned by
 * SegregationOfDutiesTest::test_non_pending_state_returns_422_before_self_check;
 * an earlier version of this header described the reverse order (ship review C4).
 *
 * approve/reject guard order is covered in SegregationOfDutiesTest (Task 1).
 */
class GuardOrderTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private User $staf;

    private User $otherStaf;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $this->field = Field::factory()->create();
        $ownTeam = Team::factory()->create(['field_id' => $this->field->id]);
        $otherTeam = Team::factory()->create(['field_id' => $this->field->id]);

        $this->staf = User::factory()->create(['team_id' => $ownTeam->id]);
        $this->staf->assignRole('staf');
        $this->otherStaf = User::factory()->create(['team_id' => $otherTeam->id]);
        $this->otherStaf->assignRole('staf');

        ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_show_denies_cross_owner_and_reports_missing_package(): void
    {
        $id = $this->createDraftAsOwner();

        Sanctum::actingAs($this->otherStaf);
        $this->getJson("/api/changes/{$id}")
            ->assertStatus(403)
            ->assertJsonPath('success', false);
        $this->getJson('/api/changes/999999')->assertStatus(404);
    }

    public function test_update_denies_cross_owner_and_reports_missing_package(): void
    {
        $id = $this->createDraftAsOwner();

        Sanctum::actingAs($this->otherStaf);
        $this->putJson("/api/changes/{$id}", $this->updatePayload())
            ->assertStatus(403)
            ->assertJsonPath('success', false);
        $this->putJson('/api/changes/999999', $this->updatePayload())
            ->assertStatus(404);
    }

    public function test_destroy_denies_cross_owner_and_reports_missing_package(): void
    {
        $id = $this->createDraftAsOwner();

        Sanctum::actingAs($this->otherStaf);
        $this->deleteJson("/api/changes/{$id}")
            ->assertStatus(403)
            ->assertJsonPath('success', false);
        $this->deleteJson('/api/changes/999999')->assertStatus(404);
    }

    public function test_submit_denies_cross_owner_and_reports_missing_package(): void
    {
        $id = $this->createDraftAsOwner();

        Sanctum::actingAs($this->otherStaf);
        $this->postJson("/api/changes/{$id}/submit", $this->submitPayload())
            ->assertStatus(403)
            ->assertJsonPath('success', false);
        $this->postJson('/api/changes/999999/submit', $this->submitPayload())
            ->assertStatus(404);
    }

    public function test_upload_attachments_deny_cross_owner_and_report_missing_package(): void
    {
        Storage::fake('public');
        $id = $this->createDraftAsOwner();

        Sanctum::actingAs($this->otherStaf);
        $this->postJson("/api/changes/{$id}/attachments", $this->attachmentPayload())
            ->assertStatus(403)
            ->assertJsonPath('success', false);
        $this->postJson('/api/changes/999999/attachments', $this->attachmentPayload())
            ->assertStatus(404);
    }

    private function createDraftAsOwner(): int
    {
        Sanctum::actingAs($this->staf);

        return $this->postJson('/api/changes', $this->draftPayload())
            ->assertStatus(201)
            ->json('data.initiation.id');
    }

    /**
     * Payload builders kept local so this contract test does not depend on
     * another suite's private helpers (mirrors TransitionErrorContractTest).
     */
    private function draftPayload(): array
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

    private function updatePayload(): array
    {
        return [
            'initiation' => [
                'description' => 'Updated description',
                'reason' => 'Updated reason',
            ],
        ];
    }

    private function submitPayload(): array
    {
        return [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
                'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
                'change_type_ids' => [ChangeType::first()->id],
                'test_plan' => 'Test plan',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-10',
                'implementation_result' => 'Done',
            ],
        ];
    }

    private function attachmentPayload(): array
    {
        return ['files' => [UploadedFile::fake()->image('doc.jpg')]];
    }
}
