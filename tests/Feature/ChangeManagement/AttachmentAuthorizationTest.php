<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeImplementation;
use App\Domains\ChangeManagement\Models\ChangeImplementationAttachment;
use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Ship review S2: evidence attachments were served as static /storage URLs, so
 * anyone holding a link (or able to guess one) could read internal evidence
 * without authenticating. They now stream through
 * GET /changes/{id}/attachments/{attachment}, which applies the same package
 * visibility rule as the read APIs.
 *
 * The regression this guards against is subtle: the resource may publish any
 * URL it likes, so what must be tested is the ENDPOINT, not the payload shape.
 */
class AttachmentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private Field $fieldA;

    private Field $fieldB;

    private User $initiator;

    private User $outsider;

    private ChangeInitiation $package;

    private ChangeImplementationAttachment $attachment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        $this->artisan('db:seed', ['--class' => 'SettingsSeeder']);

        Storage::fake('public');

        $this->fieldA = Field::factory()->create();
        $this->fieldB = Field::factory()->create();
        $teamA = Team::factory()->create(['field_id' => $this->fieldA->id]);
        $teamB = Team::factory()->create(['field_id' => $this->fieldB->id]);

        $this->initiator = User::factory()->create(['team_id' => $teamA->id]);
        $this->initiator->assignRole('staf');

        $this->outsider = User::factory()->create(['team_id' => $teamB->id]);
        $this->outsider->assignRole('staf');
        $this->outsider->givePermissionTo('change.initiation.view');

        $this->package = ChangeInitiation::factory()->create([
            'field_id' => $this->fieldA->id,
            'initiator_id' => $this->initiator->id,
        ]);

        $implementation = ChangeImplementation::create([
            'change_initiation_id' => $this->package->id,
        ]);

        $path = 'change-attachments/evidence.png';
        Storage::disk('public')->put($path, UploadedFile::fake()->image('e.png')->getContent());

        $this->attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $implementation->id,
            'path' => $path,
            'sort_order' => 1,
        ]);
    }

    private function url(): string
    {
        return '/api/changes/'.$this->package->id.'/attachments/'.$this->attachment->id;
    }

    public function test_unauthenticated_request_is_refused(): void
    {
        $this->getJson($this->url())->assertUnauthorized();
    }

    public function test_initiator_can_stream_own_evidence(): void
    {
        Sanctum::actingAs($this->initiator);

        // get() returns a BinaryFileResponse (no status() helper), so assert on
        // the raw status code instead.
        $response = $this->get($this->url());

        $this->assertSame(200, $response->getStatusCode(), 'Initiator must be able to stream own evidence.');
        $cacheControl = (string) $response->headers->get('Cache-Control');

        $this->assertStringContainsString('no-store', $cacheControl);
        $this->assertStringNotContainsString(
            'public',
            $cacheControl,
            'Evidence must never be marked cacheable by shared caches.',
        );
    }

    public function test_user_from_another_field_is_refused(): void
    {
        // change.initiation.view is held, but the package is out of scope.
        Sanctum::actingAs($this->outsider);

        $this->getJson($this->url())->assertNotFound();
    }

    public function test_attachment_from_another_package_is_not_reachable(): void
    {
        $otherPackage = ChangeInitiation::factory()->create([
            'field_id' => $this->fieldA->id,
            'initiator_id' => $this->initiator->id,
        ]);

        $otherImplementation = ChangeImplementation::create([
            'change_initiation_id' => $otherPackage->id,
        ]);

        $otherAttachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $otherImplementation->id,
            'path' => 'change-attachments/other.png',
            'sort_order' => 1,
        ]);

        Sanctum::actingAs($this->initiator);

        // The attachment exists and belongs to a package this user can see, but
        // not to the package named in the URL: cross-package reach is refused.
        $this->getJson('/api/changes/'.$this->package->id.'/attachments/'.$otherAttachment->id)
            ->assertNotFound();
    }

    public function test_missing_file_on_disk_is_404_not_500(): void
    {
        $this->attachment->forceFill(['path' => 'change-attachments/gone.png'])->save();

        Sanctum::actingAs($this->initiator);

        $this->getJson($this->url())->assertNotFound();
    }

    public function test_the_resource_publishes_the_authorized_endpoint_not_a_storage_url(): void
    {
        Sanctum::actingAs($this->initiator);

        $response = $this->getJson('/api/changes/'.$this->package->id);

        $urls = collect($response->json('data.implementation.attachments.*.url'))
            ->merge($response->json('data.attachments.*.url'))
            ->filter();

        $this->assertNotSame([], $urls->all(), 'Expected at least one attachment url in the payload.');

        foreach ($urls as $url) {
            $this->assertStringContainsString('/attachments/', $url);
            $this->assertStringNotContainsString('/storage/', $url, 'Evidence must not be a static storage URL.');
        }
    }

    public function test_initiator_can_delete_attachment_from_own_draft(): void
    {
        // setUp seeds the file on the 'public' disk; pre-cutover evidence lives
        // there, so deletion must clear BOTH disks, not just the private one.
        Storage::disk('local')->put($this->attachment->path, 'private copy');

        // ship#18: a successful unlink must NOT raise the stranded-bytes
        // warning — a `delete()` returning false means the private bytes are
        // still on disk with no row left to authorize or attribute them.
        Log::spy();

        Sanctum::actingAs($this->initiator);

        $this->deleteJson($this->url())->assertNoContent();

        Log::shouldNotHaveReceived('warning');
        Storage::disk('public')->assertMissing($this->attachment->path);
        Storage::disk('local')->assertMissing($this->attachment->path);
        $this->assertDatabaseMissing('change_implementation_attachments', ['id' => $this->attachment->id]);
    }

    public function test_delete_attachment_requires_draft_status(): void
    {
        $this->package->forceFill(['status' => 'pending'])->save();

        Sanctum::actingAs($this->initiator);

        $this->deleteJson($this->url())->assertUnprocessable();
        Storage::disk('public')->assertExists($this->attachment->path);
        $this->assertDatabaseHas('change_implementation_attachments', ['id' => $this->attachment->id]);
    }

    public function test_delete_attachment_rejects_non_initiator(): void
    {
        // Same field, view permission held: visibility is not the gate here,
        // ownership is.
        Sanctum::actingAs($this->outsider);

        $this->deleteJson($this->url())->assertForbidden();
        Storage::disk('public')->assertExists($this->attachment->path);
    }

    /**
     * The 403 above comes from the route's `permission:` middleware, so the
     * guard's own initiator branch is never exercised by it. A user who holds
     * change.implementation.update (kepala_tim does) but is not the initiator
     * must reach the guard and be refused with its own message: ownership is
     * the gate, not the permission.
     */
    public function test_permission_holding_non_initiator_is_refused_by_the_guard(): void
    {
        $this->outsider->givePermissionTo('change.implementation.update');

        Sanctum::actingAs($this->outsider);

        $this->deleteJson($this->url())
            ->assertForbidden()
            ->assertJsonPath('message', 'Hanya inisiator yang dapat menghapus lampiran.');
        Storage::disk('public')->assertExists($this->attachment->path);
        $this->assertDatabaseHas('change_implementation_attachments', ['id' => $this->attachment->id]);
    }

    public function test_delete_attachment_requires_authentication(): void
    {
        $this->deleteJson($this->url())->assertUnauthorized();
        Storage::disk('public')->assertExists($this->attachment->path);
    }

    public function test_delete_attachment_of_another_package_is_404(): void
    {
        $otherPackage = ChangeInitiation::factory()->create([
            'field_id' => $this->fieldA->id,
            'initiator_id' => $this->initiator->id,
        ]);

        $otherImplementation = ChangeImplementation::create([
            'change_initiation_id' => $otherPackage->id,
        ]);

        $otherAttachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $otherImplementation->id,
            'path' => 'change-attachments/other.png',
            'sort_order' => 1,
        ]);

        Sanctum::actingAs($this->initiator);

        $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/'.$otherAttachment->id)
            ->assertNotFound();
        $this->assertDatabaseHas('change_implementation_attachments', ['id' => $otherAttachment->id]);
    }

    /** ship#18: nonexistent attachment id → 404 (never 500). */
    public function test_delete_nonexistent_attachment_is_404(): void
    {
        Sanctum::actingAs($this->initiator);

        $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/999999')
            ->assertNotFound();
    }

    /** ship#18: deleting twice → the second call is 404, not 500 (the row is
     * gone, so the guard's not-found branch must handle it gracefully). */
    public function test_second_delete_after_success_is_404_not_500(): void
    {
        Storage::disk('local')->put($this->attachment->path, 'private copy');
        Sanctum::actingAs($this->initiator);

        $this->deleteJson($this->url())->assertNoContent();
        $this->deleteJson($this->url())->assertNotFound();
    }

    public function test_delete_then_upload_within_cap_succeeds(): void
    {
        $implementation = $this->package->implementation;
        $paths = [];
        for ($i = 2; $i <= 10; $i++) {
            $paths[] = "change-attachments/filler-{$i}.png";
            ChangeImplementationAttachment::create([
                'change_implementation_id' => $implementation->id,
                'path' => "change-attachments/filler-{$i}.png",
                'sort_order' => $i,
            ]);
        }
        $this->assertSame(10, $implementation->attachments()->count());

        Sanctum::actingAs($this->initiator);

        $this->deleteJson($this->url())->assertNoContent();

        // The cap is on the implementation's TOTAL, so freeing one slot must
        // admit exactly one new file (regression: a stale count would leak).
        $this->postJson('/api/changes/'.$this->package->id.'/attachments', [
            'files' => [UploadedFile::fake()->image('replacement.png')],
        ])->assertOk();

        $this->assertSame(10, $implementation->fresh()->attachments()->count());
    }

    /**
     * ship#17: the delete path DESTROYS bytes, so the DB-stored path is
     * treated as untrusted with a stricter rule than reads — contained AND
     * scoped to change-attachments/. A tampered row pointing at a shared
     * signature file (or escaping via ../) must not be deletable; the row
     * itself is still removed and the file survives for an operator.
     */
    public function test_delete_ignores_row_path_outside_change_attachments(): void
    {
        Storage::disk('local')->put('signatures/shared.png', 'signature-bytes');

        $attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $this->package->implementation->id,
            'path' => 'signatures/shared.png',
            'sort_order' => 2,
        ]);

        // ship#18: the tamper rejection must be LOUD — a path outside
        // change-attachments/ on a row being deleted is the fingerprint of
        // tampering, not a routine delete, and the row (the evidence of the
        // attempt) disappears with the request.
        Log::spy();

        Sanctum::actingAs($this->initiator);

        $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/'.$attachment->id)
            ->assertNoContent();

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message) => str_contains($message, 'tampered'));

        Storage::disk('local')->assertExists('signatures/shared.png');
        Storage::disk('public')->assertExists($this->attachment->path);
        $this->assertDatabaseMissing('change_implementation_attachments', ['id' => $attachment->id]);
    }

    /**
     * ship#19: the tamper log embeds the untrusted DB path. A path carrying
     * control characters must NOT be able to forge surrounding log lines
     * (CWE-117 — Monolog's inline formatter re-expands \n in context), so the
     * logged value is one-line-encoded via addcslashes.
     */
    public function test_delete_tampered_path_log_is_one_line_encoded(): void
    {
        $attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $this->package->implementation->id,
            'path' => "signatures/evil.png\n2026-11-24 security.ALERT: forged line",
            'sort_order' => 2,
        ]);

        Log::spy();

        Sanctum::actingAs($this->initiator);

        $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/'.$attachment->id)
            ->assertNoContent();

        $logged = null;
        Log::shouldHaveReceived('warning')
            ->withArgs(function (string $message, array $context = []) use (&$logged) {
                if (str_contains($message, 'tampered')) {
                    $logged = $context['path'] ?? null;

                    return true;
                }

                return false;
            });

        // The raw newline never reaches the log: encoded, not expanded.
        $this->assertNotNull($logged);
        $this->assertStringNotContainsString("\n", $logged);
        $this->assertStringContainsString('\\n', $logged);
    }

    public function test_delete_ignores_traversal_row_path(): void
    {
        Storage::disk('local')->put('outside.txt', 'must survive');

        $attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $this->package->implementation->id,
            'path' => 'change-attachments/../outside.txt',
            'sort_order' => 2,
        ]);

        Sanctum::actingAs($this->initiator);

        $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/'.$attachment->id)
            ->assertNoContent();

        Storage::disk('local')->assertExists('outside.txt');
        $this->assertDatabaseMissing('change_implementation_attachments', ['id' => $attachment->id]);
    }

    /**
     * ship#18: both disks are non-throwing, so a failed unlink is silent. The
     * row was already deleted, which means nobody can ever authorize or
     * attribute those bytes again — the operator must see a warning instead
     * of a bare 204.
     *
     * Skips as root: a root process ignores directory permissions, so the
     * unlink cannot be made to fail (CI runs unprivileged).
     */
    public function test_delete_warns_when_private_bytes_cannot_be_unlinked(): void
    {
        if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
            $this->markTestSkipped('Root ignores directory permissions; unlink cannot fail.');
        }

        // The fake `local` disk root (framework/testing/disks/local) is SHARED
        // by the whole suite, so it must never be touched here. Swap the disk
        // config to a PRIVATE root for this test: the root itself is
        // user-owned (cleanup works), while the change-attachments DIR inside
        // it is root-owned read-only → a non-root unlink inside it fails
        // (unlink is a directory write).
        $root = storage_path('framework/testing/init-unremovable-'.uniqid());
        mkdir($root, 0755, true);
        $originalRoot = config('filesystems.disks.local.root');
        config(['filesystems.disks.local.root' => $root]);
        Storage::forgetDisk('local');

        $path = 'change-attachments/init-owned.png';
        Storage::disk('local')->put($path, 'private copy');
        $dir = Storage::disk('local')->path('change-attachments');
        $lock = 'sudo -n chown root:root '.escapeshellarg($dir).' && sudo -n chmod 555 '.escapeshellarg($dir);
        exec($lock, $out, $code);
        if ($code !== 0) {
            exec('rm -rf '.escapeshellarg($root));
            $this->markTestSkipped('Cannot chown to root (no sudo); stranded-bytes path untestable.');
        }

        $attachment = ChangeImplementationAttachment::create([
            'change_implementation_id' => $this->package->implementation->id,
            'path' => $path,
            'sort_order' => 3,
        ]);

        Log::spy();
        Sanctum::actingAs($this->initiator);

        try {
            $this->deleteJson('/api/changes/'.$this->package->id.'/attachments/'.$attachment->id)
                ->assertNoContent();

            Log::shouldHaveReceived('warning')
                ->withArgs(fn (string $message) => str_contains($message, 'unremovable_file'));
        } finally {
            // The dir inside the sandbox is root-owned read-only (that is the
            // point), so a plain rm cannot remove it — hand it back first.
            exec('sudo -n chown -R '.get_current_user().' '.escapeshellarg($root).' 2>/dev/null');
            exec('chmod -R u+w '.escapeshellarg($root).' 2>/dev/null');
            exec('rm -rf '.escapeshellarg($root));
            // Restore the suite-wide fake disk for subsequent tests.
            config(['filesystems.disks.local.root' => $originalRoot]);
            Storage::forgetDisk('local');
            Storage::fake('local');
        }
    }
}
