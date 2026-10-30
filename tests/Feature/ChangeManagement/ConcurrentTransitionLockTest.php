<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Exceptions\ApiException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Ship review TestCoverage gap #2: transitionPackage() is the only place this
 * app takes a row lock (lockForUpdate) to make a state change atomic. Nothing
 * exercised it, so deleting the lock — the classic double-approve race — was
 * invisible to the suite.
 *
 * The lock cannot be probed from a second connection under RefreshDatabase
 * (fixtures live inside this test's uncommitted transaction, so another
 * session sees no row at all). The real-state proof below is therefore the SQL
 * the repository issues: only SELECT ... FOR UPDATE closes the window where two
 * transactions both read 'pending' and both approve. A mutation that drops
 * lockForUpdate() fails it.
 */
class ConcurrentTransitionLockTest extends TestCase
{
    use RefreshDatabase;

    private ChangeManagementRepositoryInterface $repository;

    private ChangeInitiation $change;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $this->repository = $this->app->make(ChangeManagementRepositoryInterface::class);

        $this->change = ChangeInitiation::factory()->create(['status' => 'pending']);
    }

    public function test_transition_reads_the_row_with_for_update(): void
    {
        $queries = [];

        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        $this->repository->transitionPackage($this->change->id, 'approved');

        $lockingReads = array_values(array_filter(
            $queries,
            fn (string $sql) => str_contains(strtolower($sql), 'for update')
                && str_contains(strtolower($sql), 'change_initiations'),
        ));

        $this->assertNotSame(
            [],
            $lockingReads,
            'transitionPackage() must read the package row with SELECT ... FOR UPDATE. '
            .'Without it, two concurrent approve requests both read "pending" and both '
            .'write "approved": the state machine silently accepts a double transition.',
        );
    }

    public function test_transition_out_of_terminal_status_is_refused(): void
    {
        $this->repository->transitionPackage($this->change->id, 'approved');
        $this->assertSame('approved', $this->change->fresh()->status);

        try {
            $this->repository->transitionPackage($this->change->id, 'rejected');
            $this->fail('Terminal status must have no outgoing transitions.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status());
        }
    }

    public function test_unknown_package_status_is_refused_before_any_write(): void
    {
        try {
            $this->repository->transitionPackage($this->change->id, 'not-a-real-status');
            $this->fail('Unknown status must be refused.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status());
        }
    }

    public function test_draft_cannot_jump_straight_to_approved(): void
    {
        $draft = ChangeInitiation::factory()->create(['status' => 'draft']);

        try {
            $this->repository->transitionPackage($draft->id, 'approved');
            $this->fail('draft -> approved must be refused.');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->status());
        }

        $this->assertSame('draft', $draft->fresh()->status);
    }

    public function test_a_refused_transition_leaves_the_row_untouched(): void
    {
        // 'approved' is terminal, so the rejected follow-up must not have written
        // anything — not even a partial workflow column (the reason the whole
        // transition runs inside one transaction).
        $this->repository->transitionPackage($this->change->id, 'approved');

        $before = $this->change->fresh()->only(['status', 'reviewer_id', 'rejected_reason']);

        try {
            $this->repository->transitionPackage($this->change->id, 'rejected');
        } catch (ApiException) {
            // expected: terminal statuses have no outgoing transitions
        }

        $this->assertSame($before, $this->change->fresh()->only(['status', 'reviewer_id', 'rejected_reason']));
    }
}
