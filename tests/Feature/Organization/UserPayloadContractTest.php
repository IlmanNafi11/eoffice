<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * dedup-http §1: UserResource is the single source of the user payload.
 * `/auth/me` and `/admin/users/{id}` must emit the same shared-key set, and
 * the drifted `direct_permissions` key must be gone from both.
 */
class UserPayloadContractTest extends TestCase
{
    use RefreshDatabase;

    private const SHARED_KEYS = [
        'id', 'name', 'nip', 'email', 'rank', 'position', 'phone',
        'signature_path', 'signature_url', 'must_change_password', 'is_active',
        'roles', 'permissions', 'team',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_auth_me_and_admin_user_share_the_same_payload_keys(): void
    {
        $field = Field::create(['name' => 'Bidang Kontrak']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Kontrak']);

        $admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin Kontrak',
            'nip' => '0000000001',
            'email' => 'admin@kontrak.test',
            'password' => Hash::make('password'),
            'must_change_password' => false,
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        Sanctum::actingAs($admin);

        $me = $this->getJson('/api/auth/me')->assertStatus(200)->json('data');
        $show = $this->getJson("/api/admin/users/{$admin->id}")->assertStatus(200)->json('data');

        foreach (self::SHARED_KEYS as $key) {
            $this->assertArrayHasKey($key, $me, "/auth/me harus memuat '{$key}'");
            $this->assertArrayHasKey($key, $show, "/admin/users/{id} harus memuat '{$key}'");
        }

        $this->assertArrayNotHasKey('direct_permissions', $me, '/auth/me tidak boleh memuat direct_permissions');
        $this->assertArrayNotHasKey('direct_permissions', $show, '/admin/users/{id} tidak boleh memuat direct_permissions');
    }
}
