<?php

namespace Database\Seeders;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Illuminate\Database\Seeder;

class DemoUsersSeeder extends Seeder
{
    /**
     * Seed demo users for staf, kepala_tim, and kepala_bidang roles.
     *
     * Admin is seeded separately by AdminUserSeeder.
     * Uses firstOrCreate so it is safe to re-run.
     */
    public function run(): void
    {
        $field = Field::firstOrCreate(
            ['name' => 'Bidang Pengembangan Aplikasi'],
        );

        $team = Team::firstOrCreate(
            ['name' => 'Tim Pengembangan'],
            ['field_id' => $field->id],
        );

        $staf = User::firstOrCreate(
            ['email' => 'staf@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Siti Staf',
                'nip' => '1111111111',
                'password' => 'password123',
                'is_active' => true,
            ],
        );
        $staf->assignRole(Roles::STAF);

        $kepalaTim = User::firstOrCreate(
            ['email' => 'kepala.tim@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Koko Kepala Tim',
                'nip' => '2222222222',
                'password' => 'password123',
                'is_active' => true,
            ],
        );
        $kepalaTim->assignRole(Roles::KEPALA_TIM);

        $kepalaBidang = User::firstOrCreate(
            ['email' => 'kepala.bidang@kominfo.go.id'],
            [
                'team_id' => $team->id,
                'name' => 'Budi Kepala Bidang',
                'nip' => '3333333333',
                'password' => 'password123',
                'is_active' => true,
            ],
        );
        $kepalaBidang->assignRole(Roles::KEPALA_BIDANG);

        // Circular references — KT is team leader, KB is field head.
        $team->update(['leader_id' => $kepalaTim->id]);
        $field->update(['head_id' => $kepalaBidang->id]);
    }
}
