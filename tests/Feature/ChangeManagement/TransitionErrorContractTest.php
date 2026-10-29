<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeType;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Error-contract module (T4) — AC#4: approving/rejecting a package that is not
 * pending answers 422 with the error envelope, never 500.
 *
 * The guard that catches the common case lives in the controller; the
 * repository-level ApiException (concurrent-write race) is proven directly in
 * tests/Unit/ChangePackageFoundationTest and ChangeInitiationStateMachineTest,
 * because the race cannot be produced deterministically through HTTP.
 */
class TransitionErrorContractTest extends TestCase
{
    use RefreshDatabase;

    private User $staf;

    private User $kepalaTim;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $this->staf = User::factory()->create(['team_id' => $team->id]);
        $this->staf->assignRole('staf');
        $this->kepalaTim = User::factory()->create(['team_id' => $team->id]);
        $this->kepalaTim->assignRole('kepala_tim');

        ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_approve_of_already_approved_package_renders_422_envelope(): void
    {
        $id = $this->submittedPackage();

        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$id}/approve")->assertOk();

        $this->postJson("/api/changes/{$id}/approve")
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Hanya paket pending yang dapat disetujui.');
    }

    public function test_reject_of_already_rejected_package_renders_422_envelope(): void
    {
        $id = $this->submittedPackage();

        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$id}/reject")->assertOk();

        $this->postJson("/api/changes/{$id}/reject")
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Hanya paket pending yang dapat ditolak.');
    }

    public function test_submit_of_non_draft_package_renders_422_envelope(): void
    {
        $id = $this->submittedPackage();

        Sanctum::actingAs($this->staf);
        $this->postJson("/api/changes/{$id}/submit", $this->validSubmitPayload())
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Hanya paket draft yang dapat disubmit.');
    }

    private function submittedPackage(): int
    {
        Sanctum::actingAs($this->staf);
        $pkg = $this->postJson('/api/changes', $this->validDraftWithAll())->json('data.initiation');
        $this->postJson("/api/changes/{$pkg['id']}/submit", $this->validSubmitPayload());

        return $pkg['id'];
    }

    /**
     * Payload builders mirroring ChangePackageFlowTest (kept local so this
     * contract test does not depend on another suite's private helpers).
     */
    private function validDraftWithAll(): array
    {
        return [
            'initiation' => [
                'field_id' => Field::first()->id,
                'description' => 'Deskripsi perubahan',
                'reason' => 'Alasan perubahan',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
                'change_type_ids' => [ChangeType::first()->id],
                'test_plan' => 'Rencana uji',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15',
                'implementation_result' => 'Selesai',
            ],
        ];
    }

    private function validSubmitPayload(): array
    {
        return [
            'initiation' => [
                'field_id' => Field::first()->id,
                'description' => 'Deskripsi perubahan',
                'reason' => 'Alasan perubahan',
                'needed_by_date' => '2026-09-01',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
                'change_type_ids' => [ChangeType::first()->id],
                'test_plan' => 'Rencana uji',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15',
                'implementation_result' => 'Selesai',
            ],
        ];
    }
}
