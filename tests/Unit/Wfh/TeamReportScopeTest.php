<?php

namespace Tests\Unit\Wfh;

use App\Domains\Wfh\Models\WfhTeamReport;
use App\Domains\Wfh\Services\TeamReportScope;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Unit TeamReportScope — mengeja aturan scope mentah tanpa lewat HTTP:
 * fail-closed `whereRaw('1 = 0')` untuk non-admin tanpa field adalah
 * pertahanan terakhir bila pemanggil lupa `noFieldDenial()` (ship review:
 * tidak terjangkau lewat feature test karena controller selalu 422 lebih
 * dulu — hanya uji unit yang bisa meminjamnya).
 */
class TeamReportScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_non_admin_without_field_is_fail_closed(): void
    {
        $user = User::factory()->create(['team_id' => null]);

        $query = (new TeamReportScope)->applyTo(WfhTeamReport::query(), $user);

        $this->assertSame('select * from "wfh_team_reports" where 1 = 0', $query->toSql());
        $this->assertTrue($query->get()->isEmpty());
    }

    public function test_admin_scope_is_unrestricted(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        WfhTeamReport::factory()->create();

        $query = (new TeamReportScope)->applyTo(WfhTeamReport::query(), $admin);

        // Tanpa batasan: tidak ada filter `whereHas`, semua baris terbaca.
        $this->assertStringNotContainsString('has', $query->toSql());
        $this->assertSame(1, $query->count());
    }

    public function test_non_head_is_locked_to_own_team(): void
    {
        $field = Field::create(['name' => 'Bidang A']);
        $own = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $sibling = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);
        $user = User::factory()->create(['team_id' => $own->id]);

        $query = (new TeamReportScope)->applyTo(WfhTeamReport::query(), $user);
        $ids = $query->get()->pluck('team_id')->unique();

        WfhTeamReport::factory()->create(['team_id' => $own->id]);
        WfhTeamReport::factory()->create(['team_id' => $sibling->id]);

        $scoped = (new TeamReportScope)->applyTo(WfhTeamReport::query(), $user)->get();
        $this->assertSame([$own->id], $scoped->pluck('team_id')->unique()->all());
    }

    public function test_field_head_sees_all_teams_in_field(): void
    {
        $head = User::factory()->create();
        $field = Field::create(['name' => 'Bidang B', 'head_id' => $head->id]);
        $teamA = Team::create(['field_id' => $field->id, 'name' => 'Tim A']);
        $teamB = Team::create(['field_id' => $field->id, 'name' => 'Tim B']);
        $head->forceFill(['team_id' => $teamA->id])->save();

        WfhTeamReport::factory()->create(['team_id' => $teamA->id]);
        WfhTeamReport::factory()->create(['team_id' => $teamB->id]);

        $scoped = (new TeamReportScope)->applyTo(WfhTeamReport::query(), $head)->get();
        $this->assertCount(2, $scoped);
    }

    public function test_denial_for_out_of_field_report_is_403(): void
    {
        $field = Field::create(['name' => 'Bidang C']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim C']);
        $user = User::factory()->create(['team_id' => $team->id]);

        $otherField = Field::create(['name' => 'Bidang D']);
        $otherTeam = Team::create(['field_id' => $otherField->id, 'name' => 'Tim D']);
        $report = WfhTeamReport::factory()->create(['team_id' => $otherTeam->id]);

        $denial = (new TeamReportScope)->denialFor($user, $report);

        $this->assertNotNull($denial);
        $this->assertSame(403, $denial->getStatusCode());
    }

    public function test_admin_is_never_denied(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');

        $field = Field::create(['name' => 'Bidang E']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim E']);
        $report = WfhTeamReport::factory()->create(['team_id' => $team->id]);

        $this->assertNull((new TeamReportScope)->denialFor($admin, $report));
    }
}
