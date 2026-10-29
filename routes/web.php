<?php

// Catch-all route buat React SPA — HARUS PALING BAWAH.
// Jangan menelan /api/*: kalau ikut match, request API yang salah bentuk
// (mis. segment non-numerik di bawah route-model binding) balas 405/200
// HTML, bukan 404 JSON.
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api/).*');
