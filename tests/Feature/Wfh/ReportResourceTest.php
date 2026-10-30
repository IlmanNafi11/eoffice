<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
