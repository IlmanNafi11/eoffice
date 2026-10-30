<?php

namespace Tests\Unit\Support\Signature;

use App\Support\Signature\SignaturePath;
use Tests\TestCase;

class SignaturePathTest extends TestCase
{
    public function test_resolve_returns_empty_string_for_null(): void
    {
        $this->assertSame('', SignaturePath::resolve(null));
    }

    public function test_resolve_returns_absolute_private_storage_path(): void
    {
        $this->assertSame(storage_path('app/signatures/a.png'), SignaturePath::resolve('signatures/a.png'));
    }

    public function test_resolve_never_points_at_the_public_disk(): void
    {
        $resolved = SignaturePath::resolve('signatures/1.png');

        $this->assertStringNotContainsString('public', $resolved);
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
        @mkdir(storage_path('app/signatures'), 0755, true);
        file_put_contents(storage_path('app/'.$relative), 'x');

        try {
            $this->assertTrue(SignaturePath::exists($relative));
        } finally {
            unlink(storage_path('app/'.$relative));
        }
    }
}
