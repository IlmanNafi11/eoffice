<?php

namespace Tests\Feature\Organization;

use App\Models\Setting;
use App\Support\Users\DefaultPassword;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A full db:seed in production must not hand out a documented password.
 * SettingsSeeder previously committed password_default_admin=admin123 and
 * password_default_user=user1234 in every environment, and UserController
 * store/import apply those to every account they create.
 */
class ProductionSeedSafetyTest extends TestCase
{
    use RefreshDatabase;

    public function test_settings_seeder_does_not_seed_credentials_in_production(): void
    {
        app()['env'] = 'production';
        $cache = new \ReflectionProperty(Setting::class, 'cache');
        $cache->setAccessible(true);
        $cache->setValue(null, []);

        (new SettingsSeeder)->run();

        $this->assertNull(Setting::get('password_default_admin'), 'Production must not seed a default admin password.');
        $this->assertNull(Setting::get('password_default_user'), 'Production must not seed a default user password.');

        // Non-credential settings still seed: the app needs its weekday/session config.
        $this->assertSame([1, 2, 3, 4, 5], Setting::get('wfh_allowed_days'));
    }

    public function test_bulk_creation_in_production_issues_random_passwords(): void
    {
        app()['env'] = 'production';
        $cache = new \ReflectionProperty(Setting::class, 'cache');
        $cache->setAccessible(true);
        $cache->setValue(null, []);

        (new SettingsSeeder)->run();

        $a = DefaultPassword::forRoles(['staf']);
        $b = DefaultPassword::forRoles(['staf']);

        $this->assertNotSame('user1234', $a);
        $this->assertNotSame('admin123', DefaultPassword::forRoles(['admin']));
        $this->assertNotSame($a, $b, 'Each bulk-created account must get its own random password.');
        $this->assertSame(24, strlen($a));
    }
}
