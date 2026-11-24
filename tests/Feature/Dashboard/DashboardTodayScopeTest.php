<?php

namespace Tests\Feature\Dashboard;

use App\Domains\Wfh\Models\WfhAttendance;
use App\Domains\Wfh\Models\WfhReport;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard module (T2): the monitoring recap `today.scope` plus its single
 * scope resolver.
 *
 * Denominator rule (design §Cakupan): counts only ACTIVE users — a deliberate
 * departure from the existing monitoring list, which still includes inactive
 * users. Team-less kepala_* is deny-by-default, mirroring applyVisibilityScope.
 */
class DashboardTodayScopeTest extends TestCase
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

    public function test_team_leader_sees_team_recap_counting_active_members_only(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $leader = $this->makeUser('kepala_tim', $team);
        $team->update(['leader_id' => $leader->id]);

        // Two active members besides the leader, nobody attended or reported
        // yet. The leader is rostered on the team too, so the roster is 3 —
        // same rule the monitoring list applies (team_id, not "led by").
        User::factory()->count(2)->create(['team_id' => $team->id]);

        // One inactive member must stay out of every number.
        User::factory()->create(['team_id' => $team->id, 'is_active' => false]);

        // Somebody from another team must not leak into this recap.
        $otherTeam = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);
        User::factory()->count(3)->create(['team_id' => $otherTeam->id]);

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'label' => 'Tim',
            'users_total' => 3,
            'absent' => 3,
            'no_report' => 3,
            'team_reports_pending' => null,
        ], $data['today']['scope']);
    }

    public function test_field_head_sees_whole_field_and_team_report_backlog(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $teamA = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);

        $head = $this->makeUser('kepala_bidang', $teamA);
        $field->update(['head_id' => $head->id]);

        $memberA = User::factory()->create(['team_id' => $teamA->id]);
        $memberB = User::factory()->create(['team_id' => $teamB->id]);
        User::factory()->create(['team_id' => $teamB->id, 'is_active' => false]);

        // Outside the field entirely: must not be counted.
        $foreignTeam = Team::factory()->create();
        User::factory()->count(2)->create(['team_id' => $foreignTeam->id]);

        // memberA already checked in and filed a report today.
        WfhAttendance::create([
            'user_id' => $memberA->id,
            'date' => now()->toDateString(),
            'session' => 'pagi',
            'photo_path' => "attendances/{$memberA->id}/pagi.jpg",
            'check_in_at' => now(),
        ]);
        WfhReport::factory()->pending()->create([
            'user_id' => $memberA->id,
            'report_date' => now()->toDateString(),
        ]);

        WfhTeamReport::factory()->pending()->create(['team_id' => $teamA->id, 'report_date' => now()->toDateString()]);
        WfhTeamReport::factory()->pending()->create(['team_id' => $teamB->id, 'report_date' => now()->subDay()->toDateString()]);
        WfhTeamReport::factory()->approved()->create(['team_id' => $teamB->id, 'report_date' => now()->subDays(2)->toDateString()]);
        WfhTeamReport::factory()->pending()->create(['team_id' => $foreignTeam->id, 'report_date' => now()->toDateString()]);

        Sanctum::actingAs($head);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'label' => 'Bidang',
            'users_total' => 3,
            'absent' => 2,
            'no_report' => 2,
            'team_reports_pending' => 2,
        ], $data['today']['scope']);
    }

    public function test_admin_sees_organisation_recap(): void
    {
        $admin = $this->makeUser('admin', Team::factory()->create());

        User::factory()->count(4)->create();
        User::factory()->create(['is_active' => false]);

        Sanctum::actingAs($admin);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $scope = $data['today']['scope'];

        $this->assertSame('Organisasi', $scope['label']);
        // Admin himself is an active user and has neither record.
        $this->assertSame(5, $scope['users_total']);
        $this->assertSame(5, $scope['absent']);
        $this->assertSame(5, $scope['no_report']);
        $this->assertNotNull($scope['team_reports_pending']);
    }

    public function test_team_report_backlog_is_null_without_the_approval_permission(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);

        $leader = $this->makeUser('kepala_tim', $team);
        $team->update(['leader_id' => $leader->id]);
        $leader->revokePermissionTo('wfh.team_report.approve');

        WfhTeamReport::factory()->pending()->create(['team_id' => $team->id, 'report_date' => now()->toDateString()]);
        WfhTeamReport::factory()->pending()->create(['team_id' => $team->id, 'report_date' => now()->subDay()->toDateString()]);

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayHasKey('scope', $data['today']);
        $this->assertNull($data['today']['scope']['team_reports_pending']);
    }

    public function test_team_leader_without_a_led_team_gets_no_scope_deny_by_default(): void
    {
        $leader = $this->makeUser('kepala_tim', null);

        // Plenty of users exist, and none of them may leak into the recap.
        User::factory()->count(3)->create();

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertTrue($data['today']['is_workday']);
        $this->assertArrayNotHasKey('scope', $data['today']);
    }

    public function test_non_workday_has_no_scope(): void
    {
        // Sunday 2026-07-19 — outside the default Mon–Fri set.
        Carbon::setTestNow(Carbon::parse('2026-07-19 10:00:00', 'Asia/Jakarta'));

        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $leader = $this->makeUser('kepala_tim', $team);
        $team->update(['leader_id' => $leader->id]);
        User::factory()->count(2)->create(['team_id' => $team->id]);

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertFalse($data['today']['is_workday']);
        $this->assertNull($data['today']['me']);
        $this->assertArrayNotHasKey('scope', $data['today']);
    }

    public function test_staff_gets_no_scope(): void
    {
        $staf = $this->makeUser('staf', Team::factory()->create());
        User::factory()->count(2)->create(['team_id' => $staf->team_id]);

        Sanctum::actingAs($staf);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayHasKey('today', $data);
        $this->assertArrayNotHasKey('scope', $data['today']);
    }

    public function test_scope_costs_a_bounded_number_of_queries(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $head = $this->makeUser('kepala_bidang', $team);
        $field->update(['head_id' => $head->id]);
        User::factory()->count(12)->create(['team_id' => $team->id]);
        WfhTeamReport::factory()->pending()->create(['team_id' => $team->id]);

        Sanctum::actingAs($head);

        \DB::enableQueryLog();
        $this->getJson('/api/dashboard')->assertOk();
        $queries = \DB::getQueryLog();
        \DB::disableQueryLog();

        // The recap costs exactly three aggregate reads over `users` (total,
        // absent, no-report) and the trend roster adds exactly one more
        // (its denominator) — four bounded counts, no per-user reads: any
        // N+1 shows up as a count proportional to the 12 seeded users.
        // Predicate is exact: a count(*) that STARTS from users.
        $userCounts = array_filter(
            $queries,
            fn (array $q) => str_starts_with($q['query'], 'select count(*) as aggregate from "users"'),
        );
        $this->assertCount(4, $userCounts, $this->dumpQueries($queries));

        $perUserReads = array_filter(
            $queries,
            fn (array $q) => str_starts_with($q['query'], 'select * from "users"'),
        );
        $this->assertCount(0, $perUserReads, $this->dumpQueries($queries));
    }

    private function makeUser(string $role, ?Team $team): User
    {
        $user = User::factory()->create(['team_id' => $team?->id]);
        $user->assignRole($role);

        return $user;
    }

    /**
     * @param  list<array{query: string}>  $queries
     */
    private function dumpQueries(array $queries): string
    {
        return "users-scoped count queries:\n".implode("\n", array_map(
            fn (array $q) => $q['query'],
            array_filter($queries, fn (array $q) => str_contains($q['query'], '"users"')),
        ));
    }
}
