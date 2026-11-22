<?php

namespace App\Support\Pdf;

use App\Support\Signature\SignaturePath;

class PdfImage
{
    /**
     * Lebar maksimum yang disematkan (px). Semua template merender logo pada
     * 74px CSS; 2× memberi ketajaman cetak tanpa membawa bitmap 1400px ke
     * dalam PDF. dompdf mendekode gambar raster ke memori penuh per kemunculan,
     * jadi logo 1400×1960 (~1.8MB PNG internal) membuat render PDF menembus
     * memory_limit — penurunan skala di sini adalah akar perbaikannya.
     */
    private const MAX_WIDTH = 148;

    /**
     * Data URI untuk aset gambar publik. MIME diambil dari isi berkas
     * (bukan diasumsikan), dan bitmap diturunkan skalanya ke lebar render.
     */
    public static function dataUri(string $publicPath): string
    {
        if (! SignaturePath::contained($publicPath)) {
            throw new \InvalidArgumentException("PDF image asset path escapes the public root: {$publicPath}");
        }

        $absolute = realpath(public_path($publicPath));

        if ($absolute === false || ! is_file($absolute)) {
            throw new \InvalidArgumentException("PDF image asset not found: {$publicPath}");
        }

        // `realpath` sudah menormalkan `..`, tapi symlink di dalam public/
        // bisa menunjuk ke luar root — tolak eksplisit.
        $root = realpath(public_path());
        if ($root === false || ! str_starts_with($absolute, $root.DIRECTORY_SEPARATOR)) {
            throw new \InvalidArgumentException("PDF image asset resolves outside the public root: {$publicPath}");
        }

        $bytes = (string) file_get_contents($absolute);
        $mime = self::mimeOf($absolute);

        $scaled = self::downscaled($absolute, $mime);

        if ($scaled !== null) {
            [$bytes, $mime] = $scaled;
        }

        return 'data:'.$mime.';base64,'.base64_encode($bytes);
    }

    /** MIME sebenarnya dari isi berkas (bukan dari ekstensi). */
    private static function mimeOf(string $absolute): string
    {
        $info = @getimagesize($absolute);
        $mime = is_array($info) ? ($info['mime'] ?? null) : null;

        return is_string($mime) && $mime !== '' ? $mime : 'application/octet-stream';
    }

    /**
     * Turunkan skala bitmap pendukung (WebP/PNG/JPEG) ke `MAX_WIDTH`.
     * Returns `[bytes, mime]`, atau null bila GD tak bisa mendekode —
     * pemanggil lalu memakai byte asli.
     *
     * @return array{0: string, 1: string}|null
     */
    private static function downscaled(string $absolute, string $mime): ?array
    {
        $decoder = match ($mime) {
            'image/webp' => 'imagecreatefromwebp',
            'image/png' => 'imagecreatefrompng',
            'image/jpeg' => 'imagecreatefromjpeg',
            default => null,
        };

        if ($decoder === null || ! function_exists($decoder)) {
            return null;
        }

        $source = @$decoder($absolute);
        if ($source === false) {
            return null;
        }

        $width = imagesx($source);
        $height = imagesy($source);

        if ($width <= self::MAX_WIDTH) {
            imagedestroy($source);

            return null;
        }

        $targetWidth = self::MAX_WIDTH;
        $targetHeight = max(1, (int) round($height * $targetWidth / $width));
        $scaled = imagescale($source, $targetWidth, $targetHeight);

        if ($scaled === false) {
            imagedestroy($source);

            return null;
        }

        ob_start();
        $encoded = match ($mime) {
            'image/webp' => imagewebp($scaled, null, 90),
            'image/png' => imagepng($scaled, null, 9),
            'image/jpeg' => imagejpeg($scaled, null, 90),
            default => false,
        };
        $bytes = (string) ob_get_clean();

        imagedestroy($scaled);
        imagedestroy($source);

        return $encoded === true && $bytes !== '' ? [$bytes, $mime] : null;
    }
}
