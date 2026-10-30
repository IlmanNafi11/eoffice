<?php

namespace App\Support\Users;

use App\Models\Setting;
use App\Support\Constants\Roles;

class DefaultPassword
{
    public static function forRoles(array $roles): string
    {
        $isAdmin = in_array(Roles::ADMIN, $roles, true);

        return $isAdmin
            ? Setting::get('password_default_admin', 'admin123')
            : Setting::get('password_default_user', 'user1234');
    }
}
