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

    public function test_resolve_returns_absolute_storage_path_for_relative(): void
    {
        $this->assertSame(public_path('storage/signatures/a.png'), SignaturePath::resolve('signatures/a.png'));
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
        file_put_contents(public_path('storage/'.$relative), 'x');

        try {
            $this->assertTrue(SignaturePath::exists($relative));
        } finally {
            unlink(public_path('storage/'.$relative));
        }
    }
}
