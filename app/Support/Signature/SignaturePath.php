<?php

namespace App\Support\Signature;

use Illuminate\Support\Facades\Storage;

/**
 * Single home for resolving storage-relative signature paths to absolute
 * files. Signatures live on the private `local` disk (storage/app/signatures)
 * and are never web-served: callers either embed the bytes into a PDF or hand
 * the client an authorized URL from {@see self::urlFor()}.
 */
class SignaturePath
{
    /**
     * Absolute path on the private disk, or '' when no path is given.
     * Callers decide whether the file must actually exist.
     */
    public static function resolve(?string $relative): string
    {
        if ($relative === null || $relative === '') {
            return '';
        }

        return Storage::disk('local')->path($relative);
    }

    /**
     * True when a storage-relative path is set and the file exists on disk.
     */
    public static function exists(?string $relative): bool
    {
        return $relative !== null && $relative !== '' && Storage::disk('local')->exists($relative);
    }

    /**
     * Authorized URL for a signature file, or null when the user has none.
     * The client must be authenticated; the endpoint re-checks visibility.
     */
    public static function urlFor(int $userId, ?string $relative): ?string
    {
        if ($relative === null || $relative === '') {
            return null;
        }

        return route('signatures.show', ['user' => $userId]);
    }
}
