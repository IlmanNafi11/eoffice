<?php

namespace App\Support\Signature;

use App\Models\User;

/**
 * Blocks PDF export when an involved (non-null) user has not yet configured a
 * signature file, so a PDF is never issued with a placeholder or blank
 * signature. Unassigned roles (null) are skipped: they render as '-' and are a
 * data-integrity concern, not the missing-signature case.
 */
class SignatureGuard
{
    /**
     * First involved user lacking a usable signature file, or null when every
     * assigned user has one.
     *
     * @param  array<int, User|null>  $users
     */
    public static function missing(array $users): ?User
    {
        foreach ($users as $user) {
            if ($user !== null && (! $user->signature_path || ! SignaturePath::exists($user->signature_path))) {
                return $user;
            }
        }

        return null;
    }

    /**
     * Response body for a signature-guard rejection (used by all exporters).
     *
     * @return array{success: bool, message: string}
     */
    public static function missingMessage(string $name): array
    {
        return [
            'success' => false,
            'message' => $name.' belum mengatur tanda tangan. Atur tanda tangan terlebih dahulu sebelum mengekspor PDF.',
        ];
    }
}
