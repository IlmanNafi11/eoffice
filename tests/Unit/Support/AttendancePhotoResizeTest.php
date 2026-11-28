<?php

namespace Tests\Unit\Support;

use App\Support\Media\AttendancePhotoResize;
use App\Support\Pdf\PdfImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class AttendancePhotoResizeTest extends TestCase
{
    /**
     * The helper must re-encode in the source format; a forced JPEG would
     * swap a PNG's transparent pixels for black and change its extension.
     */
    #[DataProvider('sourceFormatProvider')]
    public function test_store_caps_longer_side_at_600px_and_preserves_source_format(
        string $extension,
        string $mime,
    ): void {
        $file = $this->largePhoto($extension);

        $path = AttendancePhotoResize::store(
            $file,
            'attendances/42/2026-11-28',
            "foto.{$extension}",
        );

        $this->assertSame("attendances/42/2026-11-28/foto.{$extension}", $path);
        $bytes = (string) Storage::disk('local')->get($path);
        $info = getimagesizefromstring($bytes);
        $this->assertIsArray($info);
        $this->assertSame($mime, $info['mime']);
        $this->assertLessThanOrEqual(600, max($info[0], $info[1]));
        $this->assertGreaterThan(1, $info[0]);
        $this->assertGreaterThan(1, $info[1]);
    }

    public static function sourceFormatProvider(): array
    {
        return [
            'jpeg' => ['jpg', 'image/jpeg'],
            'png' => ['png', 'image/png'],
            'webp' => ['webp', 'image/webp'],
        ];
    }

    /**
     * A forged header must be rejected before GD allocates the bitmap;
     * imagecreatefrompng on this 25M-pixel header would exhaust the worker.
     */
    public function test_store_rejects_forged_header_over_decode_budget_before_decoding(): void
    {
        $bytes = "\x89PNG\r\n\x1a\n"
            .pack('N', 13).'IHDR'
            .pack('N', 5000).pack('N', 5000)
            .chr(8).chr(2).chr(0).chr(0).chr(0)
            .pack('N', 0);
        $file = UploadedFile::fake()->createWithContent('foto.png', $bytes);

        try {
            AttendancePhotoResize::store($file, 'attendances', 'foto.png');
            $this->fail('Forged 5000x5000 header was accepted.');
        } catch (\InvalidArgumentException $exception) {
            $this->assertSame('Gambar terlalu besar untuk diproses.', $exception->getMessage());
        }

        $this->assertSame([], Storage::disk('local')->allFiles('attendances'));
    }

    /**
     * The guard must share PdfImage's decode budget, not a duplicate constant
     * that can drift: an upload of 4001x1000 pixels must be rejected through
     * the same accessor.
     */
    public function test_decode_budget_is_shared_with_pdf_image_and_enforced(): void
    {
        $limit = PdfImage::maxDecodedPixels();

        $width = 4001;
        $height = (int) ($limit / $width) + 1;
        $gd = imagecreatetruecolor($width, $height);
        ob_start();
        imagejpeg($gd, null, 50);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);
        $file = UploadedFile::fake()->createWithContent('foto.jpg', $bytes);

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Gambar terlalu besar untuk diproses.');

        AttendancePhotoResize::store($file, 'attendances', 'foto.jpg');
    }

    /**
     * A half-transparent PNG must keep its alpha channel through the scale
     * and re-encode; flattening it to opaque black destroys evidence.
     */
    public function test_store_preserves_png_alpha_channel(): void
    {
        $gd = imagecreatetruecolor(2400, 1800);
        imagesavealpha($gd, true);
        imagealphablending($gd, false);
        imagefill($gd, 0, 0, imagecolorallocatealpha($gd, 200, 50, 50, 127));
        ob_start();
        imagepng($gd);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);

        $file = UploadedFile::fake()->createWithContent('alpha.png', $bytes);
        $path = AttendancePhotoResize::store($file, 'attendances', 'alpha.png');

        $stored = imagecreatefrompng(Storage::disk('local')->path($path));
        $rgba = imagecolorsforindex($stored, imagecolorat($stored, 10, 10));
        $this->assertEqualsWithDelta(127, $rgba['alpha'], 2);
    }

    /**
     * Corrupt content is deliberately stored byte-for-byte: evidence must
     * never be silently discarded when GD cannot decode it.
     */
    public function test_store_keeps_corrupt_bytes_verbatim(): void
    {
        $file = UploadedFile::fake()->createWithContent('foto.jpg', 'not an image');

        $path = AttendancePhotoResize::store($file, 'attendances', 'foto.jpg');

        $this->assertSame('not an image', Storage::disk('local')->get($path));
    }

    /**
     * Photos already within the cap must keep their exact original bytes.
     */
    public function test_store_leaves_small_photo_bytes_unchanged(): void
    {
        $gd = imagecreatetruecolor(100, 80);
        imagefill($gd, 0, 0, imagecolorallocate($gd, 30, 90, 160));
        ob_start();
        imagejpeg($gd);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);

        $file = UploadedFile::fake()->createWithContent('small.jpg', $bytes);
        $path = AttendancePhotoResize::store($file, 'attendances', 'small.jpg');

        $this->assertSame($bytes, Storage::disk('local')->get($path));
    }

    /**
     * The decode budget is a boundary, not a magic literal: N pixels pass,
     * N+1 pixels are rejected, using the shared PdfImage accessor.
     */
    public function test_decode_budget_boundary_accepts_exact_limit_and_rejects_one_more(): void
    {
        $limit = PdfImage::maxDecodedPixels();
        $width = 4000;
        $acceptedHeight = intdiv($limit, $width);

        $gd = imagecreatetruecolor($width, $acceptedHeight);
        ob_start();
        imagejpeg($gd, null, 30);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);
        $file = UploadedFile::fake()->createWithContent('boundary.jpg', $bytes);
        $path = AttendancePhotoResize::store($file, 'attendances', 'boundary.jpg');
        $this->assertSame('attendances/boundary.jpg', $path);

        $gd = imagecreatetruecolor($width, $acceptedHeight + 1);
        ob_start();
        imagejpeg($gd, null, 30);
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);
        $file = UploadedFile::fake()->createWithContent('boundary.jpg', $bytes);

        $this->expectException(\InvalidArgumentException::class);
        AttendancePhotoResize::store($file, 'attendances', 'boundary.jpg');
    }

    private function largePhoto(string $extension): UploadedFile
    {
        $gd = imagecreatetruecolor(2400, 1800);
        imagefill($gd, 0, 0, imagecolorallocate($gd, 30, 90, 160));
        imagefilledrectangle($gd, 100, 100, 500, 400, imagecolorallocate($gd, 230, 40, 40));

        ob_start();
        match ($extension) {
            'jpg' => imagejpeg($gd, null, 85),
            'png' => imagepng($gd, null, 6),
            'webp' => imagewebp($gd, null, 85),
        };
        $bytes = (string) ob_get_clean();
        imagedestroy($gd);

        return UploadedFile::fake()->createWithContent("foto.{$extension}", $bytes);
    }
}
