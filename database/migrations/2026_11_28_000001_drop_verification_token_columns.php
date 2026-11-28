<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * QR document verification is cut off (SPEC wfh-ux-remediation): the
     * endpoint is gone and Dompdf 3.x never rendered the QR SVG, so the
     * per-document verification_token columns had no consumer. Drop them from
     * every table that carried one.
     */
    public function up(): void
    {
        foreach (['wfh_reports', 'change_initiations', 'wfh_team_reports'] as $table) {
            if (Schema::hasColumn($table, 'verification_token')) {
                Schema::table($table, function ($table) {
                    $table->dropColumn('verification_token');
                });
            }
        }
    }

    public function down(): void
    {
        // Rolling back requires no duplicate token per table; production data
        // is pre-production (repo convention) — re-seed if this statement fails.
        foreach (['wfh_reports', 'change_initiations', 'wfh_team_reports'] as $table) {
            if (! Schema::hasColumn($table, 'verification_token')) {
                DB::statement(
                    "ALTER TABLE {$table} ADD COLUMN verification_token VARCHAR(64) NULL"
                );
            }
        }

        // The original unique indexes are not restored: tokens were dropped
        // with the feature, so re-issuing them is out of scope.
    }
};
