<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/*
 * Liveness/readiness probe (ship review: deployments had no health endpoint, so
 * an orchestrator could only infer health from traffic). Deliberately above the
 * SPA catch-all and outside /api: it must stay reachable without auth and must
 * not inherit the API's JSON error envelope.
 *
 * It reports 503 when the database is unreachable — a pod that cannot reach its
 * database is not healthy, and a 200 there would keep bad instances in rotation.
 */
Route::get('/up', function () {
    try {
        DB::connection()->select('select 1');
    } catch (Throwable $e) {
        return response()->json(['status' => 'unavailable'], 503);
    }

    return response()->json(['status' => 'ok']);
});

// Catch-all route buat React SPA — HARUS PALING BAWAH.
// Jangan menelan /api/*: kalau ikut match, request API yang salah bentuk
// (mis. segment non-numerik di bawah route-model binding) balas 405/200
// HTML, bukan 404 JSON.
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api/).*');
