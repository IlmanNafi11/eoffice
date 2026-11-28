<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Archive principle: a rejected report keeps its evidence forever, so
     * attendance ownership moves from (user, date) to the report. The daily
     * "one evidence per session" rule becomes one row per (report, session),
     * and the one-active-report-per-date rule (draft/pending/approved) makes
     * the day-level rule follow by construction.
     *
     * The service is pre-production (design decision #12): collisions fail
     * fast with the offending (user, date) pairs, and unreferencable orphan
     * attendance rows (report_id NULL, left by past draft deletes) are
     * deleted — no silent data mutation.
     */
    public function up(): void
    {
        $collisions = DB::select(<<<'SQL'
            SELECT user_id, report_date, count(*) AS report_count
            FROM wfh_reports
            WHERE status IN ('draft', 'pending', 'approved')
              AND deleted_at IS NULL
            GROUP BY user_id, report_date
            HAVING count(*) > 1
            ORDER BY user_id, report_date
        SQL);

        if ($collisions !== []) {
            $listing = collect($collisions)
                ->map(fn ($row) => sprintf(
                    'user %d on %s (%d reports)',
                    $row->user_id,
                    $row->report_date,
                    $row->report_count,
                ))
                ->implode(', ');

            throw new RuntimeException(
                'Cannot lock report dates: more than one non-rejected report exists for '.$listing.
                '. Resolve the duplicates (or re-seed) and re-run the migration.'
            );
        }

        // Rows without a report are unreferenceable: nothing can serve them
        // and the new (report_id, session) key cannot cover them.
        DB::statement('DELETE FROM wfh_attendances WHERE report_id IS NULL');

        DB::statement('DROP INDEX IF EXISTS wfh_attendance_unique');
        DB::statement('
            CREATE UNIQUE INDEX wfh_attendance_unique
            ON wfh_attendances (report_id, session)
            WHERE deleted_at IS NULL
        ');

        // Day-level lookups (monitoring, "users without attendance") still
        // query by (user_id, date); without this they fall back to a scan.
        DB::statement('
            CREATE INDEX IF NOT EXISTS wfh_attendances_user_date_index
            ON wfh_attendances (user_id, date)
        ');

        // Soft-deleted drafts must not hold the date lock: deleting a draft
        // (soft delete) must free the date for a new one, matching the
        // domain predicate (WfhReportStatus::ACTIVE + live rows).
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');
        DB::statement("
            CREATE UNIQUE INDEX wfh_reports_active_draft_unique
            ON wfh_reports (user_id, report_date)
            WHERE status IN ('draft', 'pending', 'approved')
              AND deleted_at IS NULL
        ");
    }

    public function down(): void
    {
        // Rolling back requires at most one LIVE attendance per
        // (user, date, session) — a rejected report and its correction draft
        // both holding the same session will collide here. Clean those up
        // before rolling back.
        DB::statement('DROP INDEX IF EXISTS wfh_reports_active_draft_unique');
        DB::statement("
            CREATE UNIQUE INDEX wfh_reports_active_draft_unique
            ON wfh_reports (user_id, report_date)
            WHERE status = 'draft'
              AND deleted_at IS NULL
        ");

        DB::statement('DROP INDEX IF EXISTS wfh_attendances_user_date_index');

        DB::statement('DROP INDEX IF EXISTS wfh_attendance_unique');
        DB::statement('
            CREATE UNIQUE INDEX wfh_attendance_unique
            ON wfh_attendances (user_id, date, session)
            WHERE deleted_at IS NULL
        ');
    }
};
