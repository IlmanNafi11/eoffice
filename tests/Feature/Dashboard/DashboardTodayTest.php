<?php

namespace Tests\Feature\Dashboard;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard module (T1): GET /api/dashboard skeleton + `today.me` for staf.
 *
 * Staff see their own day plus their personal 14-workday trend; no queue,
 * `scope` or `attention` keys since they hold none of those permissions.
 */
class DashboardTodayTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        // Monday, inside the default wfh_allowed_days (1..5).
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_staff_sees_partial_attendance_and_todays_report(): void
    {
        $staf = $this->staf();

        $report = WfhReport::factory()->pending()->create([
            'user_id' => $staf->id,
            'report_date' => now()->toDateString(),
        ]);

        foreach (['pagi', 'siang'] as $session) {
            WfhAttendance::create([
                'user_id' => $staf->id,
                'report_id' => $report->id,
                'date' => now()->toDateString(),
                'session' => $session,
                'photo_path' => "attendances/{$staf->id}/".now()->toDateString()."/{$session}.jpg",
                'check_in_at' => now(),
            ]);
        }

        $response = $this->getJson('/api/dashboard')->assertOk();

        $body = $response->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertNull($body['message']);
        $this->assertNull($body['meta']);

        $data = $body['data'];

        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/',
            $data['generated_at'],
        );

        $this->assertTrue($data['today']['is_workday']);
        $this->assertSame([
            'sessions_done' => 2,
            'sessions_total' => 3,
            'next_session' => 'sore',
        ], $data['today']['me']['attendance']);
        $this->assertSame([
            'status' => 'pending',
            'report_id' => $report->id,
        ], $data['today']['me']['report']);

        foreach (['queue', 'attention', 'scope'] as $key) {
            $this->assertArrayNotHasKey($key, $data, "staf must not receive the [{$key}] section");
            $this->assertArrayNotHasKey($key, $data['today'], "staf must not receive today.[{$key}]");
        }
    }

    public function test_staff_without_attendance_or_report_gets_zeroed_attendance_and_null_report(): void
    {
        $this->staf();

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertTrue($data['today']['is_workday']);
        $this->assertSame([
            'sessions_done' => 0,
            'sessions_total' => 3,
            'next_session' => 'pagi',
        ], $data['today']['me']['attendance']);
        $this->assertNull($data['today']['me']['report']);
    }

    public function test_completed_attendance_reports_null_next_session(): void
    {
        // The terminal state — all sessions done — has its own FE rendering
        // ("Semua sesi selesai"); a `?? 'pagi'`-style regression would tell a
        // finished user to check in again.
        $staf = $this->staf();

        $report = WfhReport::factory()->pending()->create([
            'user_id' => $staf->id,
            'report_date' => now()->toDateString(),
        ]);

        foreach (['pagi', 'siang', 'sore'] as $session) {
            WfhAttendance::create([
                'user_id' => $staf->id,
                'report_id' => $report->id,
                'date' => now()->toDateString(),
                'session' => $session,
                'photo_path' => "attendances/{$staf->id}/".now()->toDateString()."/{$session}.jpg",
                'check_in_at' => now(),
            ]);
        }

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'sessions_done' => 3,
            'sessions_total' => 3,
            'next_session' => null,
        ], $data['today']['me']['attendance']);
    }

    public function test_non_workday_reports_false_and_no_personal_section(): void
    {
        // Sunday 2026-07-19 — outside the default Mon–Fri set.
        Carbon::setTestNow(Carbon::parse('2026-07-19 10:00:00', 'Asia/Jakarta'));

        $this->staf();

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertFalse($data['today']['is_workday']);
        $this->assertNull($data['today']['me']);
        $this->assertArrayNotHasKey('scope', $data['today']);
    }

    public function test_empty_allowed_days_setting_is_fail_closed(): void
    {
        Setting::set('wfh_allowed_days', []);

        $this->staf();

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertFalse($data['today']['is_workday']);
        $this->assertNull($data['today']['me']);
    }

    public function test_dashboard_requires_authentication(): void
    {
        $this->getJson('/api/dashboard')->assertUnauthorized();
    }

    private function staf(): User
    {
        $user = User::factory()->create();
        $user->assignRole('staf');
        Sanctum::actingAs($user);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $body
     * @return list<string>
     */
    private function sortedKeys(array $body): array
    {
        $keys = array_keys($body);
        sort($keys);

        return $keys;
    }
}
