<?php

namespace App\Support\Signature;

use Illuminate\Support\Facades\Storage;

/**
 * Single home for resolving storage-relative signature paths to absolute
 * files. Signatures live on the private `local` disk (storage/app/signatures)
 * and are never web-served: callers either embed the bytes into a PDF or hand
 * the client an authorized URL from {@see self::urlFor()}.
 *
 * Every path that reaches {@see Storage::path()} is checked for containment:
 * the value stored in the database is treated as untrusted even though the
 * normal write paths never accept it from a request (ship review #3: a
 * tampered row containing `../` must not escape storage/app).
 */
class SignaturePath
{
    /**
     * True when the relative path stays inside the disk root: no `..`
     * segments, no absolute prefix, no backslashes (Windows separators on
     * a POSIX host would bypass naive prefix checks), and no URL-encoded or
     * null-byte payload (ship review #4: a row value like `%2e%2e%2f` or
     * `..%00.png` currently has no reachable caller that passes it to
     * Storage::path() un-decoded — this keeps it that way even if a future
     * endpoint forwards a request string).
     */
    public static function contained(?string $relative): bool
    {
        if ($relative === null || $relative === '') {
            return false;
        }

        if (str_contains($relative, '\\') || str_starts_with($relative, '/')) {
            return false;
        }

        if (str_contains($relative, "\0") || preg_match('/%(?:2e|2f|5c|00)/i', $relative)) {
            return false;
        }

        return ! in_array('..', explode('/', $relative), true);
    }

    /**
     * Absolute path on the private disk, or '' when the path is missing or
     * escapes the disk root. Callers decide whether the file must actually
     * exist; '' is already their "no file" signal.
     */
    public static function resolve(?string $relative): string
    {
        if (! self::contained($relative)) {
            return '';
        }

        return Storage::disk('local')->path($relative);
    }

    /**
     * True when a contained, storage-relative path exists on the disk.
     */
    public static function exists(?string $relative): bool
    {
        return self::contained($relative) && Storage::disk('local')->exists($relative);
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
