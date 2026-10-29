<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Http\Controllers\ChangePackageController;
use App\Domains\ChangeManagement\Models\ChangeType;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Repositories\EloquentChangeManagementRepository;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\Sanctum;
use ReflectionClass;
use Tests\TestCase;

/**
 * dedup-state Task 2 — one definition of package visibility.
 *
 * The visibility rule must live in a single query scope on the repository
 * (packageVisibleTo), not a duplicate PHP predicate on the controller. A
 * package is either visible in both index and show, or in neither — for every
 * role. This pins the index-vs-show consistency contract that guards against
 * the two definitions drifting apart.
 */
class IndexShowVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private Team $ownTeam;

    private Team $otherTeam;

    private User $staf;

    private User $kepalaTimOwn;

    private User $kepalaTimOther;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $this->field = Field::factory()->create();
        $this->ownTeam = Team::factory()->create(['field_id' => $this->field->id]);
        $this->otherTeam = Team::factory()->create(['field_id' => $this->field->id]);

        $this->staf = User::factory()->create(['team_id' => $this->ownTeam->id]);
        $this->staf->assignRole('staf');

        $this->kepalaTimOwn = User::factory()->create(['team_id' => $this->ownTeam->id]);
        $this->kepalaTimOwn->assignRole('kepala_tim');

        $this->kepalaTimOther = User::factory()->create(['team_id' => $this->otherTeam->id]);
        $this->kepalaTimOther->assignRole('kepala_tim');

        $this->admin = User::factory()->create(['team_id' => $this->ownTeam->id]);
        $this->admin->assignRole('admin');

        ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_repository_interface_declares_package_visible_to(): void
    {
        $this->assertTrue(
            (new ReflectionClass(ChangeManagementRepositoryInterface::class))->hasMethod('packageVisibleTo'),
            'ChangeManagementRepositoryInterface must declare packageVisibleTo().'
        );

        $this->assertTrue(
            (new ReflectionClass(EloquentChangeManagementRepository::class))->hasMethod('packageVisibleTo'),
            'EloquentChangeManagementRepository must implement packageVisibleTo().'
        );
    }

    public function test_controller_has_no_duplicate_visibility_predicate(): void
    {
        $this->assertFalse(
            (new ReflectionClass(ChangePackageController::class))->hasMethod('actorCanAccessPackage'),
            'ChangePackageController must not declare its own actorCanAccessPackage() copy.'
        );
    }

    public function test_staf_sees_own_package_in_index_and_show(): void
    {
        $id = $this->createDraft();

        Sanctum::actingAs($this->staf);

        $this->assertContains(
            $id,
            $this->getJson('/api/changes')->json('data.*.initiation.id'),
            'Staf must see their own package in index.'
        );

        $this->getJson("/api/changes/{$id}")->assertStatus(200);
    }

    public function test_staf_other_team_sees_package_neither_in_index_nor_show(): void
    {
        $id = $this->createDraft();

        Sanctum::actingAs($this->kepalaTimOther);

        $this->assertNotContains(
            $id,
            $this->getJson('/api/changes')->json('data.*.initiation.id'),
            'Another-team kepala_tim must not see the package in index.'
        );

        $this->getJson("/api/changes/{$id}")->assertStatus(403);
    }

    public function test_admin_sees_package_in_index_and_show(): void
    {
        $id = $this->createDraft();

        Sanctum::actingAs($this->admin);

        $this->assertContains(
            $id,
            $this->getJson('/api/changes')->json('data.*.initiation.id'),
            'Admin must see the package in index.'
        );

        $this->getJson("/api/changes/{$id}")->assertStatus(200);
    }

    private function createDraft(): int
    {
        Sanctum::actingAs($this->staf);

        return $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ])->assertStatus(201)->json('data.initiation.id');
    }
}
