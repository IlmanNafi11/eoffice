<?php

namespace App\Support\Signature;

use Illuminate\Support\Facades\Storage;
use Intervention\Image\Laravel\Facades\Image;

class ImageSignatureService implements SignatureServiceInterface
{
    private const MAX_WIDTH = 300;

    private const MAX_HEIGHT = 100;

    public function normalize(string $sourcePath, int $userId): string
    {
        $image = Image::decode($sourcePath);

        $this->trimWhitespace($image);

        $image->scale(width: self::MAX_WIDTH, height: self::MAX_HEIGHT);

        $relativePath = "signatures/{$userId}.png";
        Storage::disk('local')->makeDirectory('signatures');
        $fullPath = Storage::disk('local')->path($relativePath);

        $image->save($fullPath);

        return $relativePath;
    }

    /**
     * Crop image in-place to remove excessive whitespace.
     * Uses brightness threshold to detect content boundaries.
     */
    private function trimWhitespace($image): void
    {
        $gd = $image->core()->native();

        $width = imagesx($gd);
        $height = imagesy($gd);

        $threshold = 240;
        $top = $bottom = $left = $right = null;

        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                $rgb = imagecolorat($gd, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;

                if (($r + $g + $b) / 3 < $threshold) {
                    if ($top === null || $y < $top) {
                        $top = $y;
                    }
                    if ($bottom === null || $y > $bottom) {
                        $bottom = $y;
                    }
                    if ($left === null || $x < $left) {
                        $left = $x;
                    }
                    if ($right === null || $x > $right) {
                        $right = $x;
                    }
                }
            }
        }

        if ($top === null) {
            return;
        }

        $padding = 5;
        $cropX = max(0, $left - $padding);
        $cropY = max(0, $top - $padding);
        $cropW = min($width - $cropX, $right - $left + 2 * $padding);
        $cropH = min($height - $cropY, $bottom - $top + 2 * $padding);

        $image->crop($cropW, $cropH, $cropX, $cropY);
    }
}
