<?php

namespace App\Support\Pdf;

use App\Support\Signature\SignaturePath;

class PdfImage
{
    public static function dataUri(string $publicPath): string
    {
        if (! SignaturePath::contained($publicPath)) {
            throw new \InvalidArgumentException("PDF image asset path escapes the public root: {$publicPath}");
        }

        $absolute = public_path($publicPath);

        if (! is_file($absolute)) {
            throw new \InvalidArgumentException("PDF image asset not found: {$publicPath}");
        }

        return 'data:image/webp;base64,'.base64_encode((string) file_get_contents($absolute));
    }
}
