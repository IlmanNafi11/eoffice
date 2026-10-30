<?php

namespace App\Support\Media;

use App\Support\Signature\SignaturePath;
use Illuminate\Support\Facades\Storage;

/**
 * Attendance photos and change-package evidence are private: they show a
 * person's face and, for change packages, internal operational detail. They
 * live on the private `local` disk and are never web-served — a caller either
 * embeds the bytes into a PDF or receives an authorized URL that re-checks
 * visibility on every request.
 *
 * This mirrors {@see SignaturePath} deliberately: the
 * three evidence types must not drift apart, because the failure mode of the
 * drift is silent public exposure (ship review: both were previously stored on
 * the `public` disk, so `/storage/attendances/...` and
 * `/storage/change-attachments/...` were downloadable without authentication).
 */
class PrivateMediaPath
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
     * Absolute path for a row written before the private-disk cutover.
     *
     * The private disk is authoritative; the public disk is consulted only so
     * PDFs keep rendering between deploying this code and running
     * `media:migrate-private`. Returns '' when neither has the file, which
     * callers already treat as "no evidence".
     */
    public static function resolveAny(?string $relative): string
    {
        if ($relative === null || $relative === '') {
            return '';
        }

        if (Storage::disk('local')->exists($relative)) {
            return Storage::disk('local')->path($relative);
        }

        if (Storage::disk('public')->exists($relative)) {
            return Storage::disk('public')->path($relative);
        }

        return '';
    }

    /**
     * True when the file exists on either disk (see {@see self::resolveAny()}).
     */
    public static function existsAny(?string $relative): bool
    {
        if ($relative === null || $relative === '') {
            return false;
        }

        return Storage::disk('local')->exists($relative)
            || Storage::disk('public')->exists($relative);
    }

    /**
     * True when a storage-relative path is set and the file exists on disk.
     */
    public static function exists(?string $relative): bool
    {
        return $relative !== null && $relative !== '' && Storage::disk('local')->exists($relative);
    }

    /**
     * Authorized URL for an attendance photo, or null when none is stored.
     * The client must be authenticated; the endpoint re-checks visibility.
     */
    public static function attendanceUrl(int $reportId, int $attendanceId, ?string $relative): ?string
    {
        if ($relative === null || $relative === '') {
            return null;
        }

        return route('attendances.photo', [
            'report' => $reportId,
            'attendance' => $attendanceId,
        ]);
    }
}
