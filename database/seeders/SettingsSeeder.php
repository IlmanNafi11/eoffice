<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        // Never seed a credential outside local/testing. A committed default
        // password reaches production through db:seed and turns every
        // freshly-created or imported account into a documented login. The
        // operator must opt in explicitly (settings API, or APP_ADMIN_PASSWORD
        // for the bootstrap account); until then DefaultPassword generates a
        // random value and logs it once, and every such account is flagged
        // must_change_password.
        if (app()->environment('local', 'testing')) {
            Setting::set('password_default_admin', 'admin123');
            Setting::set('password_default_user', 'user1234');
        }
        Setting::set('wfh_allowed_days', [1, 2, 3, 4, 5]); // Mon–Fri
        Setting::set('wfh_sessions', ['pagi', 'siang', 'sore']);
        Setting::set('wfh_notify_start_time', '15:00');
    }
}
