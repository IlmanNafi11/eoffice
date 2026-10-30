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
        /*
         * Non-numeric input must fall back to the documented default (15),
         * not clamp to 1: Request::integer() casts "abc" to 0, which the old
         * min/max chain silently turned into a 1-item page (ship review C3).
         */
        $perPage = $request->input('per_page', 15);

        if (! is_numeric($perPage)) {
            return 15;
        }

        return min(max((int) $perPage, 1), 100);
    }
}
