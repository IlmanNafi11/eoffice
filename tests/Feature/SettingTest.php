<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_admin_can_list_settings(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/settings')
            ->assertStatus(200)
            ->assertJsonStructure(['data' => [
                'password_default_admin',
                'password_default_user',
                'wfh_allowed_days',
                'wfh_sessions',
            ]]);
    }

    public function test_non_admin_cannot_list_settings(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->getJson('/api/admin/settings')
            ->assertStatus(403);
    }

    public function test_admin_can_update_setting(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/wfh_allowed_days', [
            'value' => [1, 2, 3, 4, 5, 6],
        ])->assertStatus(200);

        $this->assertEquals([1, 2, 3, 4, 5, 6], Setting::get('wfh_allowed_days'));
    }

    public function test_password_default_rejects_a_value_over_255_characters(): void
    {
        // A default is applied verbatim to every bulk-created account, so an
        // unbounded value is a mass credential-stuffing vector (ship review #3).
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/password_default_user', [
            'value' => str_repeat('a', 256),
        ])->assertStatus(422);
    }

    public function test_password_default_rejects_a_value_under_8_characters(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/password_default_user', [
            'value' => 'short',
        ])->assertStatus(422);
    }

    public function test_non_password_settings_are_not_length_limited(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/wfh_notify_start_time', [
            'value' => str_repeat('x', 300),
        ])->assertStatus(200);
    }

    public function test_update_nonexistent_setting_returns_404(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/non_existent_key', [
            'value' => 'some_value',
        ])->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    public function test_get_returns_default_for_nonexistent_key(): void
    {
        $this->assertEquals('default_value', Setting::get('non_existent', 'default_value'));
        $this->assertNull(Setting::get('another_non_existent'));
    }

    public function test_set_creates_new_setting_when_key_not_exists(): void
    {
        $this->assertNull(Setting::get('brand_new_key'));

        Setting::set('brand_new_key', 'fresh_value');

        $this->assertEquals('fresh_value', Setting::get('brand_new_key'));
        $this->assertDatabaseHas('settings', [
            'key' => 'brand_new_key',
            'value' => 'fresh_value',
        ]);
    }

    public function test_set_get_preserves_array_values(): void
    {
        $array = ['pagi', 'siang', 'sore'];
        Setting::set('test_sessions', $array);
        $this->assertSame($array, Setting::get('test_sessions'));
    }

    public function test_set_get_preserves_integer_string(): void
    {
        Setting::set('test_answer', '0');
        $this->assertSame('0', Setting::get('test_answer'));
    }

    public function test_set_get_does_not_mutate_numeric_string_that_is_valid_json(): void
    {
        Setting::set('test_number', '42');
        $this->assertSame('42', Setting::get('test_number'));
    }

    public function test_update_setting_validates_value_required(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/wfh_allowed_days', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_admin_can_list_settings_with_exact_seeded_values(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/settings')
            ->assertStatus(200)
            ->assertJson([
                'data' => [
                    'password_default_admin' => 'admin123',
                    'password_default_user' => 'user1234',
                    'wfh_allowed_days' => [1, 2, 3, 4, 5],
                    'wfh_sessions' => ['pagi', 'siang', 'sore'],
                ],
            ]);
    }

    public function test_index_reads_settings_table_once(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        // Simulate a cold process: the seeder warms the static cache, so without
        // this reset the assertion would pass vacuously on cached values.
        $cache = new \ReflectionProperty(Setting::class, 'cache');
        $cache->setAccessible(true);
        $cache->setValue(null, []);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->getJson('/api/admin/settings')
            ->assertStatus(200)
            ->assertJsonPath('data.password_default_admin', 'admin123')
            ->assertJsonPath('data.wfh_allowed_days', [1, 2, 3, 4, 5]);

        $selects = 0;
        foreach (DB::getQueryLog() as $entry) {
            $query = strtolower(ltrim($entry['query']));
            if (str_starts_with($query, 'select') && str_contains($query, '"settings"')) {
                $selects++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(1, $selects, 'Settings table must be read exactly once.');
    }
}
