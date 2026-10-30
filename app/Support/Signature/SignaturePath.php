<?php

namespace App\Support\Signature;

/**
 * Single home for resolving storage-relative paths to absolute public files.
 * This is the only place allowed to build the public storage prefix, so callers
 * stop repeating the prefix and the path convention stay in one file.
 */
class SignaturePath
{
    /**
     * Absolute public path for a storage-relative path, or '' when no path is
     * given. Callers decide whether the file must actually exist.
     */
    public static function resolve(?string $relative): string
    {
        if ($relative === null || $relative === '') {
            return '';
        }

        return public_path('storage/'.$relative);
    }

    /**
     * True when a storage-relative path is set and the file exists on disk.
     */
    public static function exists(?string $relative): bool
    {
        return $relative !== null && $relative !== '' && is_file(self::resolve($relative));
    }
}
