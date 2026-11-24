<?php

namespace Tests\Feature\Dashboard;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Dashboard module (T3): the `queue` section — only the work the requester
 * may actually act on, one key per permission.
 *
 * Visibility mirrors `EloquentChangeManagementRepository::applyVisibilityScope`
 * (admin = all, kepala_* = same team as the initiator, staf = own) but is
 * computed through `DashboardScope` so it can never drift from the recap and
 * trend sections. Draft/approved packages are not actionable and never count.
 */
class DashboardQueueTest extends TestCase
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

    public function test_team_leader_sees_only_own_team_packages_and_submitted_implementations(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);
        $otherTeam = Team::factory()->create(['field_id' => $field->id]);

        $leader = $this->makeUser('kepala_tim', $team);

        // 3 pending packages initiated by own-team members, 2 by outsiders.
        $ownMember = User::factory()->create(['team_id' => $team->id]);
        $packages = ChangeInitiation::factory()->count(3)->create([
            'field_id' => $field->id,
            'initiator_id' => $ownMember->id,
            'status' => 'pending',
        ]);
        ChangeInitiation::factory()->count(2)->create([
            'field_id' => $field->id,
            'initiator_id' => User::factory()->create(['team_id' => $otherTeam->id])->id,
            'status' => 'pending',
        ]);

        // Two of the own-team packages carry submitted implementations; the
        // outside one must not leak into the leader's review queue.
        $this->makeImplementation($packages[0], 'submitted');
        $this->makeImplementation($packages[1], 'submitted');
        $this->makeImplementation(
            ChangeInitiation::factory()->create([
                'initiator_id' => User::factory()->create(['team_id' => $otherTeam->id])->id,
                'status' => 'pending',
            ]),
            'submitted',
        );

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'change_initiations_pending' => ['count' => 3],
            'implementations_review' => ['count' => 2],
        ], $data['queue']);
    }

    public function test_field_head_without_a_team_counts_nothing(): void
    {
        $field = Field::factory()->create();
        $head = $this->makeUser('kepala_bidang', null);
        $field->update(['head_id' => $head->id]);

        // Baseline kepala_bidang lacks both change permissions; grant them so
        // the test isolates "no team" from "no permission" — the keys must
        // exist and read 0, not disappear.
        $head->givePermissionTo(['change.initiation.approve', 'change.implementation.review']);

        // Packages exist in the organisation — still zero for a team-less head.
        ChangeInitiation::factory()->count(4)->create(['status' => 'pending']);
        $this->makeImplementation(
            ChangeInitiation::factory()->create(['status' => 'pending']),
            'submitted',
        );

        Sanctum::actingAs($head);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'change_initiations_pending' => ['count' => 0],
            'implementations_review' => ['count' => 0],
            // Baseline kepala_bidang holds the team-report permission; a
            // team-less head still holds it, so the key appears and reads 0.
            'team_reports_pending' => ['count' => 0],
        ], $data['queue']);
    }

    public function test_staff_gets_no_queue_section(): void
    {
        $staf = $this->makeUser('staf', null);

        Sanctum::actingAs($staf);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertArrayNotHasKey('queue', $data);
    }

    public function test_team_report_permission_holder_sees_only_the_team_report_key(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);
        $approver = $this->makeUser('kepala_bidang', $team);

        // Baseline kepala_bidang holds none of the change queue permissions,
        // so the team-report key is the only one that can appear.
        WfhTeamReport::factory()->pending()->create(['team_id' => $team->id, 'report_date' => now()->toDateString()]);
        WfhTeamReport::factory()->pending()->create(['team_id' => $team->id, 'report_date' => now()->subDay()->toDateString()]);

        Sanctum::actingAs($approver);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'team_reports_pending' => ['count' => 2],
        ], $data['queue']);
    }

    public function test_draft_and_approved_packages_are_not_counted(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);
        $leader = $this->makeUser('kepala_tim', $team);

        ChangeInitiation::factory()->count(2)->create([
            'field_id' => $field->id,
            'initiator_id' => User::factory()->create(['team_id' => $team->id])->id,
            'status' => 'draft',
        ]);
        ChangeInitiation::factory()->create([
            'field_id' => $field->id,
            'initiator_id' => User::factory()->create(['team_id' => $team->id])->id,
            'status' => 'approved',
        ]);

        Sanctum::actingAs($leader);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame([
            'change_initiations_pending' => ['count' => 0],
            'implementations_review' => ['count' => 0],
        ], $data['queue']);
    }

    public function test_admin_sees_all_pending_packages(): void
    {
        ChangeInitiation::factory()->count(3)->create(['status' => 'pending']);

        $admin = $this->makeUser('admin', null);

        Sanctum::actingAs($admin);

        $data = $this->getJson('/api/dashboard')->assertOk()->json('data');

        $this->assertSame(3, $data['queue']['change_initiations_pending']['count']);
    }

    private function makeUser(string $role, ?Team $team): User
    {
        $user = User::factory()->create(['team_id' => $team?->id]);
        $user->assignRole($role);

        return $user;
    }

    /**
     * Attach an implementation in the given workflow status to an existing
     * package. Status columns are not fillable by design; forceFill mirrors
     * what the guarded transition path does.
     */
    private function makeImplementation(ChangeInitiation $package, string $status): ChangeImplementation
    {
        $implementation = ChangeImplementation::create([
            'change_initiation_id' => $package->id,
        ]);
        $implementation->forceFill(['status' => $status])->save();

        return $implementation;
    }
}
