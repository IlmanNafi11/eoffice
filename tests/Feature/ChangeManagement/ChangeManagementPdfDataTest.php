<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeType;
use App\Domains\ChangeManagement\Repositories\ChangeManagementRepositoryInterface;
use App\Domains\ChangeManagement\Services\ChangePackagePdfData;
use App\Models\Field;
use App\Models\Team;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\View;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChangeManagementPdfDataTest extends TestCase
{
    use RefreshDatabase;

    private Field $field;

    private Team $team;

    private User $staf;

    private User $kepalaTim;

    private User $admin;

    private ChangeType $typeA;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('db:seed', ['--class' => 'RolePermissionSeeder']);
        Cache::flush();

        $this->field = Field::factory()->create();
        $this->team = Team::factory()->create(['field_id' => $this->field->id]);

        $this->staf = User::factory()->create(['team_id' => $this->team->id]);
        $this->staf->assignRole('staf');
        $this->kepalaTim = User::factory()->create(['team_id' => $this->team->id]);
        $this->kepalaTim->assignRole('kepala_tim');
        $this->admin = User::factory()->create(['team_id' => $this->team->id]);
        $this->admin->assignRole('admin');

        $this->typeA = ChangeType::create(['name' => 'Aplikasi']);
    }

    public function test_initiation_builder_returns_the_exact_view_data_keys(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        $package = app(ChangeManagementRepositoryInterface::class)->findPackage(
            $this->createApprovedPackage()
        );

        $data = app(ChangePackagePdfData::class)->forInitiation($package);

        $this->assertEqualsCanonicalizing($this->initiationKeys(), array_keys($data));
        $this->assertSame($package->doc_number, $data['docNumber']);
        $this->assertStringStartsWith('data:image/png;base64,', $data['initiatorSig']);
        $this->assertStringStartsWith('data:image/png;base64,', $data['reviewerSig']);
        $this->assertStringContainsString('<svg', $data['qrSvg']);
    }

    public function test_implementation_builder_returns_the_exact_view_data_keys(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        $package = app(ChangeManagementRepositoryInterface::class)->findPackage(
            $this->createApprovedPackage()
        );

        $data = app(ChangePackagePdfData::class)->forImplementation($package);

        $this->assertEqualsCanonicalizing($this->implementationKeys(), array_keys($data));
        $this->assertSame($package->implementation->impact, $data['impact']);
        $this->assertSame('Tidak', $data['costNeeded']);
        $this->assertSame('-', $data['costAmount']);
        $this->assertSame('', $data['evaluatorSig']);
        $this->assertStringStartsWith('data:image/png;base64,', $data['reviewerSig']);
        $this->assertStringStartsWith('data:image/png;base64,', $data['responsibleSig']);
        $this->assertIsArray($data['attachmentImages']);
    }

    public function test_initiation_pdf_view_data_has_exact_keys(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        $initId = $this->createApprovedPackage();

        Sanctum::actingAs($this->admin);

        $captured = $this->captureViewData('pdf.change-initiation', "/api/changes/{$initId}/pdf/initiation");

        $this->assertEqualsCanonicalizing($this->initiationKeys(), array_keys($captured));
    }

    public function test_implementation_pdf_view_data_has_exact_keys(): void
    {
        $this->setUserSignature($this->staf);
        $this->setUserSignature($this->kepalaTim);

        $initId = $this->createApprovedPackage();

        Sanctum::actingAs($this->admin);

        $captured = $this->captureViewData('pdf.change-implementation', "/api/changes/{$initId}/pdf/implementation");

        $this->assertEqualsCanonicalizing($this->implementationKeys(), array_keys($captured));
    }

    /**
     * @return array<int, string>
     */
    private function initiationKeys(): array
    {
        return [
            'docNumber',
            'tanggal',
            'bidang',
            'neededByDate',
            'description',
            'reason',
            'initiatorName',
            'initiatorNip',
            'initiatorPosition',
            'initiatorSig',
            'reviewerName',
            'reviewerNip',
            'reviewerPosition',
            'reviewerSig',
            'qrSvg',
        ];
    }

    /**
     * @return array<int, string>
     */
    private function implementationKeys(): array
    {
        return [
            'docNumber',
            'tanggal',
            'bidang',
            'description',
            'priority',
            'impact',
            'productionImpact',
            'requiredEffort',
            'costNeeded',
            'costAmount',
            'resources',
            'testPlan',
            'changeTypes',
            'reviewStatus',
            'reviewResponse',
            'executionDate',
            'responsibleTeamName',
            'implementationResult',
            'attachmentImages',
            'releaseDate',
            'evaluatorName',
            'evaluatorNip',
            'evaluatorPosition',
            'evaluatorSig',
            'reviewerName',
            'reviewerNip',
            'reviewerPosition',
            'reviewerSig',
            'responsibleName',
            'responsibleNip',
            'responsiblePosition',
            'responsibleSig',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function captureViewData(string $view, string $uri): array
    {
        /** @var array<string, mixed> $captured */
        $captured = [];
        View::composer($view, function ($view) use (&$captured) {
            $captured = $view->getData();
        });

        $this->getJson($uri)->assertStatus(200);

        return $captured;
    }

    private function createApprovedPackage(): int
    {
        Sanctum::actingAs($this->staf);
        $created = $this->postJson('/api/changes', [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
                'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'emergency',
                'impact' => 'Mayor',
                'change_type_ids' => [$this->typeA->id],
                'test_plan' => 'Test plan',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15',
                'implementation_result' => 'Done',
            ],
        ])->json('data.initiation');

        $initId = $created['id'];

        $this->postJson("/api/changes/{$initId}/submit", [
            'initiation' => [
                'field_id' => $this->field->id,
                'description' => 'Test description',
                'reason' => 'Test reason',
                'needed_by_date' => '2026-08-01',
            ],
            'implementation' => [
                'priority' => 'emergency',
                'impact' => 'Mayor',
                'change_type_ids' => [$this->typeA->id],
                'test_plan' => 'Test plan',
                'execution_date' => '2026-08-10',
                'release_date' => '2026-08-15',
                'implementation_result' => 'Done',
                'review_response' => 'Catatan staf',
            ],
        ]);

        Sanctum::actingAs($this->kepalaTim);
        $this->postJson("/api/changes/{$initId}/approve")->assertStatus(200);

        return $initId;
    }
}
