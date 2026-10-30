<?php

namespace App\Support\Users;

use App\Models\Setting;
use App\Support\Constants\Roles;
use RuntimeException;

class DefaultPassword
{
    /**
     * Default password applied to a freshly created/imported user.
     *
     * Falls back to a random password instead of a documented literal: a
     * settings table seeded out of order used to silently issue "admin123" /
     * "user1234" (ship review S3). A default password is a bootstrap secret,
     * and every account created this way is flagged must_change_password.
     */
    public static function forRoles(array $roles): string
    {
        $isAdmin = in_array(Roles::ADMIN, $roles, true);

        $key = $isAdmin ? 'password_default_admin' : 'password_default_user';

        $password = Setting::get($key);

        return $password !== null && $password !== ''
            ? $password
            : self::generateRandom($key);
    }

    /**
     * Generate a random password when no default is configured.
     *
     * Always available: this runs during user creation/import, where throwing
     * would break a bulk operation rather than fail a login.
     */
    private static function generateRandom(string $missingKey): string
    {
        report(new RuntimeException(
            "Default password setting '{$missingKey}' is missing; a random password was generated instead.",
        ));

        return str()->random(24);
    }
}
