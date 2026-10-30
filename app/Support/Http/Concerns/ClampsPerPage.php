<?php

namespace App\Support\Http\Concerns;

use Illuminate\Http\Request;

trait ClampsPerPage
{
    /**
     * Uniform list clamp: per_page is bounded to 1..100 (SPEC-envelope item 3).
     */
    public static function perPage(Request $request): int
    {
        return min(max($request->integer('per_page', 15), 1), 100);
    }
}
