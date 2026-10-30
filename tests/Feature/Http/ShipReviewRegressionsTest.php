<?php

namespace Tests\Feature\Http;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhTeamReport;
use App\Exceptions\ApiException;
use App\Exceptions\Handler;
use App\Models\Field;
use App\Models\Setting;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Findings from the second ship-review fan-out, each pinned so a regression
 * fails a test:
 *
 * - ApiException carries its own HTTP status; a domain 422 must never be
 *   logged as "Unhandled exception" (that trains operators to ignore the log).
 * - team-report store has a (team_id, report_date) unique index; a concurrent
 *   loser must recover with 422, not a 500.
 * - destroy() must authorize the SAME permission its route requires.
 */
class ShipReviewRegressionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
    }

    public function test_domain_422_is_not_logged_as_unhandled(): void
    {
        $logged = [];

        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
            $logged[] = $event;
        });

        $this->app->make(Handler::class)->report(
            new ApiException('Hanya paket pending yang dapat disetujui.', 422),
        );

        $unhandled = collect($logged)->where('message', 'Unhandled exception');

        $this->assertCount(0, $unhandled->all(), 'A domain 422 is normal traffic, not an unhandled exception.');
    }

    public function test_domain_5xx_still_is_logged(): void
    {
        $logged = [];

        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged) {
            $logged[] = $event;
        });

        $this->app->make(Handler::class)->report(
            new ApiException('Penyimpanan penuh.', 503),
        );

        $unhandled = collect($logged)->where('message', 'Unhandled exception');

        $this->assertCount(1, $unhandled->all(), 'A 5xx must still be logged.');
    }

    public function test_concurrent_team_report_creation_recovers_with_422(): void
    {
        $field = Field::factory()->create();
        $team = Team::factory()->create(['field_id' => $field->id]);

        $kepala = User::factory()->create(['team_id' => $team->id]);
        $kepala->assignRole('kepala_tim');
        $kepala->givePermissionTo('wfh.team_report.create');

        Sanctum::actingAs($kepala);

        // Reproduce the race honestly: the rival row is committed from a model
        // `creating` hook, i.e. AFTER this request's exists() check has already
        // returned false. Inserting beforehand would let the exists() branch
        // answer instead, and the unique-index recovery would go untested.
        WfhTeamReport::creating(function () use ($team, $kepala) {
            DB::table('wfh_team_reports')->insert([
                'team_id' => $team->id,
                'report_date' => '2026-11-02',
                'status' => 'pending',
                'created_by' => $kepala->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        $response = $this->postJson('/api/admin/wfh/team-reports', [
            'team_id' => $team->id,
            'report_date' => '2026-11-02',
        ]);

        $this->assertNotSame(500, $response->status(), $response->getContent());
        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Laporan untuk tim dan tanggal ini sudah ada.');

        WfhTeamReport::flushEventListeners();
    }

    public function test_default_password_setting_rejects_a_short_value(): void
    {
        // password_default_* is applied verbatim to every bulk-created or
        // imported account: a one-character value here is a mass weak
        // credential, so the API must refuse it.
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/password_default_user', ['value' => 'abc'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);

        $this->assertNotSame('abc', Setting::get('password_default_user'));
    }

    public function test_non_password_setting_accepts_a_short_value(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/wfh_notify_start_time', ['value' => '08:00'])
            ->assertOk();
    }

    public function test_delete_permission_alone_allows_package_deletion(): void
    {
        // change.initiation.delete WITHOUT change.initiation.update: the
        // controller used to authorize the wrong permission, so a holder of
        // delete was refused at the controller after passing the route.
        // destroy() is initiator-only and draft-only, so the actor must BE the
        // initiator; the point of the test is which permission it authorizes.
        $user = User::factory()->create(['must_change_password' => false]);
        $package = ChangeInitiation::factory()->create([
            'initiator_id' => $user->id,
            'status' => 'draft',
        ]);
        $user->givePermissionTo('change.initiation.delete');

        Sanctum::actingAs($user);

        $response = $this->deleteJson("/api/changes/{$package->id}");

        $this->assertNotSame(403, $response->status(), 'delete permission must be honoured by the controller.');
        $this->assertContains($response->status(), [204, 200]);
    }

    public function test_update_permission_alone_cannot_delete(): void
    {
        $user = User::factory()->create(['must_change_password' => false]);
        $package = ChangeInitiation::factory()->create([
            'initiator_id' => $user->id,
            'status' => 'draft',
        ]);
        $user->givePermissionTo('change.initiation.update');

        Sanctum::actingAs($user);

        $this->deleteJson("/api/changes/{$package->id}")->assertForbidden();
    }
}
