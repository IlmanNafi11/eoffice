<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TeamEndpointTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->user = User::factory()->create();
    }

    public function test_guest_gets_401(): void
    {
        $this->getJson('/api/teams')
            ->assertUnauthorized();
    }

    public function test_staf_sees_only_teams_in_own_field(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/teams');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonStructure([
                'success',
                'data' => [
                    '*' => ['id', 'name', 'leader_id', 'field_id'],
                ],
            ]);

        foreach ($response->json('data') as $team) {
            $this->assertEquals($field->id, $team['field_id']);
        }
    }

    public function test_field_id_parameter_is_ignored_for_scoped_user(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/teams?field_id='.$otherField->id);

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals($field->id, $response->json('data.0.field_id'));
    }

    public function test_kepala_tim_sees_all_teams_in_own_field_not_only_led_teams(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        $ledTeam = Team::factory()->create(['field_id' => $field->id, 'leader_id' => null]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $teamLeader = User::factory()->create(['team_id' => $ownTeam->id]);
        $teamLeader->assignRole('kepala_tim');
        $ledTeam->update(['leader_id' => $teamLeader->id]);
        Sanctum::actingAs($teamLeader);

        $response = $this->getJson('/api/teams');

        $response->assertOk()->assertJsonCount(2, 'data');

        foreach ($response->json('data') as $team) {
            $this->assertEquals($field->id, $team['field_id']);
        }
    }

    public function test_kepala_bidang_sees_all_teams_in_own_field(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        $team = Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $fieldHead = User::factory()->create(['team_id' => $team->id]);
        $fieldHead->assignRole('kepala_bidang');
        $field->update(['head_id' => $fieldHead->id]);
        Sanctum::actingAs($fieldHead);

        $response = $this->getJson('/api/teams');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals($field->id, $response->json('data.0.field_id'));
    }

    public function test_monitoring_permission_does_not_grant_access_to_all_fields(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $monitor = User::factory()->create(['team_id' => $ownTeam->id]);
        $monitor->assignRole('kepala_tim');
        $this->assertTrue($monitor->hasPermissionTo('wfh.monitoring.view'));
        Sanctum::actingAs($monitor);

        $response = $this->getJson('/api/teams');

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertEquals($field->id, $response->json('data.0.field_id'));
    }

    public function test_admin_sees_all_teams(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/teams')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_admin_field_id_filter_still_works(): void
    {
        $engineering = Field::factory()->create();
        $operations = Field::factory()->create();

        Team::factory(2)->create(['field_id' => $engineering->id]);
        Team::factory(3)->create(['field_id' => $operations->id]);

        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/teams?field_id='.$engineering->id);

        $response->assertOk()
            ->assertJsonCount(2, 'data');

        foreach ($response->json('data') as $team) {
            $this->assertEquals($engineering->id, $team['field_id']);
        }
    }

    public function test_user_with_user_manage_permission_sees_all_teams(): void
    {
        $field = Field::factory()->create();
        $otherField = Field::factory()->create();

        Team::factory()->create(['field_id' => $field->id]);
        Team::factory()->create(['field_id' => $otherField->id]);

        $manager = User::factory()->create();
        $manager->givePermissionTo('user.manage');
        Sanctum::actingAs($manager);

        $this->getJson('/api/teams')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_without_team_or_field_returns_empty_list(): void
    {
        $team = Team::factory()->create();

        $orphan = User::factory()->create(['team_id' => null]);
        $orphan->assignRole('staf');
        Sanctum::actingAs($orphan);

        $this->getJson('/api/teams')
            ->assertOk()
            ->assertJson(['data' => []]);

        $this->assertNotNull($team->id);
    }

    public function test_excludes_soft_deleted_teams(): void
    {
        $field = Field::factory()->create();

        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        $active = Team::factory()->create(['field_id' => $field->id]);
        $deleted = Team::factory()->create(['name' => 'Deleted Team', 'field_id' => $field->id]);
        $deleted->delete();

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $response = $this->getJson('/api/teams');

        $response->assertOk()->assertJsonCount(2, 'data');

        $ids = array_column($response->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$ownTeam->id, $active->id], $ids);
    }

    public function test_returns_empty_when_no_teams(): void
    {
        $field = Field::factory()->create();
        $ownTeam = Team::factory()->create(['field_id' => $field->id]);
        $ownTeam->delete();

        $staff = User::factory()->create(['team_id' => $ownTeam->id]);
        $staff->assignRole('staf');
        Sanctum::actingAs($staff);

        $this->getJson('/api/teams')
            ->assertOk()
            ->assertJson(['data' => []]);
    }
}
