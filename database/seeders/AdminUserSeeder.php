<?php

namespace Database\Seeders;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $field = Field::firstOrCreate(
            ['name' => 'Bidang Aplikasi Informatika'],
        );
        $team = Team::firstOrCreate(
            ['name' => 'Tim Aplikasi'],
            ['field_id' => $field->id],
        );

        $admin = User::firstOrCreate(
            ['nip' => '0000000000'],
            [
                'team_id' => $team->id,
                'name' => 'Administrator',
                'email' => 'admin@kominfo.go.id',
                'password' => config('app.admin_password', Str::random(24)),
                'is_active' => true,
            ],
        );
        $admin->assignRole(Roles::ADMIN);

        // Set circular refs
        $field->update(['head_id' => $admin->id]);
        $team->update(['leader_id' => $admin->id]);
    }
}
