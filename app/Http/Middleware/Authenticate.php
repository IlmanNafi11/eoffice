<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

class Authenticate extends Middleware
{
    /**
     * API-only app: there is no `login` route to redirect to, so unauthenticated
     * requests are always rendered as 401 by the exception handler.
     */
    protected function redirectTo(Request $request): ?string
    {
        return null;
    }
}
