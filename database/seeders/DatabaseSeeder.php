<?php

namespace Database\Seeders;

// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call([
            SettingsSeeder::class,
            RolePermissionSeeder::class,
            AdminUserSeeder::class,
            DemoUsersSeeder::class,
            ChangeTypeSeeder::class,
            DashboardDemoSeeder::class,
        ]);
    }
}
