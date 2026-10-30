<?php

namespace App\Domains\Wfh\Http\Controllers\Concerns;

use App\Support\Http\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait EnsuresSameField
{
    /**
     * Return a 403 response when the authenticated actor is not in the same
     * field as the report, or null when the guard passes.
     *
     * A null field id (actor or report) is denied, matching the shipped guard.
     * The actor's `team.field` chain is eager-loaded once here so the guard
     * never emits a hidden per-request lazy query on the approval path.
     */
    private function ensureSameField(Request $request, ?int $reportFieldId): ?JsonResponse
    {
        $actor = $request->user();
        $actor->loadMissing('team.field');
        $userFieldId = $actor->team?->field?->id;

        if (! $userFieldId || ! $reportFieldId || $userFieldId !== $reportFieldId) {
            return ApiResponse::fail('Laporan tidak berada dalam bidang Anda.', 403);
        }

        return null;
    }
}
