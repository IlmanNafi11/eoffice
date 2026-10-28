<?php

namespace Tests\Unit;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Services\DocNumberGenerator;
use App\Models\Field;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DocNumberGeneratorTest extends TestCase
{
    use RefreshDatabase;

    private DocNumberGenerator $generator;

    private User $user;

    private Field $field;

    protected function setUp(): void
    {
        parent::setUp();
        $this->generator = app(DocNumberGenerator::class);
        $this->user = User::factory()->create();
        $this->field = Field::factory()->create();
    }

    public function test_generates_first_sequence_for_year(): void
    {
        $docNumber = $this->generator->generate();

        $this->assertStringContainsString(date('Y'), $docNumber);
        $this->assertStringContainsString('001', $docNumber);
    }

    public function test_increments_sequence_with_existing_initiations(): void
    {
        ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->user->id,
            'doc_number' => '001/9/1.1/114/'.date('Y'),
        ]);
        ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->user->id,
            'doc_number' => '002/9/1.1/114/'.date('Y'),
        ]);

        $docNumber = $this->generator->generate();

        $this->assertStringContainsString('003', $docNumber);
    }

    public function test_resets_sequence_per_year(): void
    {
        // Create initiation from last year
        ChangeInitiation::factory()->create([
            'field_id' => $this->field->id,
            'initiator_id' => $this->user->id,
            'created_at' => now()->subYear(),
        ]);

        $docNumber = $this->generator->generate();

        $this->assertStringContainsString('001', $docNumber);
    }

    public function test_format_follows_expected_pattern(): void
    {
        $docNumber = $this->generator->generate();

        $this->assertMatchesRegularExpression(
            '/^\d{3}\/9\/1\.1\/114\/\d{4}$/',
            $docNumber
        );
    }

    public function test_uses_custom_prefix_from_env(): void
    {
        $_ENV['CHANGE_DOC_PREFIX'] = 'X/9.9/999';
        $_SERVER['CHANGE_DOC_PREFIX'] = 'X/9.9/999';

        try {
            $docNumber = $this->generator->generate();

            $this->assertMatchesRegularExpression(
                '/^\d{3}\/X\/9\.9\/999\/\d{4}$/',
                $docNumber
            );
        } finally {
            unset($_ENV['CHANGE_DOC_PREFIX'], $_SERVER['CHANGE_DOC_PREFIX']);
        }
    }

    public function test_falls_back_to_default_prefix_when_env_unset(): void
    {
        unset($_ENV['CHANGE_DOC_PREFIX'], $_SERVER['CHANGE_DOC_PREFIX']);

        $docNumber = $this->generator->generate();

        $this->assertMatchesRegularExpression(
            '/^\d{3}\/9\/1\.1\/114\/\d{4}$/',
            $docNumber
        );
    }
}
