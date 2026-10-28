<?php

namespace Tests\Unit\Shared;

use App\Support\Constants\Roles;
use Tests\TestCase;

/**
 * A8: Role name literals must be sourced from the Roles::* constants, never
 * hardcoded, so the canonical role names live in exactly one place.
 */
class RolesConstantUsageTest extends TestCase
{
    /**
     * Files that assign or compare role names and must use Roles::* constants.
     */
    private const FILES = [
        'database/seeders/RolePermissionSeeder.php',
        'database/seeders/DemoUsersSeeder.php',
        'database/seeders/AdminUserSeeder.php',
        'app/Domains/ChangeManagement/Http/Controllers/ChangePackageController.php',
        'app/Domains/ChangeManagement/Repositories/EloquentChangeManagementRepository.php',
        'app/Domains/Organization/Http/Controllers/UserController.php',
        'app/Domains/Wfh/Http/Controllers/ReportController.php',
        'app/Domains/Wfh/Http/Controllers/TeamReportController.php',
        'app/Domains/Wfh/Http/Controllers/WfhMonitoringController.php',
        'app/Support/Import/UserImport.php',
    ];

    public function test_role_name_literals_are_absent_from_role_handling_files(): void
    {
        $literals = [Roles::ADMIN, Roles::KEPALA_BIDANG, Roles::KEPALA_TIM, Roles::STAF];
        $offenders = [];

        foreach (self::FILES as $relative) {
            $path = base_path($relative);
            $this->assertFileExists($path, "Expected file missing: {$relative}");

            $contents = file_get_contents($path);
            foreach ($literals as $literal) {
                // Match the literal as a quoted string token (single or double quotes).
                if (preg_match('/[\'"]'.preg_quote($literal, '/').'[\'"]/', $contents)) {
                    $offenders[] = "{$relative} contains hardcoded role literal '{$literal}'";
                }
            }
        }

        $this->assertEmpty(
            $offenders,
            "Role-name literals must be replaced with Roles::* constants:\n  - ".implode("\n  - ", $offenders)
        );
    }
}
