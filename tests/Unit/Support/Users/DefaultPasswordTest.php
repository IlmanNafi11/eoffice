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
}
