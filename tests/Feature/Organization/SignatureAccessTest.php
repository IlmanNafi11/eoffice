<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Signatures are identity documents. They must never be web-served, and a
 * viewer must be authorized per request: self, user.manage, or a kepala_* of
 * the same bidang (the approval flow needs to see the maker's signature).
 */
class SignatureAccessTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private Team $team;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        $this->field = Field::create(['name' => 'Bidang A']);
        $this->team = Team::create(['field_id' => $this->field->id, 'name' => 'Tim A']);
    }

    private function userWithSignature(array $attributes = []): User
    {
        $user = User::factory()->create($attributes + ['team_id' => $this->team->id]);
        $this->setUserSignature($user);

        return $user->fresh();
    }

    public function test_owner_can_fetch_own_signature(): void
    {
        $owner = $this->userWithSignature();
        Sanctum::actingAs($owner);

        $this->get("/api/signatures/{$owner->id}")
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png');
    }

    public function test_unrelated_staf_cannot_fetch_colleague_signature(): void
    {
        $owner = $this->userWithSignature();
        $other = User::factory()->create(['team_id' => $this->team->id]);
        $other->assignRole('staf');

        Sanctum::actingAs($other);

        $this->getJson("/api/signatures/{$owner->id}")->assertStatus(403);
    }

    public function test_kepala_of_the_same_field_can_fetch_member_signature(): void
    {
        $owner = $this->userWithSignature();
        $kepala = User::factory()->create(['team_id' => $this->team->id]);
        $kepala->assignRole('kepala_tim');

        Sanctum::actingAs($kepala);

        $this->get("/api/signatures/{$owner->id}")->assertOk();
    }

    public function test_kepala_of_another_field_cannot_fetch_signature(): void
    {
        $owner = $this->userWithSignature();

        $otherField = Field::create(['name' => 'Bidang B']);
        $otherTeam = Team::create(['field_id' => $otherField->id, 'name' => 'Tim B']);
        $outsider = User::factory()->create(['team_id' => $otherTeam->id]);
        $outsider->assignRole('kepala_tim');

        Sanctum::actingAs($outsider);

        $this->getJson("/api/signatures/{$owner->id}")->assertStatus(403);
    }

    public function test_user_manager_can_fetch_any_signature(): void
    {
        $owner = $this->userWithSignature();
        $admin = User::factory()->create(['team_id' => $this->team->id]);
        $admin->assignRole('admin');

        Sanctum::actingAs($admin);

        $this->get("/api/signatures/{$owner->id}")->assertOk();
    }

    public function test_missing_signature_returns_404(): void
    {
        $user = User::factory()->create(['team_id' => $this->team->id]);
        Sanctum::actingAs($user);

        $this->getJson("/api/signatures/{$user->id}")->assertStatus(404);
    }

    public function test_guest_cannot_fetch_signature(): void
    {
        $owner = $this->userWithSignature();

        $this->getJson("/api/signatures/{$owner->id}")->assertStatus(401);
    }

    /**
     * The whole point of the private disk: no signature file may sit under the
     * web-served public path.
     */
    public function test_signature_files_are_written_outside_the_public_disk(): void
    {
        $owner = $this->userWithSignature();

        $this->assertTrue(Storage::disk('local')->exists($owner->signature_path));
        $this->assertFalse(Storage::disk('public')->exists($owner->signature_path));
    }
}
