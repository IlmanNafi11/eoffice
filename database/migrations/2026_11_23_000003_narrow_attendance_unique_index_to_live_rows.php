<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `wfh_attendances` uses SoftDeletes but its session unique key was
     * created over ALL rows. A deleted session therefore blocked every later
     * upload of the same (user, date, session) — the application's duplicate
     * guard only reads live rows, so the INSERT hit the constraint and
     * surfaced a 500 instead of a friendly answer. Narrow it to live rows.
     *
     * The legacy key was created by Blueprint `$table->unique()`, so Postgres
     * owns it as a UNIQUE CONSTRAINT (not a bare index) — it must be dropped
     * with ALTER TABLE ... DROP CONSTRAINT.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE wfh_attendances DROP CONSTRAINT IF EXISTS wfh_attendance_unique');
        DB::statement('
            CREATE UNIQUE INDEX wfh_attendance_unique
            ON wfh_attendances (user_id, date, session)
            WHERE deleted_at IS NULL
        ');
    }

    public function down(): void
    {
        // Rolling back requires no duplicate LIVE session per (user, date).
        // Soft-deleted duplicates are tolerated by the partial index but
        // would collide here; clean them up if this statement fails.
        DB::statement('DROP INDEX IF EXISTS wfh_attendance_unique');
        DB::statement('ALTER TABLE wfh_attendances ADD CONSTRAINT wfh_attendance_unique UNIQUE (user_id, date, session)');
    }
};
