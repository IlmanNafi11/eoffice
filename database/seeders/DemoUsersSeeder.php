<?php

namespace Database\Seeders;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DemoUsersSeeder extends Seeder
{
    /**
     * Seed demo users for staf, kepala_tim, and kepala_bidang roles.
     *
     * Admin is seeded separately by AdminUserSeeder.
     * Uses firstOrCreate so it is safe to re-run.
     *
     * Demo accounts are a local-development convenience only. Seeding known
     * credentials (formerly the literal "password123" for three accounts,
     * including two privileged roles) turns every environment that runs a full
     * db:seed into a publicly documented login — the exact threat the hardened
     * AdminUserSeeder now fails closed against. Two guards:
     *   1. Refuse to run outside local/testing.
     *   2. Never commit a password: generate one and print it once.
     */
    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            $this->command?->warn(
                'DemoUsersSeeder dilewati: akun demo hanya untuk environment local/testing.',
            );

            return;
        }

        $field = Field::firstOrCreate(
            ['name' => 'Bidang Pengembangan Aplikasi'],
        );

        $team = Team::firstOrCreate(
            ['name' => 'Tim Pengembangan'],
            ['field_id' => $field->id],
        );

        $password = (string) config('app.demo_password', '');
        $generated = $password === '';
        $password = $generated ? Str::random(24) : $password;

        $staf = User::firstOrCreate(
            ['email' => 'staf@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Siti Staf',
                'nip' => '1111111111',
                'password' => $password,
                'is_active' => true,
                'must_change_password' => true,
            ],
        );
        $staf->assignRole(Roles::STAF);

        $kepalaTim = User::firstOrCreate(
            ['email' => 'kepala.tim@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Koko Kepala Tim',
                'nip' => '2222222222',
                'password' => $password,
                'is_active' => true,
                'must_change_password' => true,
            ],
        );
        $kepalaTim->assignRole(Roles::KEPALA_TIM);

        $kepalaBidang = User::firstOrCreate(
            ['email' => 'kepala.bidang@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Budi Kepala Bidang',
                'nip' => '3333333333',
                'password' => $password,
                'is_active' => true,
                'must_change_password' => true,
            ],
        );
        $kepalaBidang->assignRole(Roles::KEPALA_BIDANG);

        // Circular references — KT is team leader, KB is field head.
        $team->update(['leader_id' => $kepalaTim->id]);
        $field->update(['head_id' => $kepalaBidang->id]);

        if ($generated) {
            $this->command?->warn(
                "Password akun demo dibuat acak: {$password}\n".
                'Berlaku untuk staf@, kepala.tim@, kepala.bidang@kominfo.go.id. '.
                'Tidak ditampilkan lagi — set APP_DEMO_PASSWORD untuk menentukannya sendiri.',
            );
        }
    }
}
