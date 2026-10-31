<?php

namespace Tests;

use App\Models\User;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Storage;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;

    protected function setUp(): void
    {
        parent::setUp();

        /*
         * Evidence disks are faked for the whole suite. Without this, every
         * upload/signature test leaks bytes into the real storage/app (hundreds
         * of junk files per run), polluting operator data and making
         * `media:migrate-private --dry-run` report residue that is only test
         * debris. A test that fakes a disk again stays green: re-faking is a
         * no-op fresh config anyway.
         */
        Storage::fake('local');
        Storage::fake('public');
    }

    /**
     * Give a user a real signature file on the private disk so PDF export can
     * resolve it (signature_path may otherwise be null in tests).
     */
    protected function setUserSignature(User $user): User
    {
        $path = "signatures/{$user->id}-".uniqid().'.png';

        // Writing through the disk (not file_put_contents on a hardcoded
        // storage_path) keeps this correct whether a test fakes the `local`
        // disk or not — and never leaks bytes into a real deployment's
        // storage/app during a suite run.
        Storage::disk('local')->put($path, 'dummy-signature');

        $user->update(['signature_path' => $path]);

        return $user->fresh();
    }
}
