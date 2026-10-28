<?php

namespace Database\Seeders;

use App\Support\Constants\Roles;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Clear cached permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // === PERMISSIONS ===
        $permissions = [
            // User management
            'user.manage',
            'user.create',
            'user.update',
            'user.delete',
            'user.import',

            // RBAC management
            'role.manage',
            'permission.manage',

            // Organization
            'field.manage',
            'team.manage',

            // WFH
            'wfh.attendance.create',
            'wfh.report.create',
            'wfh.report.update',
            'wfh.report.delete',
            'wfh.report.submit',
            'wfh.report.approve',
            'wfh.report.reject',
            'wfh.monitoring.view',
            'wfh.report.export_pdf',

            // Change Management
            'change.initiation.view',
            'change.initiation.create',
            'change.initiation.update',
            'change.initiation.submit',
            'change.initiation.approve',
            'change.initiation.reject',
            'change.initiation.export_pdf',
            'change.implementation.view',
            'change.implementation.create',
            'change.implementation.update',
            'change.implementation.submit',
            'change.implementation.review',
            'change.implementation.export_pdf',

            // Settings
            'setting.manage',

            // WFH Team Reports (Phase 4)
            'wfh.team_report.view',
            'wfh.team_report.create',
            'wfh.team_report.approve',
            'wfh.team_report.reject',
        ];

        foreach ($permissions as $perm) {
            Permission::firstOrCreate(['name' => $perm, 'guard_name' => 'web']);
        }

        // === ROLES ===
        $admin = Role::firstOrCreate(['name' => Roles::ADMIN, 'guard_name' => 'web']);
        $kepalaBidang = Role::firstOrCreate(['name' => Roles::KEPALA_BIDANG, 'guard_name' => 'web']);
        $kepalaTim = Role::firstOrCreate(['name' => Roles::KEPALA_TIM, 'guard_name' => 'web']);
        $staf = Role::firstOrCreate(['name' => Roles::STAF, 'guard_name' => 'web']);

        // === ROLE → PERMISSION ASSIGNMENTS ===

        // Admin: everything (including RBAC management)
        $admin->givePermissionTo(Permission::all());

        // Kepala Bidang (field head): WFH approve/reject as "atasan langsung" + monitoring + export
        $kepalaBidang->givePermissionTo([
            'wfh.attendance.create',
            'wfh.report.create',
            'wfh.report.update',
            'wfh.report.submit',
            'wfh.report.approve',
            'wfh.report.reject',
            'wfh.monitoring.view',
            'wfh.report.export_pdf',
            'wfh.team_report.view',
            'wfh.team_report.approve',
            'wfh.team_report.reject',
            'change.initiation.view',
            'change.initiation.export_pdf',
            'change.implementation.view',
            'change.implementation.export_pdf',
        ]);

        // Kepala Tim (team leader): Change initiation approve/reject + implementation review
        $kepalaTim->givePermissionTo([
            'wfh.attendance.create',
            'wfh.report.create',
            'wfh.report.update',
            'wfh.report.submit',
            'wfh.monitoring.view',
            'wfh.team_report.view',
            'wfh.report.export_pdf',
            'change.initiation.view',
            'change.initiation.create',
            'change.initiation.update',
            'change.initiation.submit',
            'change.initiation.approve',
            'change.initiation.reject',
            'change.initiation.export_pdf',
            'change.implementation.view',
            'change.implementation.create',
            'change.implementation.update',
            'change.implementation.submit',
            'change.implementation.review',
            'change.implementation.export_pdf',
        ]);

        // Staf: create own records, submit, no approval power
        $staf->givePermissionTo([
            'wfh.attendance.create',
            'wfh.report.create',
            'wfh.report.update',
            'wfh.report.submit',
            'wfh.report.delete',
            'wfh.report.export_pdf',
            'change.initiation.view',
            'change.initiation.create',
            'change.initiation.update',
            'change.initiation.submit',
            'change.implementation.view',
            'change.implementation.create',
            'change.implementation.update',
            'change.implementation.submit',
        ]);
    }
}
