<?php

namespace Tests\Feature\Support;

use App\Support\Pdf\PdfImage;
use Barryvdh\DomPDF\Facade\Pdf;
use Tests\TestCase;

class PdfImageTest extends TestCase
{
    public function test_doc_logo_is_returned_as_a_webp_data_uri(): void
    {
        $uri = PdfImage::dataUri('images/logo-doc.webp');

        $this->assertStringStartsWith('data:image/webp;base64,', $uri);
        $this->assertGreaterThan(1000, strlen($uri));
    }

    public function test_doc_logo_is_downscaled_to_render_resolution(): void
    {
        // Sumber 1400x1960 (~304KB WebP); template merender 74px. Bitmap yang
        // di-embed harus jauh lebih kecil dari byte sumber — tanpa penurunan
        // skala, dompdf menyematkan PNG ~1.8MB per logo dan test suite menembus
        // memory_limit (akar regresi ship #13). 148px (2x) menutup ketajaman.
        $uri = PdfImage::dataUri('images/logo-doc.webp');
        $bytes = strlen(base64_decode(substr($uri, strpos($uri, ',') + 1)));

        $this->assertLessThan(
            filesize(public_path('images/logo-doc.webp')),
            $bytes,
            'Embedded logo bitmap must be smaller than the source asset.',
        );
    }

    public function test_webp_logo_renders_as_an_embedded_pdf_image(): void
    {
        $uri = PdfImage::dataUri('images/logo-doc.webp');

        $pdf = Pdf::loadHTML('<html><body><img src="'.$uri.'" style="width:74px"></body></html>');
        $pdf->setPaper('A4', 'portrait');

        $output = $pdf->output();

        // dompdf converts WebP to PNG via imagecreatefromwebp(); a runtime
        // whose GD lacks WebP support throws Dompdf\Exception instead of
        // emitting an image object. Assert the image actually landed.
        $this->assertStringContainsString('/Subtype /Image', $output);
    }

    public function test_traversal_path_is_rejected_before_reading_the_file(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        PdfImage::dataUri('../composer.json');
    }

    public function test_symlink_escaping_the_public_root_is_rejected(): void
    {
        // dataUri mengikuti symlink (`is_file`); tanpa cek realpath, symlink
        // di public/images/ yang menunjuk ke luar root bisa terbaca.
        $target = base_path('.env.example');
        $link = public_path('images/escape-test.webp');
        $this->assertTrue(@symlink($target, $link));

        try {
            $this->expectException(\InvalidArgumentException::class);
            PdfImage::dataUri('images/escape-test.webp');
        } finally {
            @unlink($link);
        }
    }

    public function test_missing_asset_throws_instead_of_returning_a_broken_uri(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        PdfImage::dataUri('images/does-not-exist.webp');
    }

    public function test_forged_oversized_header_is_rejected_before_gd_decode(): void
    {
        // Header PNG palsu 10000×10000 pada berkas kecil: GD mengalokasikan
        // bitmap penuh SEBELUM `imagesx` bisa diperiksa — tanpa guard, worker
        // PDF di-OOM-kan (bukan exception yang tertangkap). getimagesize hanya
        // membaca header, jadi penolakan harus terjadi di situ.
        $w = 10000;
        $h = 10000;
        $ihdr = pack('NNCCCCC', $w, $h, 8, 6, 0, 0, 0);
        $png = "\x89PNG\r\n\x1a\n"
            .pack('N', 13).'IHDR'.$ihdr.pack('N', crc32('IHDR'.$ihdr))
            .pack('N', 0).pack('N', crc32('IEND')).'IEND';
        file_put_contents(public_path('images/bomb-test.png'), $png);

        try {
            $this->expectException(\InvalidArgumentException::class);
            PdfImage::dataUri('images/bomb-test.png');
        } finally {
            @unlink(public_path('images/bomb-test.png'));
        }
    }
}
