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
 * Dashboard module (T4): the `attention` section — up to 5 scoped users below
 * 60% compliance over the last 14 workdays, lowest ratio first.
 *
 * Gated on the `wfh.monitoring.view` permission only (user decision
 * 2026-11-24): kepala_tim holds it too and sees their own team's list, as on
 * the existing monitoring board. Inactive users never appear, no matter how
 * low their ratio.
 */
class DashboardAttentionTest extends TestCase
{
    use RefreshDatabase;

    /** The 14 workdays ending Mon 2026-07-20, ascending (default Mon–Fri). */
    private const WORKDAYS = [
        '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-06', '2026-07-07',
        '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13', '2026-07-14',
        '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-20',
    ];

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

    public function test_lists_users_below_threshold_with_team_and_ratio(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        // The head is in the field roster too; keep them above the threshold
        // so this test isolates the one user it is about.
        $this->fileCompliantDays($head, 9);
        $low = User::factory()->create(['team_id' => $team->id, 'name' => 'Siti']);

        // 5 compliant workdays of 14 = 35.7% — below the 60% threshold.
        $this->fileCompliantDays($low, 5);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertCount(1, $attention['users']);
        $this->assertSame([
            'user_id' => $low->id,
            'name' => 'Siti',
            'team' => 'Tim A',
            'compliant' => 5,
            'total' => 14,
        ], $attention['users'][0]);
        $this->assertSame('kepatuhan < 60% dalam 14 hari kerja terakhir', $attention['threshold_note']);
    }

    public function test_inactive_users_never_appear_despite_a_low_ratio(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 9);
        $inactive = User::factory()->create(['team_id' => $team->id, 'is_active' => false]);

        // 0 compliant of 14 — by far the lowest ratio in the scope.
        WfhReport::factory()->rejected()->create([
            'user_id' => $inactive->id, 'report_date' => '2026-07-20',
        ]);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertSame([], $attention['users']);
    }

    public function test_caps_at_five_users_sorted_lowest_ratio_first(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 9);

        // 7 users below threshold with distinct ratios: 0..6 of 14 workdays.
        foreach (range(0, 6) as $compliant) {
            $user = User::factory()->create(['team_id' => $team->id]);
            $this->fileCompliantDays($user, $compliant);
        }

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertCount(5, $attention['users']);
        $this->assertSame(
            [0, 1, 2, 3, 4],
            array_column($attention['users'], 'compliant'),
        );
    }

    public function test_staff_has_no_attention_section(): void
    {
        $team = Team::factory()->create();
        $staf = $this->makeUser('staf', $team);
        $colleague = User::factory()->create(['team_id' => $team->id]);

        // A colleague with zero compliance — the section must be absent for
        // the staf, not present with an empty (or worse, populated) list.
        WfhReport::factory()->rejected()->create([
            'user_id' => $colleague->id, 'report_date' => '2026-07-20',
        ]);

        Sanctum::actingAs($staf);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayNotHasKey('attention', $data);
    }

    public function test_team_leader_sees_their_own_teams_attention(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $otherTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $leader = $this->makeUser('kepala_tim', $team);
        $team->update(['leader_id' => $leader->id]);
        $this->fileCompliantDays($leader, 9);
        $lowMember = User::factory()->create(['team_id' => $team->id, 'name' => 'Siti']);
        $otherMember = User::factory()->create(['team_id' => $otherTeam->id, 'name' => 'Budi']);

        $this->fileCompliantDays($lowMember, 2);
        $this->fileCompliantDays($otherMember, 2);

        Sanctum::actingAs($leader);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertCount(1, $attention['users']);
        $this->assertSame($lowMember->id, $attention['users'][0]['user_id']);
        $this->assertSame('Tim A', $attention['users'][0]['team']);
    }

    public function test_empty_list_when_every_user_meets_the_threshold(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 14);
        $member = User::factory()->create(['team_id' => $team->id]);

        // Fully compliant: 14/14 = 100% — nobody below 60%.
        $this->fileCompliantDays($member, 14);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertSame([], $attention['users']);
        $this->assertSame('kepatuhan < 60% dalam 14 hari kerja terakhir', $attention['threshold_note']);
    }

    public function test_leader_without_a_led_team_gets_no_attention_section(): void
    {
        // ship review #20 (HIGH): the null scope used to be dropped from the
        // query, leaking every active user's name and ratio. Deny-by-default
        // means the section is omitted for this requester.
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $leader = $this->makeUser('kepala_tim', $team);
        $outsider = User::factory()->create(['name' => 'Orang Lain']);
        $this->fileCompliantDays($outsider, 1);

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayNotHasKey('attention', $data);
    }

    public function test_field_head_without_a_field_gets_no_attention_section(): void
    {
        $head = $this->makeUser('kepala_bidang', null);
        $this->fileCompliantDays(User::factory()->create(), 1);

        Sanctum::actingAs($head);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayNotHasKey('attention', $data);
    }

    public function test_reports_on_non_workdays_never_count_toward_the_14_day_numerator(): void
    {
        // ship review #20 (Required): the numerator used whereBetween, so a
        // Saturday/Sunday report inside the calendar span counted as a
        // compliant DAY against a fixed 14 denominator — inflating the ratio
        // past 100% and hiding the very noncompliance this section surfaces.
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 14);

        $member = User::factory()->create(['team_id' => $team->id, 'name' => 'Budi']);
        // 4 real workdays ⇒ 4/14 ≈ 29% (below the threshold, must be listed).
        $this->fileCompliantDays($member, 4);
        // Six weekend reports inside the span would push a naive count to
        // 10/14 ≈ 71% and silently drop them from the list.
        foreach (['2026-07-04', '2026-07-05', '2026-07-11', '2026-07-12', '2026-07-18', '2026-07-19'] as $weekend) {
            WfhReport::factory()->approved()->create([
                'user_id' => $member->id, 'report_date' => $weekend,
            ]);
        }

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertCount(1, $attention['users']);
        $this->assertSame($member->id, $attention['users'][0]['user_id']);
        $this->assertSame(4, $attention['users'][0]['compliant']);
        $this->assertSame(14, $attention['users'][0]['total']);
    }

    public function test_window_ends_at_the_most_recent_workday_when_today_is_a_weekend(): void
    {
        // The trend axis and this list share WorkdayWindow — they must agree.
        Carbon::setTestNow(Carbon::parse('2026-07-18 10:00:00', 'Asia/Jakarta'));

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 14);
        $member = User::factory()->create(['team_id' => $team->id]);
        $this->fileCompliantDays($member, 2);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertCount(1, $attention['users']);
        $this->assertSame(2, $attention['users'][0]['compliant']);
        $this->assertSame(14, $attention['users'][0]['total']);
    }

    public function test_empty_allowed_days_setting_yields_an_empty_list(): void
    {
        Setting::set('wfh_allowed_days', []);

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->create(['team_id' => $team->id]);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertSame([], $attention['users']);
    }

    public function test_equal_ratios_are_ordered_by_user_id_ascending(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        $this->fileCompliantDays($head, 14);

        $first = User::factory()->create(['team_id' => $team->id]);
        $second = User::factory()->create(['team_id' => $team->id]);
        $this->fileCompliantDays($first, 3);
        $this->fileCompliantDays($second, 3);

        Sanctum::actingAs($head);

        $attention = $this->getJson('/api/dashboard')->assertOk()->json('data.attention');

        $this->assertSame(
            [$first->id, $second->id],
            array_column($attention['users'], 'user_id'),
        );
    }

    public function test_attention_never_costs_one_query_per_user_for_teams(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->count(10)->create(['team_id' => $team->id]);

        Sanctum::actingAs($head);

        \DB::enableQueryLog();
        $this->getJson('/api/dashboard')->assertOk();
        $queries = \DB::getQueryLog();
        \DB::disableQueryLog();

        // Eager loading collapses the team names into ONE read; a lazy load
        // would emit one `select "id", "name" from "teams"` per roster user.
        $teamReads = array_filter(
            $queries,
            fn (array $q) => str_starts_with($q['query'], 'select "id", "name" from "teams"'),
        );
        $this->assertLessThanOrEqual(1, count($teamReads));
    }

    private function makeUser(string $role, ?Team $team): User
    {
        $user = User::factory()->create(['team_id' => $team?->id]);
        $user->assignRole($role);

        return $user;
    }

    /** File `$count` approved reports on the first workdays of the window. */
    private function fileCompliantDays(User $user, int $count): void
    {
        foreach (array_slice(self::WORKDAYS, 0, $count) as $date) {
            WfhReport::factory()->approved()->create([
                'user_id' => $user->id, 'report_date' => $date,
            ]);
        }
    }
}
