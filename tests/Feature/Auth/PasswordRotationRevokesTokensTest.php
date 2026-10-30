<?php

namespace Tests\Feature\Auth;

use App\Domains\Auth\Models\PasswordResetOtp;
use App\Domains\Auth\Services\PasswordResetService;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Password rotation must invalidate outstanding sessions: a token stolen before
 * the rotation cannot survive it. The caller keeps their own token on a
 * voluntary change-password.
 */
class PasswordRotationRevokesTokensTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Team $team;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        $this->team = Team::factory()->create();
        $this->user = User::factory()->create([
            'team_id' => $this->team->id,
            'password' => 'Password123!',
            'must_change_password' => false,
        ]);
        $this->user->assignRole('staf');
    }

    public function test_change_password_revokes_other_sessions(): void
    {
        $other = $this->user->createToken('other-device')->plainTextToken;
        $current = $this->user->createToken('current')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$current}")
            ->postJson('/api/auth/change-password', [
                'current_password' => 'Password123!',
                'new_password' => 'Password456!',
                'new_password_confirmation' => 'Password456!',
            ])
            ->assertStatus(200);

        // The device that performed the change stays signed in...
        $this->assertSame(1, $this->user->tokens()->count());

        // ...every other token is dead. Sanctum caches the resolved user per
        // guard within one test process, so reset the guard to emulate a fresh
        // request from the other device.
        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', "Bearer {$other}")
            ->getJson('/api/auth/me')
            ->assertStatus(401);
    }

    public function test_password_reset_revokes_every_session(): void
    {
        $this->user->createToken('stolen')->plainTextToken;

        // Drive the reset through the service the controller uses: seed a
        // live OTP, verify it, then reset.
        $service = app(PasswordResetService::class);
        PasswordResetOtp::create([
            'email' => $this->user->email,
            'code_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(15),
            'attempts' => 0,
        ]);

        $resetToken = $service->verifyOtp($this->user->email, '123456');
        $this->assertIsString($resetToken);

        $this->assertTrue($service->resetPassword($resetToken, 'BrandNew123!'));

        $this->assertSame(0, $this->user->tokens()->count());
    }

    public function test_seeded_admin_is_forced_to_rotate(): void
    {
        config(['app.admin_password' => 'BootStrap123!']);

        $this->artisan('db:seed', ['--class' => 'AdminUserSeeder']);

        $admin = User::where('email', 'admin@kominfo.go.id')->sole();

        $this->assertTrue((bool) $admin->must_change_password);
        $this->assertTrue($admin->hasRole('admin'));
    }

    public function test_seeded_admin_has_no_static_default_password(): void
    {
        // No APP_ADMIN_PASSWORD configured: the seeder must generate one, not
        // fall back to a documented literal.
        config(['app.admin_password' => '']);

        $this->artisan('db:seed', ['--class' => 'AdminUserSeeder']);

        $admin = User::where('email', 'admin@kominfo.go.id')->sole();

        $this->assertFalse(Hash::check('password', $admin->password));
        $this->assertFalse(Hash::check('set-password', $admin->password));
    }

    /** Garbage filters must be a 422, not a 500 from the database. */
    public function test_change_index_rejects_non_numeric_field_id(): void
    {
        Sanctum::actingAs($this->user);
        $this->user->givePermissionTo('change.initiation.view');

        $this->getJson('/api/changes?field_id=abc')->assertStatus(422);
    }

    public function test_monitoring_rejects_garbage_date(): void
    {
        $kepala = User::factory()->create(['team_id' => $this->team->id]);
        $kepala->assignRole('kepala_tim');
        Sanctum::actingAs($kepala);

        $this->getJson('/api/admin/wfh/monitoring?date=not-a-date')->assertStatus(422);
    }
}
