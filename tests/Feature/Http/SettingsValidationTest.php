<?php

namespace Tests\Feature\Http;

use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Task 5 (ux-settings): nilai setting berformat divalidasi per key di server —
 * UI hanyalah kenyamanan label/kontrol, server tetap otoritas format.
 *
 * - `wfh_notify_start_time` harus format HH:mm 24-jam.
 * - `wfh_allowed_days` harus array integer subset 1..7.
 * - `wfh_sessions` harus array subset {pagi,siang,sore}.
 * - `password_default_*` mempertahankan aturan panjang 8..255 yang ada.
 */
class SettingsValidationTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);
        $this->admin = User::factory()->create();
        $this->admin->assignRole('admin');
        Sanctum::actingAs($this->admin);
    }

    public function test_notify_time_rejects_non_time_value(): void
    {
        $this->putJson('/api/admin/settings/wfh_notify_start_time', ['value' => '25:00'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);

        $this->putJson('/api/admin/settings/wfh_notify_start_time', ['value' => 'abc'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_notify_time_accepts_valid_time(): void
    {
        $this->putJson('/api/admin/settings/wfh_notify_start_time', ['value' => '08:15'])
            ->assertOk();

        $this->assertSame('08:15', Setting::get('wfh_notify_start_time'));
    }

    public function test_allowed_days_rejects_non_integer_or_out_of_range(): void
    {
        $this->putJson('/api/admin/settings/wfh_allowed_days', ['value' => [1, 2, 99]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);

        $this->putJson('/api/admin/settings/wfh_allowed_days', ['value' => '1,2,3'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_allowed_days_accepts_a_subset(): void
    {
        $this->putJson('/api/admin/settings/wfh_allowed_days', ['value' => [1, 2, 3, 4, 5]])
            ->assertOk();

        $this->assertSame([1, 2, 3, 4, 5], Setting::get('wfh_allowed_days'));
    }

    public function test_sessions_rejects_unknown_session_name(): void
    {
        $this->putJson('/api/admin/settings/wfh_sessions', ['value' => ['pagi', 'malam']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['value']);
    }

    public function test_sessions_accepts_a_subset(): void
    {
        $this->putJson('/api/admin/settings/wfh_sessions', ['value' => ['pagi', 'sore']])
            ->assertOk();

        $this->assertSame(['pagi', 'sore'], Setting::get('wfh_sessions'));
    }
}
