<?php

namespace Tests\Feature\Http;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Error-contract module (T3): an unauthenticated request without
 * Accept: application/json must get a 401 JSON envelope, not a 500 from the
 * missing `login` route (RouteNotFoundException) and not a redirect.
 */
class UnauthenticatedRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_plain_request_to_protected_route_renders_401_json(): void
    {
        $response = $this->post('/api/auth/change-password', [
            'current_password' => 'whatever',
            'password' => 'new-password',
            'password_confirmation' => 'new-password',
        ]);

        $response->assertStatus(401)
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unauthenticated.');
    }

    public function test_json_request_to_protected_route_renders_401_json(): void
    {
        $this->postJson('/api/auth/change-password', [])
            ->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Unauthenticated.');
    }
}
