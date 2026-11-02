<?php

namespace App\Support\QrCode;

use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

class QrCodeService
{
    /**
     * Generate a QR code as inline SVG string (no GD dependency).
     *
     * @param  string  $data  Data to encode
     * @param  int  $size  QR code pixel size
     * @return string Inline SVG HTML
     */
    public function generate(string $data, int $size = 120): string
    {
        $renderer = new ImageRenderer(
            new RendererStyle($size, margin: 0),
            new SvgImageBackEnd,
        );

        return (new Writer($renderer))->writeString($data);
    }

    /**
     * Generate a verification URL for a document using its stored verification token.
     *
     * @param  string  $token  Per-document random verification token
     * @return string Verification URL
     */
    public function generateVerificationUrl(string $token): string
    {
        return config('app.url')."/verify/{$token}";
    }
}
