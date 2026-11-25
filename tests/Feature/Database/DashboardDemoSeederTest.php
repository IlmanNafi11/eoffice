<?php

namespace Tests\Feature\Database;

use App\Domains\Dashboard\Services\WorkdayWindow;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\DashboardDemoSeeder;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Dashboard module (T8): the demo seeder must produce a dataset that lights
 * up every dashboard section for its matching role — trend over >= 10
 * workdays, mixed report statuses (including draft/rejected days that stay
 * non-compliant), exactly one user below the 60% attention threshold, pending
 * queue rows, and today's attendance/report — while staying local/testing
 * only and safe to re-run.
 */
class DashboardDemoSeederTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> Warning sink for the production-run probe. */
    public array $warnings = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
        $this->artisan('db:seed', ['--class' => 'AdminUserSeeder']);
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        // Monday, inside the default wfh_allowed_days (1..5).
        Carbon::setTestNow(Carbon::parse('2026-07-20 10:00:00', 'Asia/Jakarta'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_it_seeds_nothing_outside_local_and_testing(): void
    {
        $this->app->detectEnvironment(fn () => 'production');

        $this->warnings = [];

        (new DashboardDemoSeeder)->setCommand(
            new class($this) extends Command
            {
                public function __construct(private DashboardDemoSeederTest $test) {}

                public function warn($string, $verbosity = null): void
                {
                    $this->test->warnings[] = $string;
                }
            },
        )->run();

        $this->assertSame(
            0,
            DB::table('wfh_reports')->count(),
            'Demo dashboard data must not exist in production.',
        );
        $this->assertNotSame([], $this->warnings, 'The skip must be announced, not silent.');
    }

    public function test_it_seeds_the_full_dashboard_contract_for_the_demo_field(): void
    {
        (new DashboardDemoSeeder)->run();

        // --- The whole 14-workday trend is covered (>= 10 workdays). -------
        $this->assertGreaterThanOrEqual(
            10,
            DB::table('wfh_reports')->distinct()->count('report_date'),
            'The trend needs data on at least 10 distinct workdays.',
        );

        // Every seeded report date is a workday per the setting.
        $allowed = (array) Setting::get('wfh_allowed_days');
        $dates = DB::table('wfh_reports')->distinct()->pluck('report_date')->all();

        foreach ($dates as $date) {
            $this->assertContains(
                Carbon::parse($date)->dayOfWeekIso,
                $allowed,
                "Seeded report date {$date} must be a workday.",
            );
        }

        // --- Mixed statuses: compliant and non-compliant days both exist. --
        $statuses = DB::table('wfh_reports')->distinct()->pluck('status')->all();

        $this->assertContains('approved', $statuses, 'The mix needs compliant days.');
        $this->assertContains('pending', $statuses, 'The mix needs compliant days.');
        $this->assertContains('draft', $statuses, 'The mix needs non-compliant days.');
        $this->assertContains('rejected', $statuses, 'The mix needs non-compliant days.');
    }

    public function test_exactly_one_user_sits_below_the_attention_threshold(): void
    {
        (new DashboardDemoSeeder)->run();

        $below = 0;
        $window = WorkdayWindow::last();
        $total = count($window);
        $this->assertGreaterThan(0, $total, 'The window must hold workdays under the default setting.');

        $compliant = DB::table('wfh_reports')
            ->whereIn('status', ['approved', 'pending'])
            ->whereBetween('report_date', [$window[0], $window[$total - 1]])
            ->selectRaw('user_id, count(distinct report_date) as compliant')
            ->groupBy('user_id')
            ->pluck('compliant', 'user_id');

        foreach (User::query()->where('is_active', true)->get(['id']) as $user) {
            if (($compliant[$user->id] ?? 0) / $total * 100 < 60) {
                $below++;
            }
        }

        $this->assertSame(
            1,
            $below,
            'Exactly one demo user must sit below the 60% attention threshold.',
        );
    }

    public function test_each_role_sees_its_own_sections_after_the_seed(): void
    {
        (new DashboardDemoSeeder)->run();

        $this->actingAsRole('staf@kominfo.go.id')
            ->assertJsonPath('data.today.is_workday', true)
            ->assertJsonPath('data.today.me.attendance.sessions_total', 3)
            ->assertJsonPath('data.today.me.report.status', 'approved')
            ->assertJsonMissingPath('data.queue')
            ->assertJsonMissingPath('data.attention')
            ->assertJsonMissingPath('data.today.scope');

        $kt = $this->actingAsRole('kepala.tim@kominfo.go.id');

        $kt->assertJsonPath('data.today.is_workday', true)
            ->assertJsonPath('data.today.scope.label', 'Tim')
            ->assertJsonPath('data.queue.change_initiations_pending.count', 2)
            ->assertJsonPath('data.queue.implementations_review.count', 1)
            ->assertJsonPath('data.attention.users.0.name', 'Nia Noncompliant');

        $kb = $this->actingAsRole('kepala.bidang@kominfo.go.id');

        $kb->assertJsonPath('data.today.is_workday', true)
            ->assertJsonPath('data.today.scope.label', 'Bidang')
            ->assertJsonPath('data.queue.team_reports_pending.count', 2)
            ->assertJsonPath('data.attention.users.0.name', 'Nia Noncompliant')
            // All five seeded accounts (staf, KT, KB, admin, straggler) share
            // the demo field, so the field roster is the whole demo roster.
            ->assertJsonPath('data.trend.summary.total', 14 * 5);

        $this->actingAsRole('admin@kominfo.go.id')
            ->assertJsonPath('data.today.scope.label', 'Organisasi')
            ->assertJsonPath('data.attention.users.0.name', 'Nia Noncompliant')
            ->assertJsonPath('data.trend.summary.total', 14 * 5);
    }

    public function test_it_is_safe_to_re_run(): void
    {
        (new DashboardDemoSeeder)->run();
        $first = DB::table('wfh_reports')->count();
        $this->assertGreaterThan(0, $first, 'The first run must seed data.');

        (new DashboardDemoSeeder)->run();

        $this->assertSame($first, DB::table('wfh_reports')->count(), 'A re-run must not duplicate rows.');
    }

    /** Log in the demo account and GET /api/dashboard. */
    private function actingAsRole(string $email): TestResponse
    {
        $user = User::query()->where('email', $email)->firstOrFail();
        $user->forceFill(['must_change_password' => false])->save();
        $this->actingAs($user, 'sanctum');

        return $this->getJson('/api/dashboard')->assertOk();
    }
}
