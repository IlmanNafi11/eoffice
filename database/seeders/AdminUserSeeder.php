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

        // Fail closed: never seed a known password. A committed default turns
        // every fresh install into an admin takeover (documented credential,
        // publicly reachable API). Either the operator supplies one, or we
        // generate a random one and print it exactly once.
        $configured = (string) config('app.admin_password', '');
        $generated = $configured === '';
        $password = $generated ? Str::random(32) : $configured;

        $admin = User::firstOrCreate(
            ['nip' => '0000000000'],
            [
                'team_id' => $team->id,
                'name' => 'Administrator',
                'email' => 'admin@kominfo.go.id',
                'password' => $password,
                'is_active' => true,
                // Force rotation: the seeded credential is a bootstrap secret,
                // not a long-term one.
                'must_change_password' => true,
            ],
        );
        $admin->assignRole(Roles::ADMIN);

        if ($generated && $admin->wasRecentlyCreated) {
            $this->command?->warn(
                "APP_ADMIN_PASSWORD tidak diset. Password admin dibuat acak: {$password}\n".
                'Catat sekarang — password ini tidak ditampilkan lagi dan wajib diganti saat login pertama.',
            );
        }

        // Set circular refs
        $field->update(['head_id' => $admin->id]);
        $team->update(['leader_id' => $admin->id]);
    }
}
