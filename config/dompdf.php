<?php

/**
 * Hardened dompdf config (ship review #22).
 *
 * Only the settings that differ from the vendor defaults
 * (vendor/barryvdh/laravel-dompdf/config/dompdf.php, merged via
 * `mergeConfigFrom`) are declared here — Laravel merges the published file
 * over the vendor one, so anything omitted keeps its default.
 *
 * `allowed_protocols` drops `file://` and `http://`: every image the PDF
 * renderer loads today is a local data-URI or a chroot-contained local path,
 * so the allowances exist only as a footgun — a future `enable_remote` flip
 * (e.g. while debugging) would otherwise silently enable local-file reads and
 * plaintext fetches from the renderer.
 *
 * Ship #23: the key MUST live under `options`. The package provider reads
 * `dompdf.options` only (`$app['config']->get('dompdf.options')`); the
 * top-level `allowed_protocols` this file used to declare was merged into the
 * config but never reached Dompdf\Options, so file:// and http:// were still
 * live at runtime. Pinned by DompdfConfigTest against the EFFECTIVE options.
 */
return [
    'options' => [
        'allowed_protocols' => [
            'data://' => ['rules' => []],
            'https://' => ['rules' => []],
        ],
    ],
];
