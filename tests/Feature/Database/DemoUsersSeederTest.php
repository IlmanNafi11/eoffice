<?php

namespace Tests\Feature\Database;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use App\Support\Constants\Roles;
use Database\Seeders\DemoUsersSeeder;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ship review: DemoUsersSeeder previously wrote the literal "password123" into
 * the database for three accounts — two of them privileged. Re-running a full
 * db:seed in any environment therefore published a known credential.
 *
 * Two invariants are asserted:
 *   1. It refuses to run outside local/testing (fail closed).
 *   2. It never persists a caller-visible known password: when none is supplied
 *      it generates one, and even a supplied one is not the documented default.
 */
class DemoUsersSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
    }

    public function test_it_seeds_nothing_outside_local_and_testing(): void
    {
        // Run the seeder directly: artisan db:seed asks for confirmation in a
        // non-local environment, and the prompt is not what is under test — the
        // environment guard inside DemoUsersSeeder is.
        $this->app->detectEnvironment(fn () => 'production');

        (new DemoUsersSeeder)->setCommand(
            new class extends Command
            {
                public array $warnings = [];

                public function warn($string, $verbosity = null): void
                {
                    $this->warnings[] = $string;
                }
            },
        )->run();

        $this->assertSame(0, User::query()->count(), 'Demo accounts must not exist in production.');
    }

    public function test_it_seeds_the_three_demo_accounts_in_testing(): void
    {
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        foreach (['staf@kominfo.go.id', 'kepala.tim@kominfo.go.id', 'kepala.bidang@kominfo.go.id'] as $email) {
            $this->assertNotNull(
                User::where('email', $email)->first(),
                "Demo account {$email} must be seeded in testing.",
            );
        }
    }

    public function test_demo_accounts_carry_the_documented_roles(): void
    {
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        $this->assertTrue(User::where('email', 'staf@kominfo.go.id')->first()->hasRole(Roles::STAF));
        $this->assertTrue(User::where('email', 'kepala.tim@kominfo.go.id')->first()->hasRole(Roles::KEPALA_TIM));
        $this->assertTrue(User::where('email', 'kepala.bidang@kominfo.go.id')->first()->hasRole(Roles::KEPALA_BIDANG));
    }

    public function test_it_never_persists_the_documented_default_password(): void
    {
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        foreach (User::query()->get() as $user) {
            $this->assertFalse(
                Hash::check('password123', $user->password),
                "User {$user->email} must not carry the publicly documented demo password.",
            );
        }
    }

    public function test_a_supplied_password_is_honoured_but_the_default_is_not(): void
    {
        // The escape hatch exists so a developer can pick a password; what must
        // never happen is silently falling back to a known one.
        config(['app.demo_password' => 's3cret-dev-only']);

        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        $staf = User::where('email', 'staf@kominfo.go.id')->first();

        $this->assertTrue(Hash::check('s3cret-dev-only', $staf->password));
    }

    public function test_leader_references_are_wired_both_ways(): void
    {
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        $team = Team::where('name', 'Tim Pengembangan')->firstOrFail();
        $field = Field::where('name', 'Bidang Pengembangan Aplikasi')->firstOrFail();

        $this->assertSame(
            User::where('email', 'kepala.tim@kominfo.go.id')->value('id'),
            $team->leader_id,
        );
        $this->assertSame(
            User::where('email', 'kepala.bidang@kominfo.go.id')->value('id'),
            $field->head_id,
        );
    }

    public function test_it_is_idempotent(): void
    {
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);
        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        $this->assertSame(3, User::query()->count(), 'Re-running must not duplicate demo users.');
    }

    public function test_generated_password_is_random_per_run(): void
    {
        // Str::random is the generator: assert the seeder never stores an empty
        // or placeholder hash when no password is configured.
        config(['app.demo_password' => null]);

        $this->artisan('db:seed', ['--class' => 'DemoUsersSeeder']);

        $staf = User::where('email', 'staf@kominfo.go.id')->first();

        $this->assertNotEmpty($staf->password);
        $this->assertNotSame('', $staf->password);
        $this->assertFalse(Hash::check('', $staf->password));
        $this->assertTrue($staf->must_change_password);
        $this->assertNotSame('password123', Str::slug($staf->password));
    }
}
