<?php

namespace Tests\Feature\Database;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Domains\Wfh\Models\WfhReportLink;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Ship review #22: legacy evidence links written before the write-path
 * `starts_with:https://` rule must not survive into `href` rendering.
 */
class ScrubLegacyWfhReportLinksTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_blanks_non_https_links_and_keeps_https_ones(): void
    {
        $https = WfhReportLink::create([
            'wfh_report_activity_id' => $this->activityId(),
            'url' => 'https://drive.example/notulen.pdf',
            'sort_order' => 1,
        ]);
        $javascript = WfhReportLink::create([
            'wfh_report_activity_id' => $this->activityId(),
            'url' => 'javascript://comment%0aalert(1)',
            'sort_order' => 2,
        ]);
        $dataUri = WfhReportLink::create([
            'wfh_report_activity_id' => $this->activityId(),
            'url' => 'data:text/html;base64,PGI+aGk8L2I+',
            'sort_order' => 3,
        ]);

        // `RefreshDatabase` already applied this migration on an empty table,
        // so run its `up()` again directly against the seeded rows.
        (require database_path('migrations/2026_11_27_000001_null_out_non_https_wfh_report_links.php'))->up();

        $this->assertSame(
            'https://drive.example/notulen.pdf',
            WfhReportLink::find($https->id)->url,
        );
        $this->assertSame('', WfhReportLink::find($javascript->id)->url);
        $this->assertSame('', WfhReportLink::find($dataUri->id)->url);
    }

    public function test_migration_is_case_sensitive_like_the_validator(): void
    {
        // The write-path rule is `starts_with:https://` (case-sensitive);
        // `HTTPS://` was never valid, so the scrub nulls it too.
        $uppercase = WfhReportLink::create([
            'wfh_report_activity_id' => $this->activityId(),
            'url' => 'HTTPS://drive.example/doc.pdf',
            'sort_order' => 1,
        ]);

        // `RefreshDatabase` already applied this migration on an empty table,
        // so run its `up()` again directly against the seeded rows.
        (require database_path('migrations/2026_11_27_000001_null_out_non_https_wfh_report_links.php'))->up();

        $this->assertSame('', WfhReportLink::find($uppercase->id)->url);
    }

    /** Satu aktivitas WFH sebagai induk link (FK wfh_report_activities). */
    private function activityId(): int
    {
        $user = User::factory()->create();
        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'pending',
        ]);
        $activity = WfhReportActivity::create([
            'wfh_report_id' => $report->id,
            'activity' => 'Kerja',
            'start_time' => '08:00',
            'end_time' => '09:00',
            'sort_order' => 1,
        ]);

        return $activity->id;
    }
}
