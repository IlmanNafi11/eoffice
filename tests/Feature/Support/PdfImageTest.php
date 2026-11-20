<?php

namespace Tests\Feature\Support;

use App\Support\Pdf\PdfImage;
use Tests\TestCase;

class PdfImageTest extends TestCase
{
    public function test_doc_logo_is_returned_as_a_webp_data_uri(): void
    {
        $uri = PdfImage::dataUri('images/logo-doc.webp');

        $this->assertStringStartsWith('data:image/webp;base64,', $uri);
        $this->assertGreaterThan(1000, strlen($uri));
    }

    public function test_traversal_path_is_rejected_before_reading_the_file(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        PdfImage::dataUri('../composer.json');
    }

    public function test_missing_asset_throws_instead_of_returning_a_broken_uri(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        PdfImage::dataUri('images/does-not-exist.webp');
    }
}
