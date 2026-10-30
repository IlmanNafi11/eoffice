<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SubmitContentGuardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_submit_empty_draft_returns_422(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        // Create empty draft via get-or-create
        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'status' => 'draft',
        ]);
        $reportId = $response->json('data.id');

        // Submit empty draft — should fail
        $this->postJson("/api/wfh/reports/{$reportId}/submit")
            ->assertStatus(422);
    }

    public function test_submit_draft_with_activity_succeeds(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/wfh/reports', [
            'report_date' => now()->toDateString(),
            'activities' => [
                ['activity' => 'Meeting with team', 'start_time' => '09:00', 'end_time' => '10:00'],
            ],
        ]);
        $reportId = $response->json('data.id');

        $this->postJson("/api/wfh/reports/{$reportId}/submit")
            ->assertStatus(200);
    }

    public function test_submit_draft_with_attendance_succeeds(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-28'));

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::factory()->status('draft')->create([
            'user_id' => $user->id,
            'report_date' => '2026-07-28',
        ]);

        // Add attendance via sub-resource
        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'photo' => UploadedFile::fake()->image('foto.jpg'),
            'session' => 'pagi',
        ])->assertStatus(201);

        // Submit — should succeed (has attendance)
        $this->postJson("/api/wfh/reports/{$report->id}/submit")
            ->assertStatus(200);
    }
}
