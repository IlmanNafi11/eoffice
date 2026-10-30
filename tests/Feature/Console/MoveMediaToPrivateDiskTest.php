<?php

namespace Tests\Feature\Console;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The evidence cutover command must (a) be safe to re-run, and (b) leave
 * nothing reachable at /storage/<tree>/.... All three evidence types are
 * asserted, because forgetting one is exactly how the exposure happened.
 */
class MoveMediaToPrivateDiskTest extends TestCase
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
        Storage::disk('public')->put('attendances/7/2026-10-30/pagi.png', 'photo');
        Storage::disk('public')->put('change-attachments/evidence.png', 'evidence');

        $this->artisan('media:migrate-private', ['--dry-run' => true])
            ->assertSuccessful();

        Storage::disk('public')->assertExists('signatures/1.png');
        Storage::disk('public')->assertExists('attendances/7/2026-10-30/pagi.png');
        Storage::disk('public')->assertExists('change-attachments/evidence.png');

        Storage::disk('local')->assertMissing('signatures/1.png');
        Storage::disk('local')->assertMissing('attendances/7/2026-10-30/pagi.png');
        Storage::disk('local')->assertMissing('change-attachments/evidence.png');
    }

    public function test_it_moves_every_evidence_type_to_private_and_prunes_public(): void
    {
        Storage::disk('public')->put('signatures/1.png', 'sig-a');
        Storage::disk('public')->put('attendances/7/2026-10-30/pagi.png', 'photo');
        Storage::disk('public')->put('change-attachments/evidence.png', 'evidence');

        $this->artisan('media:migrate-private')->assertSuccessful();

        // Content survives the move.
        $this->assertSame('sig-a', Storage::disk('local')->get('signatures/1.png'));
        $this->assertSame('photo', Storage::disk('local')->get('attendances/7/2026-10-30/pagi.png'));
        $this->assertSame('evidence', Storage::disk('local')->get('change-attachments/evidence.png'));

        // Nothing is left web-served.
        Storage::disk('public')->assertMissing('signatures/1.png');
        Storage::disk('public')->assertMissing('attendances/7/2026-10-30/pagi.png');
        Storage::disk('public')->assertMissing('change-attachments/evidence.png');
    }

    public function test_it_is_idempotent_and_does_not_overwrite_private_copies(): void
    {
        Storage::disk('local')->put('change-attachments/evidence.png', 'newer-private');

        // A stale public copy of the same path must not clobber the private one.
        Storage::disk('public')->put('change-attachments/evidence.png', 'stale-public');

        $this->artisan('media:migrate-private')->assertSuccessful();

        $this->assertSame('newer-private', Storage::disk('local')->get('change-attachments/evidence.png'));
        Storage::disk('public')->assertMissing('change-attachments/evidence.png');

        // Second run is a no-op.
        $this->artisan('media:migrate-private')->assertSuccessful();
        $this->assertSame('newer-private', Storage::disk('local')->get('change-attachments/evidence.png'));
    }

    public function test_it_succeeds_with_nothing_to_migrate(): void
    {
        $this->artisan('media:migrate-private')->assertSuccessful();
    }
}
