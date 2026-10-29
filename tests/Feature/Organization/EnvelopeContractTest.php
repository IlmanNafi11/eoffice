<?php

namespace Tests\Feature\Organization;

use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Envelope module (Task 2): Organization controllers must emit the single
 * ApiResponse contract — user index meta with per_page, per_page clamp 1..100,
 * DELETE → 204 without body, 404s with success:false.
 */
class EnvelopeContractTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);

        $field = Field::create(['name' => 'Bidang Test']);
        $team = Team::create(['field_id' => $field->id, 'name' => 'Tim Test']);

        $this->admin = User::create([
            'team_id' => $team->id,
            'name' => 'Admin',
            'nip' => '0000000001',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'is_active' => true,
        ]);
        $this->admin->assignRole('admin');
        Sanctum::actingAs($this->admin);
    }

    public function test_user_index_emits_exactly_the_envelope_keys_and_four_meta_keys(): void
    {
        User::factory(5)->create(['team_id' => $this->admin->team_id]);

        $body = $this->getJson('/api/admin/users')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertNull($body['message']);
        $this->assertCount(6, $body['data']);
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
    }

    /** @return list<string> */
    private function sortedKeys(array $payload): array
    {
        $keys = array_keys($payload);
        sort($keys);

        return $keys;
    }

    public function test_user_index_meta_contains_per_page_key(): void
    {
        $response = $this->getJson('/api/admin/users');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('meta.per_page', 15)
            ->assertJsonStructure([
                'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            ]);
    }

    public function test_user_index_per_page_is_clamped_to_100(): void
    {
        $this->getJson('/api/admin/users?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_user_index_per_page_zero_is_clamped_to_1(): void
    {
        $this->getJson('/api/admin/users?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    public function test_destroy_returns_204_without_body(): void
    {
        $target = User::factory()->create(['team_id' => $this->admin->team_id]);

        $this->deleteJson('/api/admin/users/'.$target->id)
            ->assertNoContent();

        $this->assertSoftDeleted('users', ['id' => $target->id]);
    }

    // Route-model binding resolves these, so the framework raises the 404 and
    // its body shape is the `error-contract` module's concern. Status only.
    public function test_show_missing_user_returns_404(): void
    {
        $this->getJson('/api/admin/users/999999')
            ->assertNotFound();
    }

    public function test_update_missing_user_returns_404(): void
    {
        $this->putJson('/api/admin/users/999999', ['name' => 'X'])
            ->assertNotFound();
    }

    public function test_destroy_missing_user_returns_404(): void
    {
        $this->deleteJson('/api/admin/users/999999')
            ->assertNotFound();
    }
}
