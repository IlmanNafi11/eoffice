<?php

namespace Tests\Unit;

use App\Support\Signature\ImageSignatureService;
use App\Support\Signature\SignatureServiceInterface;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImageSignatureServiceTest extends TestCase
{
    private SignatureServiceInterface $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(ImageSignatureService::class);
        Storage::fake('local');
    }

    public function test_normalizes_and_stores_png_signature(): void
    {
        $file = UploadedFile::fake()->image('signature.png', 400, 150);

        $path = $this->service->normalize($file->getRealPath(), 1);

        $this->assertStringEndsWith('.png', $path);
        $this->assertStringContainsString('signatures/1.png', $path);

        Storage::disk('local')->assertExists($path);
    }

    public function test_normalization_resizes_large_image(): void
    {
        $file = UploadedFile::fake()->image('large-sig.png', 1200, 800);

        $path = $this->service->normalize($file->getRealPath(), 2);

        Storage::disk('local')->assertExists($path);

        // Verify dimensions
        $storedPath = Storage::disk('local')->path($path);
        [$width, $height] = getimagesize($storedPath);

        $this->assertLessThanOrEqual(300, $width, 'Width should be <= 300px');
    }

    public function test_returns_correct_relative_path(): void
    {
        $file = UploadedFile::fake()->image('sig.png', 300, 100);

        $path = $this->service->normalize($file->getRealPath(), 42);

        $this->assertEquals('signatures/42.png', $path);
    }

    public function test_can_resolve_from_interface_binding(): void
    {
        $resolved = app(SignatureServiceInterface::class);

        $this->assertInstanceOf(ImageSignatureService::class, $resolved);
    }

    public function test_trim_retains_an_isolated_off_grid_ink_dot(): void
    {
        // (101,101) is deliberately off the 4-px sampling grid. The full
        // resolution scan crops to the dot, so the 1200x400 canvas shrinks to
        // roughly 11x11 before scale(); a coarse scan that finds no ink leaves
        // the canvas intact and yields a 300x100 image instead.
        $file = UploadedFile::fake()->image('off-grid.png', 1200, 400);
        $gd = imagecreatetruecolor(1200, 400);
        imagefill($gd, 0, 0, imagecolorallocate($gd, 255, 255, 255));
        imagesetpixel($gd, 101, 101, imagecolorallocate($gd, 0, 0, 0));
        imagepng($gd, $file->getRealPath());
        imagedestroy($gd);

        $path = $this->service->normalize($file->getRealPath(), 7);
        $saved = imagecreatefrompng(Storage::disk('local')->path($path));

        $this->assertLessThanOrEqual(150, imagesx($saved));
    }

    public function test_trim_handles_large_image_without_error(): void
    {
        $file = UploadedFile::fake()->image('big.png', 2000, 2000);

        $path = $this->service->normalize($file->getRealPath(), 8);

        $this->assertSame('signatures/8.png', $path);
        Storage::disk('local')->assertExists($path);
    }
}
