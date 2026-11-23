<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Narrow the partial unique index to draft only: rejected is terminal,
        // so a fresh draft for the same (user, date) is allowed after a reject.
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');
        DB::statement("
            CREATE UNIQUE INDEX wfh_reports_active_draft_unique
            ON wfh_reports (user_id, report_date)
            WHERE status = 'draft'
        ");
    }

    public function down(): void
    {
        // Rollback may fail if more than one rejected report already exists
        // per (user, date) — clean those up manually before rolling back
        // (design decision #5: rejected is terminal, duplicates are expected).
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');
        DB::statement("
            CREATE UNIQUE INDEX wfh_reports_active_draft_unique
            ON wfh_reports (user_id, report_date)
            WHERE status IN ('draft', 'rejected')
        ");
    }
};
