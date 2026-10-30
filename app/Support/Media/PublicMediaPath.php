<?php

namespace App\Support\Media;

use Illuminate\Support\Facades\Storage;

/**
 * Single home for resolving attendance-photo paths. Photos are non-secret
 * evidence stored on the `public` disk, so they resolve to an absolute path
 * that the PDF renderer can embed.
 */
class PublicMediaPath
{
    /**
     * Absolute path on the public disk, or '' when no path is given.
     */
    public static function resolve(?string $relative): string
    {
        if ($relative === null || $relative === '') {
            return '';
        }

        return Storage::disk('public')->path($relative);
    }

    /**
     * True when a storage-relative path is set and the file exists on disk.
     */
    public static function exists(?string $relative): bool
    {
        return $relative !== null && $relative !== '' && Storage::disk('public')->exists($relative);
    }
}
