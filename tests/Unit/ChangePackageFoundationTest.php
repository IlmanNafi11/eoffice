<?php

namespace Tests\Unit;

use App\Domains\ChangeManagement\Http\Requests\DecideChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\StoreChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\SubmitChangePackageRequest;
use App\Domains\ChangeManagement\Http\Requests\UpdateChangePackageRequest;
use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Models\ChangeType;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Exceptions\ApiException;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class ChangePackageFoundationTest extends TestCase
{
    use RefreshDatabase;

    private ChangeManagementRepositoryInterface $repo;

    private Field $field;

    private User $initiator;

    private User $teammate;

    private User $outsider;

    private User $admin;

    private ChangeType $changeType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->repo = app(ChangeManagementRepositoryInterface::class);

        $this->field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $this->field->id]);
        $otherTeam = Team::factory()->create(['field_id' => $this->field->id]);

        $this->initiator = User::factory()->create(['team_id' => $team->id]);
        $this->teammate = User::factory()->create(['team_id' => $team->id]);
        $this->teammate->assignRole('kepala_tim');
        $this->outsider = User::factory()->create(['team_id' => $otherTeam->id]);
        $this->admin = User::factory()->create(['team_id' => $team->id]);
        $this->admin->assignRole('admin');

        $this->changeType = ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_unique_constraint_blocks_second_implementation_per_initiation(): void
    {
        $package = $this->createDraftPackage();

        $this->expectException(QueryException::class);

        ChangeImplementation::create([
            'change_initiation_id' => $package->id,
            'priority' => 'normal',
            'impact' => 'Minor',
            'status' => 'draft',
        ]);
    }

    public function test_create_package_returns_parent_with_single_child_in_transaction(): void
    {
        $package = $this->repo->createPackage(
            [
                'field_id' => $this->field->id,
                'initiator_id' => $this->initiator->id,
                'doc_number' => '001/9/1.1/114/'.date('Y'),
                'initiation_date' => now()->toDateString(),
                'description' => 'Desc',
                'reason' => 'Reason',
                'status' => 'draft',
            ],
            [
                'priority' => 'emergency',
                'impact' => 'Mayor',
                'test_plan' => 'Plan A',
                'status' => 'draft',
            ],
            [$this->changeType->id],
        );

        $this->assertInstanceOf(ChangeInitiation::class, $package);
        $this->assertNotNull($package->implementation);
        $this->assertEquals('draft', $package->status);
        $this->assertEquals('draft', $package->implementation->status);
        $this->assertEquals('emergency', $package->implementation->priority);
        $this->assertCount(1, $package->implementation->changeTypes);
        $this->assertEquals(1, ChangeImplementation::where('change_initiation_id', $package->id)->count());
    }

    public function test_update_package_updates_both_sides_and_syncs_types(): void
    {
        $package = $this->createDraftPackage();
        $otherType = ChangeType::create(['name' => 'Infrastruktur']);

        $updated = $this->repo->updatePackage(
            $package->id,
            ['description' => 'Updated desc', 'needed_by_date' => '2026-08-01'],
            [
                'priority' => 'emergency',
                'impact' => 'Mayor',
                'test_plan' => 'New plan',
                'execution_date' => '2026-08-02',
                'release_date' => '2026-08-03',
                'implementation_result' => 'Done',
            ],
            [$otherType->id],
        );

        $this->assertEquals('Updated desc', $updated->description);
        $this->assertEquals('2026-08-01', $updated->needed_by_date->toDateString());
        $this->assertEquals('emergency', $updated->implementation->priority);
        $this->assertEquals('New plan', $updated->implementation->test_plan);
        $this->assertEquals([$otherType->id], $updated->implementation->changeTypes->pluck('id')->all());
    }

    public function test_find_package_loads_relations(): void
    {
        $package = $this->createDraftPackage();

        $found = $this->repo->findPackage($package->id);

        $this->assertNotNull($found);
        $this->assertTrue($found->relationLoaded('implementation'));
        $this->assertTrue($found->implementation->relationLoaded('changeTypes'));
        $this->assertTrue($found->implementation->relationLoaded('attachments'));
        $this->assertTrue($found->relationLoaded('initiator'));
        $this->assertTrue($found->initiator->relationLoaded('team'));
    }

    public function test_transition_package_mirrors_child_status(): void
    {
        $package = $this->createDraftPackage();

        $this->repo->transitionPackage($package->id, 'pending', [
            'initiator_signed_at' => now(),
        ], []);
        $package->refresh();
        $this->assertEquals('pending', $package->status);
        $this->assertEquals('submitted', $package->implementation->status);

        $this->repo->transitionPackage($package->id, 'approved', [
            'reviewer_id' => $this->teammate->id,
            'review_status' => 'approved',
            'reviewed_at' => now(),
        ], [
            'reviewer_id' => $this->teammate->id,
            'responsible_id' => $this->teammate->id,
            'reviewer_signed_at' => now(),
            'responsible_signed_at' => now(),
        ]);
        $package->refresh();
        $this->assertEquals('approved', $package->status);
        $this->assertEquals('completed', $package->implementation->status);
        $this->assertEquals($this->teammate->id, $package->implementation->reviewer_id);
    }

    public function test_transition_package_reject_mirrors_rejected(): void
    {
        $package = $this->createDraftPackage();
        $this->repo->transitionPackage($package->id, 'pending', ['initiator_signed_at' => now()], []);

        $this->repo->transitionPackage($package->id, 'rejected', [
            'reviewer_id' => $this->teammate->id,
            'review_status' => 'rejected',
            'reviewed_at' => now(),
        ]);

        $package->refresh();
        $this->assertEquals('rejected', $package->status);
        $this->assertEquals('rejected', $package->implementation->status);
    }

    public function test_delete_package_soft_deletes_parent_and_child(): void
    {
        $package = $this->createDraftPackage();
        $implId = $package->implementation->id;

        $this->repo->deletePackage($package->id);

        $this->assertSoftDeleted('change_initiations', ['id' => $package->id]);
        $this->assertSoftDeleted('change_implementations', ['id' => $implId]);
    }

    public function test_paginate_packages_scopes_by_actor_team(): void
    {
        $own = $this->createDraftPackage();
        $this->repo->createPackage(
            [
                'field_id' => $this->field->id,
                'initiator_id' => $this->outsider->id,
                'doc_number' => '002/9/1.1/114/'.date('Y'),
                'initiation_date' => now()->toDateString(),
                'description' => 'Other',
                'reason' => 'Other',
                'status' => 'draft',
            ],
            ['status' => 'draft'],
            [],
        );

        $stafPage = $this->repo->paginatePackages(15, [], $this->initiator);
        $this->assertEquals(1, $stafPage->total());
        $this->assertEquals($own->id, $stafPage->items()[0]->id);

        $teamPage = $this->repo->paginatePackages(15, [], $this->teammate);
        $this->assertEquals(1, $teamPage->total());

        $adminPage = $this->repo->paginatePackages(15, [], $this->admin);
        $this->assertEquals(2, $adminPage->total());
    }

    public function test_paginate_packages_cross_team_kepala_tim_sees_zero(): void
    {
        $this->createDraftPackage();

        $crossTeamKt = User::factory()->create(['team_id' => $this->outsider->team_id]);
        $crossTeamKt->assignRole('kepala_tim');

        $page = $this->repo->paginatePackages(15, [], $crossTeamKt);
        $this->assertEquals(0, $page->total());
    }

    public function test_paginate_packages_kepala_tim_without_team_sees_zero(): void
    {
        $this->createDraftPackage();

        $orphanKt = User::factory()->create(['team_id' => null]);
        $orphanKt->assignRole('kepala_tim');

        $page = $this->repo->paginatePackages(15, [], $orphanKt);
        $this->assertEquals(0, $page->total());
    }

    public function test_transition_package_throws_on_invalid_status(): void
    {
        $package = $this->createDraftPackage();

        $this->expectException(ApiException::class);
        $this->expectExceptionMessage('Unknown package status: bogus');

        try {
            $this->repo->transitionPackage($package->id, 'bogus');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status());

            throw $e;
        }

        $this->repo->transitionPackage($package->id, 'bogus');
    }

    public function test_store_change_package_request_draft_rules_are_loose(): void
    {
        $rules = (new StoreChangePackageRequest)->rules();

        $validator = Validator::make([
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'x',
                'reason' => 'y',
            ],
            'implementation' => [
                'priority' => 'normal',
            ],
        ], $rules);

        $this->assertTrue($validator->passes(), $validator->errors()->toJson());
    }

    public function test_submit_change_package_request_requires_mvp_fields(): void
    {
        $rules = (new SubmitChangePackageRequest)->rules();

        $validator = Validator::make([
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'x',
                'reason' => 'y',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
            ],
        ], $rules);

        $this->assertTrue($validator->fails());
        $this->assertArrayHasKey('initiation.needed_by_date', $validator->errors()->toArray());
        $this->assertArrayHasKey('implementation.change_type_ids', $validator->errors()->toArray());
        $this->assertArrayHasKey('implementation.test_plan', $validator->errors()->toArray());
        $this->assertArrayHasKey('implementation.execution_date', $validator->errors()->toArray());
        $this->assertArrayHasKey('implementation.release_date', $validator->errors()->toArray());
        $this->assertArrayHasKey('implementation.implementation_result', $validator->errors()->toArray());
    }

    public function test_submit_change_package_request_passes_with_full_payload(): void
    {
        $rules = (new SubmitChangePackageRequest)->rules();

        $validator = Validator::make([
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'x',
                'reason' => 'y',
                'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'normal',
                'impact' => 'Minor',
                'change_type_ids' => [$this->changeType->id],
                'test_plan' => 'plan',
                'execution_date' => '2026-08-02',
                'release_date' => '2026-08-03',
                'implementation_result' => 'ok',
                'review_response' => 'Catatan staf',
            ],
        ], $rules);

        $this->assertTrue($validator->passes(), $validator->errors()->toJson());
    }

    public function test_decide_change_package_request_has_no_rules(): void
    {
        // Kepala tim decide is a pure approve/reject — no reason input accepted.
        $rules = (new DecideChangePackageRequest)->rules();

        $this->assertSame([], $rules);
    }

    public function test_update_change_package_request_exists_with_nested_shape(): void
    {
        $rules = (new UpdateChangePackageRequest)->rules();

        $this->assertArrayHasKey('initiation.field_id', $rules);
        $this->assertArrayHasKey('implementation.priority', $rules);
    }

    private function createDraftPackage(): ChangeInitiation
    {
        return $this->repo->createPackage(
            [
                'field_id' => $this->field->id,
                'initiator_id' => $this->initiator->id,
                'doc_number' => '099/9/1.1/114/'.date('Y').'/'.uniqid(),
                'initiation_date' => now()->toDateString(),
                'description' => 'Desc',
                'reason' => 'Reason',
                'status' => 'draft',
            ],
            [
                'priority' => 'normal',
                'impact' => 'Minor',
                'status' => 'draft',
            ],
            [$this->changeType->id],
        );
    }
}
