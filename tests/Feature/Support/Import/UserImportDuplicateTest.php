<?php

namespace Tests\Feature\Support\Import;

use App\Models\User;
use App\Support\Import\UserImport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Maatwebsite\Excel\Facades\Excel;
use Tests\TestCase;

/**
 * Ship review C2: a spreadsheet repeating a NIP or email in a later row used to
 * reach the unique index, throw, and fail the whole import with a 500 — yet the
 * same file also partly imported, so it was neither atomic nor reported cleanly.
 *
 * Duplicates must be skipped per row and reported, never fatal.
 */
class UserImportDuplicateTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Drive the importer the way Excel does: model() per row, then collect the
     * models it returns. Persisting is Maatwebsite's job, so the duplicate
     * contract is asserted on what the importer hands back.
     */
    private function import(array $rows): array
    {
        $import = new UserImport;
        $models = [];

        foreach ($rows as $row) {
            if ($model = $import->model($row)) {
                $models[] = $model;
            }
        }

        return [
            'imported' => $import->results['imported'],
            'skipped' => $import->results['skipped'],
            'errors' => $import->results['errors'],
            'models' => $models,
        ];
    }

    public function test_repeated_nip_within_one_file_is_skipped_not_fatal(): void
    {
        $results = $this->import([
            ['nama' => 'Satu', 'nip' => '111', 'email' => 'satu@example.test'],
            ['nama' => 'Dua', 'nip' => '111', 'email' => 'dua@example.test'],
        ]);

        $this->assertSame(1, $results['imported']);
        $this->assertSame(1, $results['skipped']);

        // Exactly one User model survives: the duplicate row yields null rather
        // than a second insert that would hit the unique index.
        $this->assertCount(1, $results['models']);
        $this->assertSame('111', $results['models'][0]->nip);
        // Row numbers are 1-based and count the spreadsheet header, so assert on
        // the reported identity rather than a hard-coded index.
        $this->assertStringContainsString('NIP 111 sudah terdaftar', $results['errors'][0]);
        $this->assertStringContainsString('Baris', $results['errors'][0]);
    }

    public function test_repeated_email_within_one_file_is_skipped(): void
    {
        $results = $this->import([
            ['nama' => 'Satu', 'nip' => '111', 'email' => 'sama@example.test'],
            ['nama' => 'Dua', 'nip' => '222', 'email' => 'sama@example.test'],
        ]);

        $this->assertSame(1, $results['imported']);
        $this->assertSame(1, $results['skipped']);
        $this->assertCount(1, $results['models']);
        $this->assertSame('sama@example.test', $results['models'][0]->email);
    }

    public function test_email_matching_an_earlier_rows_nip_is_skipped(): void
    {
        // NIPs and emails share one namespace, so a cross-column collision must
        // also be caught rather than reaching the database.
        $results = $this->import([
            ['nama' => 'Satu', 'nip' => 'kode-x', 'email' => 'satu@example.test'],
            ['nama' => 'Dua', 'nip' => '999', 'email' => 'kode-x'],
        ]);

        $this->assertSame(1, $results['imported']);
        $this->assertSame(1, $results['skipped']);
    }

    public function test_nip_already_in_database_is_skipped(): void
    {
        User::factory()->create(['nip' => 'already', 'email' => 'existing@example.test']);

        $results = $this->import([
            ['nama' => 'Baru', 'nip' => 'already', 'email' => 'baru@example.test'],
        ]);

        $this->assertSame(0, $results['imported']);
        $this->assertSame(1, $results['skipped']);
    }

    public function test_duplicates_do_not_abort_the_rest_of_the_file(): void
    {
        $results = $this->import([
            ['nama' => 'Satu', 'nip' => '1', 'email' => 'a@example.test'],
            ['nama' => 'Duplikat', 'nip' => '1', 'email' => 'b@example.test'],
            ['nama' => 'Tiga', 'nip' => '3', 'email' => 'c@example.test'],
        ]);

        // The point of C2: a bad row must not cost the caller the good rows
        // around it.
        $this->assertSame(2, $results['imported']);
        $this->assertSame(1, $results['skipped']);
    }

    public function test_empty_identity_rows_are_reported_not_fatal(): void
    {
        $results = $this->import([
            ['nama' => '', 'nip' => '', 'email' => ''],
            ['nama' => 'Valid', 'nip' => '7', 'email' => 'valid@example.test'],
        ]);

        $this->assertSame(1, $results['imported']);
        $this->assertSame(1, $results['skipped']);
    }
}
