<?php

namespace Tests\Feature\Dashboard;

use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard module (T4): the `trend` section — the last 14 workdays from the
 * `wfh_allowed_days` setting, ascending, one entry per workday.
 *
 * Compliant per day (SPEC-locked metric): a scoped user who filed a report
 * with status `approved` OR `pending` that day. Draft/rejected/no report is
 * not compliant, but the denominator stays full — it never shrinks to hide
 * non-compliance. `summary` is the plain sum over `days`.
 */
class DashboardTrendTest extends TestCase
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

    public function test_days_cover_exactly_the_last_14_workdays_ascending(): void
    {
        // Mon 2026-07-20 back to Wed 2026-07-01: the 14 most recent Mon–Fri
        // days (weekends 18/19, 11/12, 4/5 excluded).
        $expected = [
            '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07',
            '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13', '2026-07-14',
            '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-20',
        ];

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->count(2)->create(['team_id' => $team->id]);

        Sanctum::actingAs($head);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');

        $this->assertSame($expected, array_column($trend['days'], 'date'));
    }

    public function test_compliant_counts_only_approved_or_pending_reports(): void
    {
        // Mon 2026-07-20: two DIFFERENT users compliant (one approved, one
        // pending) out of 4 (head + 3 members). The previous workday Fri
        // 2026-07-17 holds only draft and rejected — compliant must be 0
        // while the denominator stays full.
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $members = User::factory()->count(3)->create(['team_id' => $team->id]);

        WfhReport::factory()->approved()->create([
            'user_id' => $members[0]->id, 'report_date' => '2026-07-20',
        ]);
        WfhReport::factory()->pending()->create([
            'user_id' => $members[1]->id, 'report_date' => '2026-07-20',
        ]);
        WfhReport::factory()->status('draft')->create([
            'user_id' => $members[2]->id, 'report_date' => '2026-07-20',
        ]);
        WfhReport::factory()->rejected()->create([
            'user_id' => $members[1]->id, 'report_date' => '2026-07-17',
        ]);
        WfhReport::factory()->status('draft')->create([
            'user_id' => $members[2]->id, 'report_date' => '2026-07-17',
        ]);

        Sanctum::actingAs($head);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');
        $days = collect($trend['days'])->keyBy('date');

        $this->assertSame(2, $days['2026-07-20']['compliant']);
        $this->assertSame(4, $days['2026-07-20']['total']);
        $this->assertSame(0, $days['2026-07-17']['compliant']);
        $this->assertSame(4, $days['2026-07-17']['total']);
    }

    public function test_summary_is_the_sum_over_days(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $members = User::factory()->count(2)->create(['team_id' => $team->id]);

        // Two users compliant on the first workday (head + member 0) and two
        // on the last (head + member 1) — summary must aggregate both days.
        WfhReport::factory()->approved()->create([
            'user_id' => $head->id, 'report_date' => '2026-07-01',
        ]);
        WfhReport::factory()->approved()->create([
            'user_id' => $head->id, 'report_date' => '2026-07-20',
        ]);
        WfhReport::factory()->approved()->create([
            'user_id' => $members[0]->id, 'report_date' => '2026-07-01',
        ]);
        WfhReport::factory()->pending()->create([
            'user_id' => $members[1]->id, 'report_date' => '2026-07-20',
        ]);

        Sanctum::actingAs($head);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');

        $this->assertSame(4, $trend['summary']['compliant']);
        $this->assertSame(14 * 3, $trend['summary']['total']);
        $this->assertSame(
            array_sum(array_column($trend['days'], 'compliant')),
            $trend['summary']['compliant'],
        );
        $this->assertSame(
            array_sum(array_column($trend['days'], 'total')),
            $trend['summary']['total'],
        );
    }

    public function test_staff_trend_counts_only_themselves(): void
    {
        $team = Team::factory()->create();
        $staf = $this->makeUser('staf', $team);
        $colleague = User::factory()->create(['team_id' => $team->id]);

        WfhReport::factory()->approved()->create([
            'user_id' => $staf->id, 'report_date' => '2026-07-20',
        ]);
        // The colleague's compliance must not inflate the staf's own trend.
        WfhReport::factory()->approved()->create([
            'user_id' => $colleague->id, 'report_date' => '2026-07-17',
        ]);

        Sanctum::actingAs($staf);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');
        $days = collect($trend['days'])->keyBy('date');

        $this->assertSame(1, $days['2026-07-20']['total']);
        $this->assertSame(1, $days['2026-07-20']['compliant']);
        $this->assertSame(1, $days['2026-07-17']['total']);
        $this->assertSame(0, $days['2026-07-17']['compliant']);
        $this->assertSame(14, $trend['summary']['total']);
    }

    public function test_setting_change_extends_the_workday_axis(): void
    {
        // Review Focus #1: the axis follows the setting, not Mon–Fri. With
        // Saturday allowed the 14-workday window ending Mon 2026-07-20 gains
        // Sat 07-18 and starts Sat 2026-07-04 instead of Wed 07-01.
        Setting::set('wfh_allowed_days', [1, 2, 3, 4, 5, 6]);

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->create(['team_id' => $team->id]);

        Sanctum::actingAs($head);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');

        $dates = array_column($trend['days'], 'date');
        $this->assertCount(14, $dates);
        $this->assertContains('2026-07-18', $dates);
        $this->assertSame('2026-07-04', $dates[0]);
        $this->assertSame('2026-07-20', $dates[13]);
    }

    public function test_trend_excludes_inactive_users_from_the_denominator(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->count(2)->create(['team_id' => $team->id]);
        // Inactive member whose stale reports must lift nothing.
        $inactive = User::factory()->create(['team_id' => $team->id, 'is_active' => false]);
        WfhReport::factory()->approved()->create([
            'user_id' => $inactive->id, 'report_date' => '2026-07-20',
        ]);

        Sanctum::actingAs($head);

        $trend = $this->getJson('/api/dashboard')->assertOk()->json('data.trend');
        $days = collect($trend['days'])->keyBy('date');

        $this->assertSame(3, $days['2026-07-20']['total']);
        $this->assertSame(0, $days['2026-07-20']['compliant']);
    }

    private function makeUser(string $role, ?Team $team): User
    {
        $user = User::factory()->create(['team_id' => $team?->id]);
        $user->assignRole($role);

        return $user;
    }
}
