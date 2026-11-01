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

        // CSP + HSTS dinyalakan untuk SEMUA environment selain local (bukan
        // production-only): staging/UAT/preview yang menyajikan bundle `vite
        // build` tetap mendapat lapisan mitigasi XSS terkuat — mekanisme
        // simpan token (localStorage) identik di sana. `vite dev` hanya ada
        // di local (menyuntik script HMR inline dari dev-server), jadi local
        // dikecualikan agar HMR tidak mati (ship review #4: CSP blank di
        // staging karena gate production-only).
        if (! app()->environment('local')) {
            // CSP untuk shell SPA: token bearer disimpan di localStorage;
            // connect-src 'self' memblokir eksfiltrasi token ke origin lain.
            // - script-src 'self': bundel Vite pada `vite build`.
            // - style-src 'unsafe-inline': dibutuhkan oleh `motion` (framer
            //   motion) yang menyuntik <style> runtime; Vite build sendiri
            //   mengekstrak CSS ke berkas eksternal.
            // - img-src blob: preview tanda tangan memakai object URL.
            // - frame-ancestors 'none': padanan modern X-Frame-Options: DENY.
            $response->headers->set(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
            );
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
    }
}
