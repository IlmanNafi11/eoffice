<?php

namespace Tests\Feature\Wfh;

use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhReportActivity;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SessionConfigTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        // Freeze to a weekday (Monday) so day-of-week restrictions
        // don't flake based on when the test is run.
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_append_attendance_accepts_default_sessions_from_setting(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::create([
            'user_id' => $user->id,
            'report_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        // Default: pagi, siang, sore — all should be accepted
        foreach (['pagi', 'siang', 'sore'] as $session) {
            $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
                'session' => $session,
                'photo' => UploadedFile::fake()->image("{$session}.jpg"),
            ])->assertStatus(201);
        }
    }

    public function test_append_attendance_rejects_sessions_not_in_setting(): void
    {
        Setting::set('wfh_sessions', ['pagi', 'sore']);

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $report = WfhReport::create([
            'user_id' => $user->id,
            'report_date' => now()->toDateString(),
            'status' => 'draft',
        ]);

        $this->postJson("/api/wfh/reports/{$report->id}/attendances", [
            'session' => 'siang',
            'photo' => UploadedFile::fake()->image('siang.jpg'),
        ])->assertStatus(422);
    }

    public function test_activity_can_be_created_without_start_end_time(): void
    {
        $report = WfhReport::factory()->create();

        $activity = WfhReportActivity::create([
            'wfh_report_id' => $report->id,
            'activity' => 'Test without time',
            'sort_order' => 0,
        ]);

        $this->assertNotNull($activity);
        $this->assertNull($activity->start_time);
        $this->assertNull($activity->end_time);
        $this->assertEquals('Test without time', $activity->activity);
    }

    // ─── GET /wfh/session-config ─────────────────────────────────

    public function test_any_authenticated_user_can_get_session_config(): void
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $this->getJson('/api/wfh/session-config')
            ->assertStatus(200)
            ->assertJsonStructure(['data' => ['sessions', 'allowed_days']])
            ->assertJsonPath('data.sessions', ['pagi', 'siang', 'sore'])
            ->assertJsonPath('data.allowed_days', [1, 2, 3, 4, 5]);
    }

    public function test_guest_cannot_access_session_config(): void
    {
        $this->getJson('/api/wfh/session-config')
            ->assertStatus(401);
    }

    public function test_session_config_does_not_leak_sensitive_keys(): void
    {
        // Seed sensitive keys explicitly.
        Setting::set('password_default_admin', 'topsecret');
        Setting::set('password_default_user', 'usersecret');
        Setting::set('wfh_notify_start_time', '15:00');

        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/wfh/session-config')
            ->assertStatus(200);

        // Allowlist: response must expose ONLY these two keys.
        // Stronger than denying specific sensitive keys — catches any future leak.
        $this->assertSame(['sessions', 'allowed_days'], array_keys($response->json('data')));
    }

    public function test_all_roles_can_access(): void
    {
        foreach (['admin', 'kepala_bidang', 'kepala_tim', 'staf'] as $role) {
            $user = User::factory()->create();
            $user->assignRole($role);
            Sanctum::actingAs($user);

            $this->getJson('/api/wfh/session-config')
                ->assertStatus(200);
        }
    }
}
