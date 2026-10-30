<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Ship review: the service had no health endpoint, so an orchestrator could only
 * infer health from traffic. /up must be unauthenticated, cheap, and honest —
 * most importantly it must NOT report healthy when the database is unreachable,
 * which would keep broken pods serving requests.
 */
class HealthCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_up_reports_ok_without_authentication(): void
    {
        $response = $this->getJson('/up');

        $response->assertOk();
        $response->assertJsonPath('status', 'ok');
    }

    public function test_up_is_reachable_without_a_session_or_token(): void
    {
        // No Sanctum acting-as, no seed data: the probe belongs to the
        // infrastructure, not to a user.
        $this->assertGuest();
        $this->getJson('/up')->assertOk();
    }

    public function test_up_reports_unavailable_when_the_database_is_down(): void
    {
        // Simulate an unreachable database at the connection level.
        DB::shouldReceive('connection')->andThrow(new \RuntimeException('connection refused'));

        $response = $this->getJson('/up');

        $response->assertStatus(503);
        $response->assertJsonPath('status', 'unavailable');
    }

    public function test_up_does_not_leak_application_detail(): void
    {
        $response = $this->getJson('/up');

        $body = $response->getContent();

        $this->assertStringNotContainsString('DB_', $body);
        $this->assertStringNotContainsString('password', strtolower($body));
        $this->assertStringNotContainsString('APP_KEY', $body);
    }
}
