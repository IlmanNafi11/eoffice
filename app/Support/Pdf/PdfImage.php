<?php

namespace App\Support\Pdf;

class PdfImage
{
    public static function dataUri(string $publicPath): string
    {
        $absolute = public_path($publicPath);

        if (! is_file($absolute)) {
            throw new \InvalidArgumentException("PDF image asset not found: {$publicPath}");
        }

        return 'data:image/webp;base64,'.base64_encode((string) file_get_contents($absolute));
    }
}
