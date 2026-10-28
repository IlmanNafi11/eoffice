<?php

namespace Tests\Feature\Http;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Envelope module (Task 3): app-root controllers (auth, settings, QR verify)
 * must emit the single ApiResponse contract — `success` on every response,
 * {success, data, message, meta} shape, 404 for missing setting keys.
 */
class EnvelopeContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_setting_index_has_success_key(): void
    {
        $admin = $this->adminUser();

        $response = $this->getJson('/api/admin/settings')
            ->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', null)
            ->assertJsonPath('meta', null);

        $body = $response->json();

        $keys = array_keys($body);
        sort($keys);
        $this->assertSame(['data', 'message', 'meta', 'success'], $keys);
    }

    public function test_setting_update_returns_success_and_data(): void
    {
        $admin = $this->adminUser();

        $this->putJson('/api/admin/settings/wfh_allowed_days', [
            'value' => [1, 2, 3, 4, 5, 6],
        ])->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.key', 'wfh_allowed_days')
            ->assertJsonPath('data.value', [1, 2, 3, 4, 5, 6]);

        $this->assertEquals([1, 2, 3, 4, 5, 6], Setting::get('wfh_allowed_days'));
    }

    public function test_setting_update_missing_key_returns_404_with_success_false(): void
    {
        $admin = $this->adminUser();

        $this->putJson('/api/admin/settings/non_existent_key', [
            'value' => 'some_value',
        ])->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    public function test_login_failure_always_carries_success_false(): void
    {
        $this->postJson('/api/auth/login', [
            'email' => 'ghost@example.com',
            'password' => 'wrong-password',
        ])->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    public function test_login_success_carries_envelope_shape(): void
    {
        $user = User::factory()->create([
            'password' => Hash::make('password123'),
            'must_change_password' => false,
        ]);

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password123',
        ])->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Login berhasil.')
            ->assertJsonStructure(['data' => ['token', 'user']]);
    }

    private function adminUser(): User
    {
        $user = User::factory()->create();
        $user->assignRole('admin');
        Sanctum::actingAs($user);

        return $user;
    }
}
