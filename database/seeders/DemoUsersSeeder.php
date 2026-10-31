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
     * AdminUserSeeder now fails closed against. Guards:
     *   1. Refuse to run outside local/testing.
     *   2. Never commit a password: generate one and print it once.
     *   3. Rotate stale rows: firstOrCreate cannot fix an account that an
     *      older seeder already created with the legacy literal password, so
     *      whenever APP_DEMO_PASSWORD is explicitly configured the stored
     *      password is overwritten (and flagged for rotation) on every run.
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
        $rotate = ! $generated;

        $accounts = [
            ['email' => 'staf@kominfo.go.id', 'name' => 'Siti Staf', 'nip' => '1111111111', 'role' => Roles::STAF],
            ['email' => 'kepala.tim@kominfo.go.id', 'name' => 'Koko Kepala Tim', 'nip' => '2222222222', 'role' => Roles::KEPALA_TIM],
            ['email' => 'kepala.bidang@kominfo.go.id', 'name' => 'Budi Kepala Bidang', 'nip' => '3333333333', 'role' => Roles::KEPALA_BIDANG],
        ];

        foreach ($accounts as $account) {
            $user = User::firstOrCreate(
                ['email' => $account['email']],
                [
                    'team_id' => $team->id,
                    'name' => $account['name'],
                    'nip' => $account['nip'],
                    'password' => $password,
                    'is_active' => true,
                    'must_change_password' => true,
                ],
            );

            if ($rotate) {
                $user->forceFill([
                    'password' => $password,
                    'must_change_password' => true,
                ])->save();
            }

            $user->assignRole($account['role']);
        }

        // Circular references — KT is team leader, KB is field head.
        $team->update(['leader_id' => User::where('email', 'kepala.tim@kominfo.go.id')->value('id')]);
        $field->update(['head_id' => User::where('email', 'kepala.bidang@kominfo.go.id')->value('id')]);

        if ($generated) {
            $this->command?->warn(
                "Password akun demo dibuat acak: {$password}\n".
                'Berlaku untuk staf@, kepala.tim@, kepala.bidang@kominfo.go.id. '.
                'Tidak ditampilkan lagi — set APP_DEMO_PASSWORD untuk menentukannya sendiri.',
            );
        }
    }
}
