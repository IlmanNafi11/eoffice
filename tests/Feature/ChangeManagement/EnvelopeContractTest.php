<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeType;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Envelope module (Task 5): ChangeManagement controllers must emit the single
 * ApiResponse contract — full envelope on the package list and change-types,
 * per_page clamped to 1..100, DELETE → 204 without body, and attachments
 * returned as wrapped resources (id/path/url/sort_order) instead of raw
 * Eloquent rows.
 */
class EnvelopeContractTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private Team $team;

    private User $staf;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $this->field = Field::factory()->create();
        $this->team = Team::factory()->create(['field_id' => $this->field->id]);

        $this->staf = User::factory()->create(['team_id' => $this->team->id]);
        $this->staf->assignRole('staf');

        Sanctum::actingAs($this->staf);
    }

    // ─── package list ────────────────────────────────────────────

    public function test_package_index_emits_the_full_envelope_with_four_meta_keys(): void
    {
        $this->createDraft();

        $body = $this->getJson('/api/changes')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertNull($body['message']);
        $this->assertCount(1, $body['data']);
        $this->assertSame(
            ['current_page', 'last_page', 'per_page', 'total'],
            $this->sortedKeys($body['meta']),
        );
        $this->assertSame(15, $body['meta']['per_page']);
    }

    public function test_package_index_per_page_is_clamped_to_100(): void
    {
        $this->createDraft();

        $this->getJson('/api/changes?per_page=1000')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 100);
    }

    public function test_package_index_per_page_floor_is_one(): void
    {
        $this->createDraft();

        $this->getJson('/api/changes?per_page=0')
            ->assertOk()
            ->assertJsonPath('meta.per_page', 1);
    }

    // ─── change types ────────────────────────────────────────────

    public function test_change_types_index_emits_the_full_envelope(): void
    {
        ChangeType::create(['name' => 'Aplikasi']);

        $body = $this->getJson('/api/change-types')->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertTrue($body['success']);
        $this->assertNull($body['message']);
        $this->assertNull($body['meta']);
        $this->assertCount(1, $body['data']);
        $this->assertSame(['id', 'name'], $this->sortedKeys($body['data'][0]));
    }

    // ─── delete ──────────────────────────────────────────────────

    public function test_destroy_returns_204_without_body(): void
    {
        $package = $this->createDraft();

        $response = $this->deleteJson('/api/changes/'.$package['id'])->assertNoContent();

        $this->assertStringNotContainsString(
            'application/json',
            (string) $response->headers->get('Content-Type'),
        );
        $this->assertSoftDeleted('change_initiations', ['id' => $package['id']]);
    }

    // ─── attachments ─────────────────────────────────────────────

    public function test_attachment_upload_returns_wrapped_resources(): void
    {
        Storage::fake('public');
        $package = $this->createDraft();

        $body = $this->postJson("/api/changes/{$package['id']}/attachments", [
            'files' => [UploadedFile::fake()->image('doc.jpg')],
        ])->assertOk()->json();

        $this->assertSame(['data', 'message', 'meta', 'success'], $this->sortedKeys($body));
        $this->assertSame('Lampiran berhasil diunggah.', $body['message']);
        $this->assertCount(1, $body['data']);
        $this->assertSame(
            ['id', 'path', 'sort_order', 'url'],
            $this->sortedKeys($body['data'][0]),
        );
        $this->assertStringStartsWith('http', $body['data'][0]['url']);
    }

    public function test_attachment_upload_uses_a_single_insert_for_many_files(): void
    {
        Storage::fake('public');
        $package = $this->createDraft();

        DB::enableQueryLog();
        DB::flushQueryLog();

        $this->postJson("/api/changes/{$package['id']}/attachments", [
            'files' => [
                UploadedFile::fake()->image('a.jpg'),
                UploadedFile::fake()->image('b.jpg'),
                UploadedFile::fake()->image('c.jpg'),
            ],
        ])->assertOk();

        $inserts = 0;
        foreach (DB::getQueryLog() as $entry) {
            if (str_starts_with(strtolower(ltrim($entry['query'])), 'insert into "change_implementation_attachments"')) {
                $inserts++;
            }
        }
        DB::flushQueryLog();

        $this->assertSame(
            1,
            $inserts,
            'Uploading N attachments must be one batched INSERT, not N inserts.'
        );
    }

    // ─── error bodies on JSON paths ──────────────────────────────

    public function test_show_missing_package_returns_404_with_success_false(): void
    {
        $this->getJson('/api/changes/999999')
            ->assertNotFound()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Paket perubahan tidak ditemukan.')
            ->assertJsonMissingPath('errors');
    }

    // ─── helpers ─────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private function createDraft(): array
    {
        return $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
            ],
            'implementation' => ['priority' => 'normal', 'impact' => 'Minor'],
        ])->assertStatus(201)->json('data.initiation');
    }

    /** @return list<string> */
    private function sortedKeys(array $payload): array
    {
        $keys = array_keys($payload);
        sort($keys);

        return $keys;
    }
}
