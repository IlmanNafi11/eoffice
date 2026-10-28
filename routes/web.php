<?php

// Catch-all route buat React SPA — HARUS PALING BAWAH
Route::get('/{any}', function () {
    return view('app');
})->where('any', '.*');
