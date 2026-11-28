<?php

namespace Tests\Feature\Organization;

use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserListQueryCountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    /**
     * Ship review P1: Spatie's getAllPermissions() re-read the direct pivot
     * once per row, so the admin user list grew one model_has_permissions
     * SELECT per user. The resource now derives permission names from
     * eager-loaded relations; the list query count must stay flat.
     */
    public function test_admin_user_list_does_not_query_permissions_per_row(): void
    {
        $admin = User::factory()->create([
            'must_change_password' => false,
            'is_active' => true,
        ]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        User::factory()->count(4)->create()->each(fn (User $user) => $user->assignRole('staf'));

        // Warm auth/session state first, then measure a clean request. Both
        // measurements below are taken identically, so auth noise cannot be
        // mistaken for a per-row query.
        $this->getJson('/api/admin/users')->assertOk();

        $pivotQueries = fn () => $this->countMatching('model_has_permissions');
        $roleQueries = fn () => $this->countMatching('model_has_roles');

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson('/api/admin/users?per_page=100')->assertOk();
        $smallPivot = $pivotQueries();
        $smallRole = $roleQueries();
        $smallTotal = count(DB::getQueryLog());

        User::factory()->count(12)->create()->each(fn (User $user) => $user->assignRole('staf'));

        DB::flushQueryLog();
        $this->getJson('/api/admin/users?per_page=100')->assertOk();
        $largePivot = $pivotQueries();
        $largeRole = $roleQueries();
        $largeTotal = count(DB::getQueryLog());

        // The two eager loads (permissions, roles.permissions) touch the pivot
        // table a constant number of times. What must NOT happen is one extra
        // SELECT per row — the old getAllPermissions() N+1 (ship review P1).
        $this->assertSame(
            $smallPivot,
            $largePivot,
            'Permission pivot queries must stay flat as rows grow — a per-row N+1 is back.',
        );

        /*
         * Guard against the heuristic being defeated by a rename: if the pivot
         * is no longer queried at all (say the implementation moved to a join),
         * "flat" would be trivially true and this test would assert nothing.
         * So also require the relation to actually be loaded once, and every
         * query count — not just the pivot's — to stay flat.
         */
        $this->assertGreaterThan(0, $largePivot, 'Permissions must still be loaded for the list.');
        $this->assertGreaterThan(0, $largeRole, 'Roles must still be loaded for the list.');

        $this->assertSame(
            $smallTotal,
            $largeTotal,
            'Total query count must stay flat as rows grow, not just the pivot count.',
        );
    }

    /**
     * UserResource serializes `team.leader` for every row. Only `team.field`
     * used to be eager-loaded, so the admin list lazy-loaded one users row per
     * distinct team (measured: 13 lazy SELECTs for 13 teams). The list must
     * batch-load the leaders instead.
     */
    public function test_admin_user_list_does_not_lazy_load_team_leaders(): void
    {
        $admin = User::factory()->create([
            'must_change_password' => false,
            'is_active' => true,
        ]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        // Distinct non-admin leader per team: a lazy load cannot be served
        // from any cache, so every row would cost one SELECT.
        $leaderIds = [];
        $memberIds = [];
        foreach (range(1, 10) as $i) {
            $leader = User::factory()->create();
            $leaderIds[] = $leader->id;
            $team = Team::factory()->create(['leader_id' => $leader->id]);
            $member = User::factory()->create(['team_id' => $team->id]);
            $memberIds[$member->id] = $leader->id;
            $member->assignRole('staf');
        }

        DB::enableQueryLog();
        DB::flushQueryLog();
        $response = $this->getJson('/api/admin/users?per_page=100')->assertOk();

        $queries = collect(DB::getQueryLog());

        // The lazy-load signature is a by-key users SELECT (the eager load uses
        // a WHERE ... IN (...), which this pattern does not match).
        $lazyLeaderLoads = $queries
            ->filter(fn (array $query) => str_contains(
                $query['query'],
                '"users"."id" = ? and "users"."deleted_at" is null',
            ))
            ->count();

        $this->assertSame(
            0,
            $lazyLeaderLoads,
            'team.leader must be batch-eager-loaded, never one users SELECT per row.',
        );
        $this->assertGreaterThan(0, $queries->count(), 'Query log must not be empty.');
        $this->assertTrue(
            $queries->contains(fn (array $query) => str_contains(strtolower($query['query']), ' in (')),
            'Leaders must be loaded in one WHERE IN query.',
        );
        $rows = collect($response->json('data'))->keyBy('id');
        foreach ($memberIds as $memberId => $leaderId) {
            $this->assertSame($leaderId, $rows->get($memberId)['team']['leader']['id'] ?? null);
        }
    }

    /**
     * Count logged queries mentioning a table. Substring matching is only sound
     * when a zero result is treated as a failure (see the assertions above),
     * which is why the callers assert > 0 alongside flatness.
     */
    private function countMatching(string $needle): int
    {
        return collect(DB::getQueryLog())
            ->filter(fn (array $query) => str_contains($query['query'], $needle))
            ->count();
    }
}
