<?php

namespace Tests\Unit\Support;

use App\Support\Media\PrivateMediaPath;
use App\Support\Signature\SignaturePath;
use PHPUnit\Framework\TestCase;

/**
 * Ship review #3 (Medium): stored relative paths reaching Storage::path() were
 * trusted as-is. A tampered DB row containing `../` must not escape
 * storage/app — every resolver in both helpers now returns '' for a
 * non-contained path (the existing "no file" signal), and the legacy
 * public-disk fallback in resolveAny() cannot be reached with one either.
 */
class EvidencePathContainmentTest extends TestCase
{
    public function test_parent_traversal_is_rejected(): void
    {
        $this->assertFalse(SignaturePath::contained('signatures/../../.env'));
        $this->assertFalse(SignaturePath::contained('../../etc/passwd'));
        $this->assertSame('', SignaturePath::resolve('signatures/../../.env'));
        $this->assertSame('', PrivateMediaPath::resolve('change-attachments/../../.env'));
        $this->assertSame('', PrivateMediaPath::resolveAny('../../etc/passwd'));
        $this->assertFalse(SignaturePath::exists('../../etc/passwd'));
        $this->assertFalse(PrivateMediaPath::existsAny('../../etc/passwd'));
    }

    public function test_absolute_prefix_and_backslashes_are_rejected(): void
    {
        $this->assertFalse(SignaturePath::contained('/etc/passwd'));
        $this->assertFalse(SignaturePath::contained('signatures\\..\\..\\secrets'));
        $this->assertSame('', SignaturePath::resolve('/etc/passwd'));
        $this->assertSame('', PrivateMediaPath::resolve('a\\b\\..\\..\\.env'));
    }

    public function test_legitimate_relative_paths_are_contained(): void
    {
        $this->assertTrue(SignaturePath::contained('signatures/user-1.png'));
        $this->assertTrue(SignaturePath::contained('change-attachments/9-1-1-114/file.pdf'));
        $this->assertTrue(SignaturePath::contained(null) === false);
    }

    public function test_missing_paths_still_resolve_to_empty(): void
    {
        $this->assertSame('', SignaturePath::resolve(null));
        $this->assertSame('', SignaturePath::resolve(''));
        $this->assertSame('', PrivateMediaPath::resolve(null));
        $this->assertSame('', PrivateMediaPath::resolveAny(''));
    }

    /**
     * Ship review #4 (security Medium): URL-encoded separators/traversal and
     * null bytes must be rejected even though no current caller forwards a
     * request string — the guard is the boundary for the next one that does.
     */
    public function test_url_encoded_and_null_byte_payloads_are_rejected(): void
    {
        $this->assertFalse(SignaturePath::contained('%2e%2e%2f.env'));
        $this->assertFalse(SignaturePath::contained('signatures/%2f..%2f.env'));
        $this->assertFalse(SignaturePath::contained('sig%5ctest.png'));
        $this->assertFalse(SignaturePath::contained('signatures/x%00.php'));
        $this->assertSame('', SignaturePath::resolve('%2e%2e%2f.env'));
        $this->assertSame('', PrivateMediaPath::resolveAny('%2e%2e/.env'));
    }
}
