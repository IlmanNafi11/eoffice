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
}
