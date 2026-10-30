<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportResourceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_report_response_includes_attendances(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
        ]);

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $report->report_date->format('Y-m-d'),
            'session' => 'pagi',
            'photo_path' => 'test.jpg',
            'report_id' => $report->id,
        ]);

        $this->getJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'attendances' => [
                        '*' => ['session', 'photo_url'],
                    ],
                    'activity_count',
                ],
            ]);
    }

    public function test_report_response_does_not_include_wfh_attendance_id(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
        ]);

        $this->getJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonMissingPath('data.wfh_attendance_id');
    }

    public function test_report_index_includes_attendances_and_activity_count(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => now()->format('Y-m-d'),
        ]);

        WfhAttendance::create([
            'user_id' => $user->id,
            'date' => $report->report_date->format('Y-m-d'),
            'session' => 'pagi',
            'photo_path' => 'test.jpg',
            'report_id' => $report->id,
        ]);

        $report->activities()->create([
            'activity' => 'Task 1',
            'sort_order' => 0,
        ]);
        $report->activities()->create([
            'activity' => 'Task 2',
            'sort_order' => 1,
        ]);

        $this->getJson('/api/wfh/reports?per_page=10')
            ->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'attendances',
                        'activity_count',
                    ],
                ],
            ]);
    }

    public function test_approved_report_response_excludes_verification_token(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'status' => 'approved',
            'verification_token' => 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd',
        ]);

        $this->getJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(200)
            ->assertJsonMissingPath('data.verification_token');
    }

    public function test_report_index_query_count_does_not_grow_per_activity(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => now()->format('Y-m-d'),
        ]);

        // One activity with one link: the list must not lazy-load either.
        $activity = $report->activities()->create([
            'activity' => 'Task 1',
            'sort_order' => 0,
        ]);
        $activity->links()->create(['url' => 'https://example.test/1', 'sort_order' => 0]);

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->getJson('/api/wfh/reports?per_page=10')->assertStatus(200);

        $rowReads = 0;
        foreach (DB::getQueryLog() as $entry) {
            $query = strtolower(ltrim($entry['query']));

            // withCount embeds `select count(*) ... from "wfh_report_activities"`
            // inside the main reports SELECT. An eager load is a standalone
            // `select * from "wfh_report_activities"` statement, so match the
            // exact prefix instead of the table name.
            if (str_starts_with($query, 'select * from "wfh_report_activities"')
                || str_starts_with($query, 'select * from "wfh_report_links"')) {
                $rowReads++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(
            0,
            $rowReads,
            'The report list must not read activity/link rows per report; use withCount.'
        );

    }

    public function test_list_activity_count_matches_detail_activity_count(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->create([
            'user_id' => $user->id,
            'report_date' => now()->format('Y-m-d'),
        ]);

        $report->activities()->create(['activity' => 'Task 1', 'sort_order' => 0]);
        $report->activities()->create(['activity' => 'Task 2', 'sort_order' => 1]);
        $report->activities()->create(['activity' => 'Task 3', 'sort_order' => 2]);

        $listCount = $this->getJson('/api/wfh/reports?per_page=10')
            ->assertStatus(200)
            ->json('data.0.activity_count');

        $detailCount = $this->getJson("/api/wfh/reports/{$report->id}")
            ->assertStatus(200)
            ->json('data.activity_count');

        $this->assertSame(3, $listCount);
        $this->assertSame($detailCount, $listCount);
    }
}
