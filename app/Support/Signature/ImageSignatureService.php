<?php

namespace App\Support\Signature;

use Illuminate\Support\Facades\Storage;
use Intervention\Image\Laravel\Facades\Image;

class ImageSignatureService implements SignatureServiceInterface
{
    private const MAX_WIDTH = 300;

    private const MAX_HEIGHT = 100;

    public const TRIM_SCAN_STEP = 4;

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
        $step = self::TRIM_SCAN_STEP;
        $top = $bottom = $left = $right = null;

        $isInk = function (int $x, int $y) use ($gd, $threshold): bool {
            $rgb = imagecolorat($gd, $x, $y);

            return ((($rgb >> 16) & 0xFF) + (($rgb >> 8) & 0xFF) + ($rgb & 0xFF)) / 3 < $threshold;
        };

        for ($y = 0; $y < $height; $y += $step) {
            for ($x = 0; $x < $width; $x += $step) {
                if (! $isInk($x, $y)) {
                    continue;
                }
                $top ??= $y;
                $bottom = $y;
                $left = min($left ?? $x, $x);
                $right = max($right ?? $x, $x);
            }
        }

        if ($top === null) {
            return;
        }

        // Off-grid strokes can sit up to step-1 px outside the coarse box in
        // any direction. Refine only the bands outside each coarse edge.
        $band = $step - 1;
        $innerTop = $top;
        $innerBottom = $bottom;
        $innerLeft = $left;
        $innerRight = $right;
        $topBand = max(0, $innerTop - $band);
        $bottomBand = min($height - 1, $innerBottom + $band);
        $leftBand = max(0, $innerLeft - $band);
        $rightBand = min($width - 1, $innerRight + $band);

        for ($y = $topBand; $y < $innerTop; $y++) {
            for ($x = $leftBand; $x <= $rightBand; $x++) {
                if ($isInk($x, $y)) {
                    $top = min($top, $y);
                    $left = min($left, $x);
                    $right = max($right, $x);
                }
            }
        }

        for ($y = $innerBottom + 1; $y <= $bottomBand; $y++) {
            for ($x = $leftBand; $x <= $rightBand; $x++) {
                if ($isInk($x, $y)) {
                    $bottom = max($bottom, $y);
                    $left = min($left, $x);
                    $right = max($right, $x);
                }
            }
        }

        for ($y = $innerTop; $y <= $innerBottom; $y++) {
            for ($x = $leftBand; $x < $innerLeft; $x++) {
                if ($isInk($x, $y)) {
                    $top = min($top, $y);
                    $bottom = max($bottom, $y);
                    $left = min($left, $x);
                }
            }
            for ($x = $innerRight + 1; $x <= $rightBand; $x++) {
                if ($isInk($x, $y)) {
                    $top = min($top, $y);
                    $bottom = max($bottom, $y);
                    $right = max($right, $x);
                }
            }
        }

        $padding = 5;
        $cropX = max(0, $left - $padding);
        $cropY = max(0, $top - $padding);
        $cropW = min($width - $cropX, $right - $left + 2 * $padding);
        $cropH = min($height - $cropY, $bottom - $top + 2 * $padding);

        $image->crop($cropW, $cropH, $cropX, $cropY);
    }
}
