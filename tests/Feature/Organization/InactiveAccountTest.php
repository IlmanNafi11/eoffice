<?php

namespace Tests\Feature\Organization;

use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * H5: deactivation must cut access immediately. A Sanctum token lives until it
 * expires, so the middleware re-checks is_active and the deactivation path
 * revokes every issued token.
 */
class InactiveAccountTest extends TestCase
{
    use RefreshDatabase;

    private Team $team;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->team = Team::factory()->create();
    }

    /** A real bearer token from a deactivated account must be refused. */
    public function test_inactive_user_token_is_rejected(): void
    {
        $user = User::factory()->create(['team_id' => $this->team->id, 'is_active' => true]);
        $token = $user->createToken('probe')->plainTextToken;

        $user->forceFill(['is_active' => false])->save();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertStatus(403)
            ->assertJsonPath('success', false);
    }

    /** The rejected request also drops the token row, so retries stay dead. */
    public function test_inactive_user_tokens_are_purged_on_rejection(): void
    {
        $user = User::factory()->create(['team_id' => $this->team->id, 'is_active' => true]);
        $token = $user->createToken('probe')->plainTextToken;

        $user->forceFill(['is_active' => false])->save();

        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/auth/me');

        $this->assertSame(0, $user->tokens()->count());
    }

    /** Admin deactivation revokes immediately, not at token expiry. */
    public function test_admin_deactivation_revokes_target_tokens(): void
    {
        $admin = User::factory()->create(['team_id' => $this->team->id]);
        $admin->assignRole('admin');

        $target = User::factory()->create(['team_id' => $this->team->id, 'is_active' => true]);
        $target->createToken('probe');

        Sanctum::actingAs($admin);

        $this->putJson("/api/admin/users/{$target->id}", ['is_active' => false])
            ->assertStatus(200);

        $this->assertFalse((bool) $target->fresh()->is_active);
        $this->assertSame(0, $target->tokens()->count());
    }

    /** Soft-deleting a user also kills their sessions. */
    public function test_admin_delete_revokes_target_tokens(): void
    {
        $admin = User::factory()->create(['team_id' => $this->team->id]);
        $admin->assignRole('admin');

        $target = User::factory()->create(['team_id' => $this->team->id]);
        $target->createToken('probe');

        Sanctum::actingAs($admin);

        $this->deleteJson("/api/admin/users/{$target->id}")->assertStatus(204);

        $this->assertSame(0, $target->tokens()->count());
    }

    /** An active user is unaffected. */
    public function test_active_user_token_still_works(): void
    {
        $user = User::factory()->create(['team_id' => $this->team->id, 'is_active' => true]);
        $token = $user->createToken('probe')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/auth/me')
            ->assertStatus(200);
    }
}
