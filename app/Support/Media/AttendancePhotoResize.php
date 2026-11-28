<?php

namespace App\Support\Media;

use App\Support\Pdf\PdfImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class AttendancePhotoResize
{
    /** 10× the 60px print box in the WFH report PDF template. */
    private const MAX_SIDE = 600;

    public static function maxSide(): int
    {
        return self::MAX_SIDE;
    }

    /**
     * Decode-guard → scale once → re-encode in the source format → write to
     * the private disk. Corrupt or unsupported content is stored byte-for-byte
     * so evidence is never silently discarded; the dimension guard still
     * applies, so a forged oversized header cannot bypass it via fallback.
     */
    public static function store(UploadedFile $photo, string $directory, string $filename): string
    {
        $bytes = (string) file_get_contents($photo->getRealPath());
        $info = @getimagesizefromstring($bytes);

        if (is_array($info) && ($info[0] * $info[1]) > PdfImage::maxDecodedPixels()) {
            throw new \InvalidArgumentException('Gambar terlalu besar untuk diproses.');
        }

        $mime = is_array($info) ? ($info['mime'] ?? null) : null;
        $decoder = match ($mime) {
            'image/jpeg' => 'imagecreatefromjpeg',
            'image/png' => 'imagecreatefrompng',
            'image/webp' => 'imagecreatefromwebp',
            default => null,
        };

        if ($decoder !== null && function_exists($decoder)) {
            $source = @$decoder($photo->getRealPath());

            if ($source !== false) {
                $width = imagesx($source);
                $height = imagesy($source);
                $longest = max($width, $height);

                if ($longest > self::MAX_SIDE) {
                    $ratio = self::MAX_SIDE / $longest;
                    $scaled = imagescale(
                        $source,
                        max(1, (int) round($width * $ratio)),
                        max(1, (int) round($height * $ratio)),
                    );

                    if ($scaled !== false) {
                        $encoded = self::encode($scaled, (string) $mime);

                        if ($encoded !== null) {
                            $bytes = $encoded;
                        }

                        imagedestroy($scaled);
                    }
                }

                imagedestroy($source);
            }
        }

        $path = trim($directory, '/').'/'.$filename;
        Storage::disk('local')->put($path, $bytes);

        return $path;
    }

    /**
     * Re-encode with the source format and its usual quality setting.
     * Returns null when GD cannot encode this format in this build.
     */
    private static function encode(\GdImage $image, string $mime): ?string
    {
        ob_start();
        $ok = match ($mime) {
            'image/jpeg' => imagejpeg($image, null, 88),
            'image/png' => imagepng($image, null, 6),
            'image/webp' => imagewebp($image, null, 88),
            default => false,
        };
        $bytes = (string) ob_get_clean();

        return $ok && $bytes !== '' ? $bytes : null;
    }
}
