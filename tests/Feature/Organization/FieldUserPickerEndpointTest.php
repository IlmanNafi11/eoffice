<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldUserPickerEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson('/api/users')->assertUnauthorized();
    }

    public function test_staf_sees_only_active_users_in_own_field(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();
        $ownTeam = Team::factory()->create(['field_id' => $field->id]);

        $colleague = User::factory()->create(['team_id' => $ownTeam->id]);
        User::factory()->create(['team_id' => $ownTeam->id, 'is_active' => false]);
        $otherFieldPerson = User::factory()->create(
            ['team_id' => Team::factory()->create(['field_id' => $otherField->id])->id],
        );

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/users');

        // The actor themselves is an active user of the same field too.
        $ids = array_column($response->json('data'), 'id');
        $this->assertNotContains($otherFieldPerson->id, $ids);

        $response->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_picker_payload_is_lean_and_never_exposes_sensitive_fields(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id, 'leader_id' => null]);
        $member = User::factory()->create(['team_id' => $team->id]);
        $member->assignRole('staf');
        $member->givePermissionTo('user.manage');
        Sanctum::actingAs($member);

        $data = $this->getJson('/api/users')->assertOk()->json('data');
        $this->assertCount(1, $data);

        $pick = $data[0];
        $this->assertSame(
            ['id', 'name', 'nip', 'team'],
            array_keys($pick),
            'Picker payload must stay lean (SEC-01): no email/roles/permissions/must_change_password.',
        );
        $this->assertSame($member->id, $pick['id']);
        $this->assertSame($member->name, $pick['name']);
        $this->assertSame($member->nip, $pick['nip']);
        $this->assertSame(
            ['id', 'name', 'field'],
            array_keys($pick['team']),
            'Team node must omit leader when none is set, mirroring the FE PickerUser type.',
        );
    }

    public function test_inactive_users_never_listed_for_admin_too(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $active = User::factory()->create(['team_id' => $team->id]);
        User::factory()->create(['team_id' => $team->id, 'is_active' => false]);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/users');

        $response->assertOk()
            ->assertJsonPath('data.0.id', $active->id)
            ->assertJsonCount(1, 'data');
    }

    public function test_field_id_parameter_is_ignored_for_scoped_user(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();
        $ownTeam = Team::factory()->create(['field_id' => $field->id]);

        $colleague = User::factory()->create(['team_id' => $ownTeam->id]);
        User::factory()->create(['team_id' => Team::factory()->create(['field_id' => $otherField->id])->id]);

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/users?field_id='.$otherField->id);

        $response->assertOk()->assertJsonCount(2, 'data');

        // Scoped user: field_id is ignored — own bidang (incl. self), count 2.
        $ids = array_column($response->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$colleague->id, $staff->id], $ids);
    }

    public function test_admin_sees_all_active_users(): void
    {
        $fieldA = Field::factory()->create();
        $fieldB = Field::factory()->create();
        $teamA = Team::factory()->create(['field_id' => $fieldA->id]);
        $teamB = Team::factory()->create(['field_id' => $fieldB->id]);

        User::factory()->create(['team_id' => $teamA->id]);
        User::factory()->create(['team_id' => $teamB->id]);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_admin_field_id_filter_works(): void
    {
        $engineering = Field::factory()->create();
        $operations = Field::factory()->create();
        $teamEng = Team::factory()->create(['field_id' => $engineering->id]);
        $teamOps = Team::factory()->create(['field_id' => $operations->id]);

        User::factory()->create(['team_id' => $teamEng->id]);
        User::factory()->create(['team_id' => $teamEng->id]);
        User::factory()->create(['team_id' => $teamOps->id]);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/users?field_id='.$engineering->id)
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_manage_permission_sees_all_active_users(): void
    {
        $fieldA = Field::factory()->create();
        $fieldB = Field::factory()->create();

        User::factory()->create(['team_id' => Team::factory()->create(['field_id' => $fieldA->id])->id]);
        User::factory()->create(['team_id' => Team::factory()->create(['field_id' => $fieldB->id])->id]);

        $manager = User::factory()->create();
        $manager->givePermissionTo('user.manage');
        Sanctum::actingAs($manager);

        $this->getJson('/api/users')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_without_team_returns_empty_list(): void
    {
        $field = Field::factory()->create();
        Team::factory()->create(['field_id' => $field->id]);

        $orphan = User::factory()->create(['team_id' => null]);
        $orphan->assignRole('staf');
        Sanctum::actingAs($orphan);

        $this->getJson('/api/users')
            ->assertOk()
            ->assertJson(['data' => []]);
    }

    public function test_list_does_not_query_permissions_per_row(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $admin = User::factory()->create(['team_id' => $team->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        User::factory()->count(4)->create(['team_id' => $team->id])
            ->each(fn (User $user) => $user->assignRole('staf'));

        $this->getJson('/api/users')->assertOk();

        $pivotQueries = fn () => $this->countMatching('model_has_permissions');
        $roleQueries = fn () => $this->countMatching('model_has_roles');

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson('/api/users')->assertOk();
        $smallPivot = $pivotQueries();
        $smallRole = $roleQueries();
        $smallTotal = count(DB::getQueryLog());

        User::factory()->count(12)->create(['team_id' => $team->id])
            ->each(fn (User $user) => $user->assignRole('staf'));

        DB::flushQueryLog();
        $this->getJson('/api/users')->assertOk();
        $largePivot = $pivotQueries();
        $largeRole = $roleQueries();
        $largeTotal = count(DB::getQueryLog());

        $this->assertSame($smallPivot, $largePivot, 'Permission pivot queries must stay flat as rows grow.');
        $this->assertSame($smallRole, $largeRole, 'Role pivot queries must stay flat as rows grow.');
        $this->assertSame($smallTotal, $largeTotal, 'Total query count must stay flat as rows grow.');
        $this->assertGreaterThan(0, $largePivot, 'Permissions must still be loaded for the list.');
        $this->assertGreaterThan(0, $largeRole, 'Roles must still be loaded for the list.');
    }

    public function test_list_eager_loads_team_leaders_without_n_plus_one(): void
    {
        $admin = User::factory()->create(['team_id' => null]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        foreach (range(1, 5) as $i) {
            $leader = User::factory()->create();
            $team = Team::factory()->create(['leader_id' => $leader->id]);
            $member = User::factory()->create(['team_id' => $team->id]);
            $member->assignRole('staf');
        }

        DB::enableQueryLog();
        DB::flushQueryLog();
        $this->getJson('/api/users')->assertOk();

        $lazyLeaderLoads = $this->countMatching('"users"."id" = ? and "users"."deleted_at" is null');
        $this->assertSame(
            0,
            $lazyLeaderLoads,
            'team.leader must be batch-eager-loaded, never one query per row.',
        );
    }

    private function countMatching(string $needle): int
    {
        return collect(DB::getQueryLog())
            ->filter(fn (array $query) => str_contains($query['query'], $needle))
            ->count();
    }
}
