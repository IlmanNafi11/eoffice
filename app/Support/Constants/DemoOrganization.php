<?php

namespace App\Support\Constants;

/**
 * The single demo org unit every seed account lives in.
 *
 * AdminUserSeeder and DemoUsersSeeder used to declare their own literals; they
 * drifted apart and the admin ended up in a team nobody else could see or be
 * monitored with. Keep one source of truth and read it everywhere.
 */
class DemoOrganization
{
    public const FIELD = 'Bidang Pengembangan Aplikasi';

    public const TEAM = 'Tim Pengembangan';
}
