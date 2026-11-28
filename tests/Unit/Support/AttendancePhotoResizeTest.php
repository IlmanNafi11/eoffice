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
        $this->assertSame(16_000_000, $limit);

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
