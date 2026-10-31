<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        self::apply($response);

        return $response;
    }

    /**
     * Apply the security headers to any response, including error responses
     * rendered outside the middleware pipeline (handled via the RequestHandled
     * listener in AppServiceProvider).
     */
    public static function apply(Response $response): void
    {
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

        if (app()->environment('production')) {
            // CSP untuk shell SPA: token bearer disimpan di localStorage;
            // header ini membatasi dampak XSS (connect-src 'self' memblokir
            // eksfiltrasi token ke origin lain).
            // - script-src 'self': bundel Vite pada `vite build`.
            // - style-src 'unsafe-inline': tag <style> yang disuntikkan Vite
            //   HMR dan library UI yang menyuntik style runtime.
            // - img-src blob:: preview tanda tangan memakai object URL.
            // - frame-ancestors 'none': padanan modern X-Frame-Options: DENY.
            // Digate ke production saja: `vite dev` menyajikan script/module
            // dari dev-server (host berbeda) dan menyuntik script HMR inline,
            // yang tidak lolos CSP 'self' — jalur itu hanya ada di local.
            $response->headers->set(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
            );
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
    }
}
