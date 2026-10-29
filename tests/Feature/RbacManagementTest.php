<?php

namespace Tests\Feature;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RbacManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $this->admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin',
            'nip' => '0000000001',
            'email' => 'admin@test.com',
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $this->admin->assignRole('admin');
    }

    // === RoleController ===

    public function test_admin_can_list_all_roles_with_permissions(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/roles')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name', 'permissions'],
                ],
            ]);
    }

    public function test_non_admin_cannot_list_roles(): void
    {
        $staf = User::factory()->create();
        $staf->assignRole('staf');

        Sanctum::actingAs($staf);

        $this->getJson('/api/admin/roles')->assertStatus(403);
    }

    public function test_admin_can_update_role_permissions(): void
    {
        Sanctum::actingAs($this->admin);

        $role = Role::where('name', 'staf')->first();

        $this->putJson("/api/admin/roles/{$role->id}/permissions", [
            'permissions' => ['wfh.report.create', 'wfh.report.submit'],
        ])
            ->assertStatus(200)
            ->assertJsonPath('success', true);

        $role->refresh();
        $this->assertTrue($role->hasPermissionTo('wfh.report.create'));
        $this->assertTrue($role->hasPermissionTo('wfh.report.submit'));
        $this->assertFalse($role->hasPermissionTo('wfh.report.approve'));
    }

    // === New delete permissions are assigned to all four roles ===

    public function test_new_delete_permissions_are_assigned_to_all_four_roles(): void
    {
        $permissions = [
            'wfh.report.activity.delete',
            'wfh.report.attendance.delete',
            'change.initiation.delete',
        ];

        foreach ($permissions as $permission) {
            $this->assertDatabaseHas('permissions', ['name' => $permission]);
        }

        foreach (Roles::ALL as $roleName) {
            $role = Role::where('name', $roleName)->first();
            $this->assertNotNull($role, "Role {$roleName} should exist");
            foreach ($permissions as $permission) {
                $this->assertTrue(
                    $role->hasPermissionTo($permission),
                    "Role {$roleName} should have {$permission}"
                );
            }
        }
    }

    // === Protected Role Lockout Prevention ===

    public function test_cannot_strip_critical_permissions_from_admin_role(): void
    {
        Sanctum::actingAs($this->admin);

        $adminRole = Role::where('name', 'admin')->first();

        // Attempt to strip all critical permissions — should be rejected
        $this->putJson("/api/admin/roles/{$adminRole->id}/permissions", [
            'permissions' => ['wfh.report.create'],
        ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', fn ($msg) => str_contains($msg, 'user.manage'));
    }

    public function test_can_update_admin_permissions_if_critical_kept(): void
    {
        Sanctum::actingAs($this->admin);

        $adminRole = Role::where('name', 'admin')->first();

        // Keep all critical permissions, add nothing else
        $this->putJson("/api/admin/roles/{$adminRole->id}/permissions", [
            'permissions' => ['role.manage', 'permission.manage', 'user.manage'],
        ])
            ->assertStatus(200)
            ->assertJsonPath('success', true);
    }

    // === PermissionController ===

    public function test_admin_can_list_all_permissions(): void
    {
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/admin/permissions')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'name'],
                ],
            ]);
    }

    public function test_non_admin_cannot_list_permissions(): void
    {
        $staf = User::factory()->create();
        $staf->assignRole('staf');

        Sanctum::actingAs($staf);

        $this->getJson('/api/admin/permissions')->assertStatus(403);
    }

    // === Multi-Role + Direct Permission Assignment ===

    public function test_user_can_be_assigned_multiple_roles(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'name' => 'Multi Role User',
            'nip' => '1234567891',
            'email' => 'multi@test.com',
            'password' => 'SecurePass123',
            'roles' => ['staf', 'kepala_tim'],
        ]);

        $response->assertStatus(201);

        // Roles are a set, not an ordered list — Spatie returns pivot order
        // which is non-deterministic across runs (flaky when asserted as array).
        $this->assertEqualsCanonicalizing(['staf', 'kepala_tim'], $response->json('data.roles'));

        $user = User::where('email', 'multi@test.com')->first();
        $this->assertTrue($user->hasRole('staf'));
        $this->assertTrue($user->hasRole('kepala_tim'));
    }

    public function test_user_can_be_assigned_direct_permissions(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'name' => 'Direct Perm User',
            'nip' => '1234567892',
            'email' => 'direct@test.com',
            'password' => 'SecurePass123',
            'roles' => ['staf'],
            'permissions' => ['wfh.report.approve'],
        ]);

        $response->assertStatus(201);

        $user = User::where('email', 'direct@test.com')->first();
        $this->assertTrue($user->hasDirectPermission('wfh.report.approve'));
    }

    public function test_update_user_can_sync_roles_and_permissions(): void
    {
        Sanctum::actingAs($this->admin);

        // Create user with staf role
        $createResponse = $this->postJson('/api/admin/users', [
            'name' => 'Update Test',
            'nip' => '1234567893',
            'email' => 'update@test.com',
            'password' => 'SecurePass123',
            'roles' => ['staf'],
        ]);
        $userId = $createResponse->json('data.id');

        // Update: change to kepala_bidang + add direct permission
        $this->putJson("/api/admin/users/{$userId}", [
            'roles' => ['kepala_bidang'],
            'permissions' => ['change.implementation.review'],
        ])
            ->assertStatus(200)
            ->assertJsonPath('data.roles', ['kepala_bidang']);

        $user = User::find($userId);
        $this->assertTrue($user->hasRole('kepala_bidang'));
        $this->assertFalse($user->hasRole('staf'));
        $this->assertTrue($user->hasDirectPermission('change.implementation.review'));
    }

    public function test_validation_rejects_nonexistent_role(): void
    {
        Sanctum::actingAs($this->admin);

        $this->postJson('/api/admin/users', [
            'name' => 'Bad Role',
            'nip' => '1234567894',
            'email' => 'bad@test.com',
            'password' => 'SecurePass123',
            'roles' => ['superhero'],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['roles.0']);
    }
}
