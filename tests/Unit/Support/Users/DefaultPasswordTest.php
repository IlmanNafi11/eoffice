<?php

namespace Tests\Unit\Support\Users;

use App\Models\Setting;
use App\Support\Users\DefaultPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DefaultPasswordTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_for_roles_returns_admin_setting_for_admin_role(): void
    {
        $this->assertSame('admin123', DefaultPassword::forRoles(['admin']));
    }

    public function test_for_roles_returns_user_setting_for_non_admin_role(): void
    {
        $this->assertSame('user1234', DefaultPassword::forRoles(['staf']));
    }

    public function test_for_roles_returns_user_setting_for_empty_roles(): void
    {
        $this->assertSame('user1234', DefaultPassword::forRoles([]));
    }

    public function test_for_roles_reflects_changed_setting(): void
    {
        Setting::set('password_default_admin', 'rotated-admin-pass');

        $this->assertSame('rotated-admin-pass', DefaultPassword::forRoles(['admin']));
    }

    public function test_for_roles_falls_back_to_random_when_settings_missing(): void
    {
        // Ship review S3: a fresh DB seeded out of order must not silently
        // issue the old hardcoded "admin123"/"user1234" fallbacks.
        // The seeder warms Setting's process-level static cache; without this
        // reset the assertions below would pass vacuously on cached values.
        $cache = new \ReflectionProperty(Setting::class, 'cache');
        $cache->setAccessible(true);
        $cache->setValue(null, []);

        Setting::query()->delete();

        $adminPassword = DefaultPassword::forRoles(['admin']);
        $userPassword = DefaultPassword::forRoles(['staf']);

        $this->assertNotSame('admin123', $adminPassword);
        $this->assertNotSame('user1234', $userPassword);
        $this->assertNotSame($adminPassword, $userPassword);
        $this->assertSame(24, strlen($adminPassword));
    }
}
