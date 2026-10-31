<?php

namespace Tests\Feature;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\Wfh\Models\WfhReport;
use App\Models\Field;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QrVerificationTest extends TestCase
{
    use RefreshDatabase;

    private User $initiator;

    private Field $field;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->initiator = User::factory()->create();
        $this->field = Field::factory()->create();
    }

    public function test_verify_endpoint_returns_404_for_invalid_hash_format(): void
    {
        $response = $this->getJson('/api/verify/invalidhash123');

        $response->assertStatus(404);
    }

    public function test_verify_endpoint_returns_404_for_nonexistent_token(): void
    {
        $token = bin2hex(random_bytes(32));

        $response = $this->getJson("/api/verify/{$token}");

        $response->assertStatus(404)
            ->assertJsonPath('success', false);
    }

    public function test_verify_endpoint_returns_document_info_for_valid_wfh_token(): void
    {
        $token = bin2hex(random_bytes(32));

        WfhReport::factory()->create([
            'user_id' => $this->initiator->id,
            'status' => 'approved',
            'verification_token' => $token,
            'maker_signed_at' => now(),
            'supervisor_signed_at' => now(),
        ]);

        $response = $this->getJson("/api/verify/{$token}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.doc_type', 'WFH Report')
            ->assertJsonPath('data.status', 'terverifikasi')
            ->assertJsonStructure([
                'success',
                'data' => ['doc_type', 'doc_number', 'report_date', 'status', 'message'],
            ]);
    }

    public function test_verify_endpoint_returns_document_info_for_valid_change_token(): void
    {
        $token = bin2hex(random_bytes(32));
        $initiation = ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->initiator->id,
            'verification_token' => $token,
            'status' => 'approved',
            'initiator_signed_at' => now(),
            'reviewed_at' => now(),
        ]);

        $response = $this->getJson("/api/verify/{$token}");

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.doc_type', 'Change Initiation')
            ->assertJsonPath('data.doc_number', $initiation->doc_number)
            ->assertJsonPath('data.status', 'terverifikasi');
    }

    /** A draft package whose token was forged client-side must NOT verify. */
    public function test_verify_endpoint_rejects_draft_change_token(): void
    {
        $token = bin2hex(random_bytes(32));
        ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->initiator->id,
            'verification_token' => $token,
            'status' => 'draft',
        ]);

        $this->getJson("/api/verify/{$token}")->assertStatus(404);
    }

    /** An approved package still missing the reviewer signature must NOT verify. */
    public function test_verify_endpoint_rejects_unsigned_approved_change(): void
    {
        $token = bin2hex(random_bytes(32));
        ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->initiator->id,
            'verification_token' => $token,
            'status' => 'approved',
            'initiator_signed_at' => now(),
            'reviewed_at' => null,
        ]);

        $this->getJson("/api/verify/{$token}")->assertStatus(404);
    }

    /** A pending WFH report must NOT verify: only approved+fully-signed docs do. */
    public function test_verify_endpoint_rejects_unsigned_wfh_report(): void
    {
        $token = bin2hex(random_bytes(32));
        WfhReport::factory()->create([
            'user_id' => $this->initiator->id,
            'status' => 'pending',
            'verification_token' => $token,
            'maker_signed_at' => now(),
            'supervisor_signed_at' => null,
        ]);

        $this->getJson("/api/verify/{$token}")->assertStatus(404);
    }

    /**
     * The public verify endpoint must stay rate limited: without it a leaked QR
     * (or a guessed token) can be used as an unthrottled oracle.
     *
     * The effective limiter is the `api` middleware group (`ThrottleRequests:api`,
     * 60/min by user-or-IP); the route-level `throttle:60,1` is a second bucket on
     * the same budget. Removing the group's limiter makes this test RED (verified).
     */
    public function test_verify_endpoint_is_rate_limited(): void
    {
        $token = bin2hex(random_bytes(32));

        for ($i = 0; $i < 60; $i++) {
            $this->getJson("/api/verify/{$token}")->assertStatus(404);
        }

        $this->getJson("/api/verify/{$token}")->assertStatus(429);
    }
}
