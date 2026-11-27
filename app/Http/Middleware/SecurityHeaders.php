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

        // `no-store` upgrade is auth-gated (see applyNoStore()): a request carrying a
        // credential answered 2xx is private data, and its errors are too.
        self::applyNoStore($response, authenticated: $request->user() !== null || $response->getStatusCode() >= 400);

        return $response;
    }

    /**
     * Private data (names, NIP, activities, photo URLs) must not sit in a
     * browser/proxy cache. Authenticated calls rely on Laravel's default
     * `no-cache, private`, which still allows storage; `no-store` forbids it
     * entirely (parity with the photo endpoint, already `no-store`).
     *
     * Auth-gated on purpose (ship review #22): the earlier content-agnostic
     * rule keyed on `private` alone, and Laravel marks *everything* private —
     * so the session-less health check `/up` was frozen to `no-store, private`
     * too. Only responses to a credentialed request, or any error response,
     * are upgraded; anonymous success responses keep the framework default.
     */
    public static function applyNoStore(Response $response, bool $authenticated): void
    {
        if (! $authenticated) {
            return;
        }

        if ($response->headers->has('Cache-Control')
            && str_contains((string) $response->headers->get('Cache-Control'), 'private')) {
            $response->headers->set('Cache-Control', 'no-store, private');
        }
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
            // - script-src 'self' + hash inline: bundel Vite pada `vite build`,
            //   plus hash sha256 skrip anti-flash tema di app.blade.php
            //   (ship review: skrip inline diblokir CSP non-local sehingga
            //   kilatan tema kembali — smoke asli hanya berjalan di local
            //   yang CSP-nya nonaktif). Hash mengizinkan SKRIP ITU SAJA;
            //   bila isi skrip berubah, hitung ulang:
            //   sha256(body persis antara <script>...</script>).
            // - style-src 'unsafe-inline': dibutuhkan oleh `motion` (framer
            //   motion) yang menyuntik <style> runtime; Vite build sendiri
            //   mengekstrak CSS ke berkas eksternal.
            // - img-src blob: preview tanda tangan memakai object URL.
            // - frame-ancestors 'none': padanan modern X-Frame-Options: DENY.
            $response->headers->set(
                'Content-Security-Policy',
                "default-src 'self'; script-src 'self' 'sha256-TJz+Yu1g1SzfB0OY76Uzoqdyz+RPq/OiSkaXOPTauaY='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
            );
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
    }
}
