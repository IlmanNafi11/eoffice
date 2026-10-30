<?php

namespace Tests\Feature\ChangeManagement;

use App\Domains\ChangeManagement\Models\ChangeInitiation;
use App\Domains\ChangeManagement\Services\DocNumberGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The document-number prefix used to be hard-coded in the generator, so every
 * deployment produced the same 9/1.1/114 body. It now reads
 * config('change-mgmt.doc_prefix'), which is env-driven — but a config layer
 * only helps if something asserts it is actually consulted.
 */
class DocNumberGeneratorTest extends TestCase
{
    use RefreshDatabase;

    private DocNumberGenerator $generator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->generator = new DocNumberGenerator;
    }

    public function test_it_reads_the_prefix_from_config_not_a_literal(): void
    {
        config(['change-mgmt.doc_prefix' => '7/2.2/999']);

        $this->assertSame('001/7/2.2/999/'.now()->year, $this->generator->generate());
    }

    public function test_it_falls_back_to_the_default_when_config_is_absent(): void
    {
        config(['change-mgmt.doc_prefix' => null]);

        $this->assertSame('001/9/1.1/114/'.now()->year, $this->generator->generate());
    }

    public function test_sequence_increments_and_is_zero_padded_to_three(): void
    {
        config(['change-mgmt.doc_prefix' => '7/2.2/999']);
        $year = now()->year;

        $this->assertSame('001/7/2.2/999/'.$year, $this->generator->generate());
        $this->persist('001/7/2.2/999/'.$year);
        $this->assertSame('002/7/2.2/999/'.$year, $this->generator->generate());
        $this->persist('002/7/2.2/999/'.$year);
        $this->assertSame('003/7/2.2/999/'.$year, $this->generator->generate());
    }

    public function test_soft_deleted_rows_still_reserve_their_sequence(): void
    {
        // withTrashed(): a deleted package must not hand its number to the next
        // document, which would make two documents share an identifier.
        config(['change-mgmt.doc_prefix' => '7/2.2/999']);
        $year = now()->year;

        $deleted = $this->persist('004/7/2.2/999/'.$year);
        $deleted->delete();

        $this->assertSame('005/7/2.2/999/'.$year, $this->generator->generate());
    }

    public function test_documents_from_a_previous_year_do_not_advance_this_year_sequence(): void
    {
        config(['change-mgmt.doc_prefix' => '7/2.2/999']);

        // The generator scopes by created_at, so the row must actually be dated
        // last year — not merely carry a last-year doc number.
        $this->persist('042/7/2.2/999/'.(now()->year - 1), now()->subYear());

        $this->assertSame('001/7/2.2/999/'.now()->year, $this->generator->generate());
    }

    public function test_unparseable_last_number_does_not_break_generation(): void
    {
        config(['change-mgmt.doc_prefix' => '7/2.2/999']);
        $year = now()->year;

        // A legacy row whose number does not start with NNN/ must not poison the
        // sequence: it yields 001 rather than throwing.
        $this->persist('legacy-number/'.$year);

        $this->assertSame('001/7/2.2/999/'.$year, $this->generator->generate());
    }

    private function persist(string $docNumber, $createdAt = null): ChangeInitiation
    {
        return ChangeInitiation::factory()->create(array_filter([
            'doc_number' => $docNumber,
            'created_at' => $createdAt,
        ]));
    }
}
