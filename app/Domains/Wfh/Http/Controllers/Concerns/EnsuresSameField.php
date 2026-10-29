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
     */
    private function ensureSameField(Request $request, ?int $reportFieldId): ?JsonResponse
    {
        $userFieldId = $request->user()->team?->field?->id;

        if (! $userFieldId || ! $reportFieldId || $userFieldId !== $reportFieldId) {
            return ApiResponse::fail('Laporan tidak berada dalam bidang Anda.', 403);
        }

        return null;
    }
}
