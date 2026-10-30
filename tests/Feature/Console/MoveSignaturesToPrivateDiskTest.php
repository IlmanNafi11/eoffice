<?php

namespace Tests\Feature\Console;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The cutover command must be safe to re-run and must leave no signature
 * reachable at /storage/signatures/*.png.
 */
class MoveSignaturesToPrivateDiskTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Storage::fake('local');
    }

    public function test_dry_run_moves_nothing(): void
    {
        Storage::disk('public')->put('signatures/1.png', 'sig-a');

        $this->artisan('signatures:migrate-private', ['--dry-run' => true])
            ->assertSuccessful();

        Storage::disk('public')->assertExists('signatures/1.png');
        Storage::disk('local')->assertMissing('signatures/1.png');
    }

    public function test_it_copies_to_private_and_deletes_public(): void
    {
        Storage::disk('public')->put('signatures/1.png', 'sig-a');
        Storage::disk('public')->put('signatures/2.png', 'sig-b');

        $this->artisan('signatures:migrate-private')->assertSuccessful();

        Storage::disk('local')->assertExists('signatures/1.png');
        Storage::disk('local')->assertExists('signatures/2.png');
        Storage::disk('public')->assertMissing('signatures/1.png');
        Storage::disk('public')->assertMissing('signatures/2.png');
    }

    public function test_it_is_idempotent(): void
    {
        Storage::disk('public')->put('signatures/1.png', 'sig-a');

        $this->artisan('signatures:migrate-private')->assertSuccessful();
        $this->artisan('signatures:migrate-private')->assertSuccessful();

        $this->assertSame('sig-a', Storage::disk('local')->get('signatures/1.png'));
    }

    /** A file already on the private disk wins; the public copy is just pruned. */
    public function test_existing_private_file_is_not_overwritten(): void
    {
        Storage::disk('local')->put('signatures/1.png', 'newer');
        Storage::disk('public')->put('signatures/1.png', 'older');

        $this->artisan('signatures:migrate-private')->assertSuccessful();

        $this->assertSame('newer', Storage::disk('local')->get('signatures/1.png'));
        Storage::disk('public')->assertMissing('signatures/1.png');
    }

    public function test_missing_directory_is_a_no_op(): void
    {
        $this->artisan('signatures:migrate-private')->assertSuccessful();
    }
}
