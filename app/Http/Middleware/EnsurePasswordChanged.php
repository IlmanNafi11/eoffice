<?php

namespace App\Http\Middleware;

use App\Support\Http\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasswordChanged
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // Deactivated accounts keep a valid Sanctum token for up to the token
        // TTL. Re-checking here makes deactivation effective immediately.
        if ($user && ! $user->is_active) {
            $user->tokens()->delete();

            return ApiResponse::fail('Akun tidak aktif. Hubungi administrator.', 403);
        }

        if ($user && $user->must_change_password) {
            return ApiResponse::fail('Password harus diubah sebelum mengakses fitur ini.', 403);
        }

        return $next($request);
    }
}
