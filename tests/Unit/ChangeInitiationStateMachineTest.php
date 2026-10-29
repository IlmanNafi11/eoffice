<?php

namespace Tests\Unit;

use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Exceptions\ApiException;
use App\Models\Field;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class ChangeInitiationStateMachineTest extends TestCase
{
    use RefreshDatabase;

    private ChangeManagementRepositoryInterface $repo;

    private User $initiator;

    private Field $field;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repo = app(ChangeManagementRepositoryInterface::class);
        $this->initiator = User::factory()->create();
        $this->field = Field::factory()->create();
    }

    private function baseInitiation(): array
    {
        return [
            'field_id' => $this->field->id,
            'initiator_id' => $this->initiator->id,
            'doc_number' => 'T/'.Str::uuid()->toString().'/9/1.1/114/'.date('Y'),
            'initiation_date' => now()->toDateString(),
            'description' => 'Test change package',
            'reason' => 'Testing state machine',
        ];
    }

    public function test_draft_package_can_be_submitted(): void
    {
        $package = $this->repo->createPackage(
            $this->baseInitiation(),
            [],
            [],
        );

        $this->repo->transitionPackage($package->id, 'pending');

        $fresh = $package->fresh();
        $this->assertEquals('pending', $fresh->status);
        $this->assertEquals('submitted', $fresh->implementation->status);
    }

    public function test_pending_package_can_be_approved(): void
    {
        $package = $this->repo->createPackage(
            $this->baseInitiation(),
            [],
            [],
        );
        $this->repo->transitionPackage($package->id, 'pending');

        $this->repo->transitionPackage($package->id, 'approved');

        $fresh = $package->fresh();
        $this->assertEquals('approved', $fresh->status);
        $this->assertEquals('completed', $fresh->implementation->status);
    }

    public function test_pending_package_can_be_rejected(): void
    {
        $package = $this->repo->createPackage(
            $this->baseInitiation(),
            [],
            [],
        );
        $this->repo->transitionPackage($package->id, 'pending');

        $this->repo->transitionPackage($package->id, 'rejected');

        $fresh = $package->fresh();
        $this->assertEquals('rejected', $fresh->status);
        $this->assertEquals('rejected', $fresh->implementation->status);
    }

    public function test_rejected_is_terminal(): void
    {
        $package = $this->repo->createPackage(
            $this->baseInitiation(),
            [],
            [],
        );
        $this->repo->transitionPackage($package->id, 'pending');
        $this->repo->transitionPackage($package->id, 'rejected');

        $this->expectException(ApiException::class);
        $this->repo->transitionPackage($package->id, 'pending');
    }

    public function test_approved_is_terminal(): void
    {
        $package = $this->repo->createPackage(
            $this->baseInitiation(),
            [],
            [],
        );
        $this->repo->transitionPackage($package->id, 'pending');
        $this->repo->transitionPackage($package->id, 'approved');

        $this->expectException(ApiException::class);
        $this->repo->transitionPackage($package->id, 'pending');
    }
}
