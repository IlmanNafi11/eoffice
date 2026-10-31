<?php

namespace Tests\Unit\Support\Signature;

use App\Support\Signature\SignaturePath;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SignaturePathTest extends TestCase
{
    public function test_resolve_returns_empty_string_for_null(): void
    {
        $this->assertSame('', SignaturePath::resolve(null));
    }

    public function test_resolve_returns_the_private_disk_root(): void
    {
        // Resolved through the `local` disk (faked in tests), never a
        // hardcoded storage_path, so a config change cannot drift silently.
        $expected = Storage::disk('local')->path('signatures/a.png');

        $this->assertSame($expected, SignaturePath::resolve('signatures/a.png'));
        $this->assertStringNotContainsString('public', $expected);
    }

    public function test_exists_returns_false_for_null(): void
    {
        $this->assertFalse(SignaturePath::exists(null));
    }

    public function test_exists_returns_false_for_missing_file(): void
    {
        $this->assertFalse(SignaturePath::exists('signatures/does-not-exist.png'));
    }

    public function test_exists_returns_true_for_present_file(): void
    {
        $relative = 'signatures/'.uniqid('probe-', true).'.png';
        Storage::disk('local')->put($relative, 'x');

        $this->assertTrue(SignaturePath::exists($relative));
    }
}
