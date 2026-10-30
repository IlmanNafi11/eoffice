<?php

namespace Tests\Feature\Http;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use App\Support\Signature\SignaturePath;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Ship review SEC-02: the signature endpoint used to gate on role *names*, so
 * anyone holding kepala_tim/kepala_bidang could read any signature. It now also
 * requires the wfh.monitoring.view permission and same-field membership.
 *
 * These tests pin both halves of that gate: removing either one must fail.
 */
class SignatureAccessTest extends TestCase
{
    use RefreshDatabase;

    private Field $fieldA;

    private Field $fieldB;

    private Team $teamA;

    private Team $teamB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        Storage::fake('local');

        $this->fieldA = Field::factory()->create();
        $this->fieldB = Field::factory()->create();
        $this->teamA = Team::factory()->create(['field_id' => $this->fieldA->id]);
        $this->teamB = Team::factory()->create(['field_id' => $this->fieldB->id]);
    }

    private function user(Team $team, string $role, bool $withMonitoring = false): User
    {
        $user = User::factory()->create([
            'team_id' => $team->id,
            'is_active' => true,
            'must_change_password' => false,
        ]);

        $user->assignRole($role);

        if ($withMonitoring) {
            $user->givePermissionTo('wfh.monitoring.view');
        }

        return $user;
    }

    private function withSignature(User $user): User
    {
        // SignaturePath resolves against the 'local' disk, so write there.
        $relative = 'signatures/'.$user->id.'.png';

        Storage::disk('local')->put(
            $relative,
            UploadedFile::fake()->image('sig.png')->getContent(),
        );

        $user->forceFill(['signature_path' => $relative])->save();

        return $user->fresh();
    }

    public function test_owner_can_read_own_signature(): void
    {
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));

        Sanctum::actingAs($owner);

        $this->getJson("/api/signatures/{$owner->id}")->assertOk();
    }

    public function test_user_manage_can_read_any_signature(): void
    {
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));

        $admin = $this->user($this->teamA, Roles::ADMIN);
        $admin->givePermissionTo('user.manage');

        Sanctum::actingAs($admin);

        $this->getJson("/api/signatures/{$owner->id}")->assertOk();
    }

    public function test_kepala_in_same_field_with_monitoring_permission_can_read(): void
    {
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));
        $kepala = $this->user($this->teamA, Roles::KEPALA_TIM, withMonitoring: true);

        Sanctum::actingAs($kepala);

        $this->getJson("/api/signatures/{$owner->id}")->assertOk();
    }

    public function test_role_alone_is_not_enough_without_the_permission(): void
    {
        // The core of SEC-02: this is exactly the actor the old role-name check
        // let through — a kepala_* of the same bidang. Only the permission now
        // separates "may inspect" from "may not", so it is revoked explicitly
        // (the seeded role grants it, hence revoke rather than simply not add).
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));

        // No direct grant: the permission comes from the seeded role, which is
        // what has to be revoked for this test to isolate the permission gate.
        $kepala = $this->user($this->teamA, Roles::KEPALA_TIM);
        $this->assertTrue($kepala->can('wfh.monitoring.view'), 'Seed must grant the permission via the role.');

        // revokePermissionTo() on a user only drops permissions granted
        // *directly*; here it comes from the role, so remove it from the role
        // itself and clear spatie's resolution cache, otherwise can() still
        // answers true and the assertion below proves nothing.
        Role::findByName(Roles::KEPALA_TIM)
            ->revokePermissionTo('wfh.monitoring.view');

        app()->make(PermissionRegistrar::class)->forgetCachedPermissions();

        // fresh() keeps cached relations on the same instance; re-read the row
        // so the revoked permission is genuinely gone from this actor.
        $kepala = User::find($kepala->id);

        $this->assertFalse($kepala->can('wfh.monitoring.view'));
        $this->assertTrue($kepala->hasRole(Roles::KEPALA_TIM));

        Sanctum::actingAs($kepala);

        $this->getJson("/api/signatures/{$owner->id}")->assertForbidden();
    }

    public function test_permission_alone_is_not_enough_across_fields(): void
    {
        // Same permission, different bidang: still a 403.
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));
        $kepala = $this->user($this->teamB, Roles::KEPALA_BIDANG, withMonitoring: true);

        Sanctum::actingAs($kepala);

        $this->getJson("/api/signatures/{$owner->id}")->assertForbidden();
    }

    public function test_plain_colleague_in_same_team_is_refused(): void
    {
        $owner = $this->withSignature($this->user($this->teamA, Roles::STAF));
        $colleague = $this->user($this->teamA, Roles::STAF, withMonitoring: true);

        Sanctum::actingAs($colleague);

        // Same field and the permission, but not a kepala_* role: refused.
        $this->getJson("/api/signatures/{$owner->id}")->assertForbidden();
    }

    public function test_missing_signature_file_is_404_not_500(): void
    {
        $owner = $this->user($this->teamA, Roles::STAF);
        $owner->forceFill(['signature_path' => 'signatures/absent.png'])->save();

        Sanctum::actingAs($owner);

        $this->getJson("/api/signatures/{$owner->id}")->assertNotFound();
    }
}
