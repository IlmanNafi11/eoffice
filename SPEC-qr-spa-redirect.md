# Spec: qr-spa-redirect

> Modul dari capability map 2026-11-02 (backend issues #1 & #2). Menutup
> [issue #2](https://github.com/IlmanNafi11/eoffice/issues/2). Intent:
> `docs/intent/backend-qr-spa-and-evaluator-picker.md`.

## Objective

QR yang dicetak pada PDF (laporan WFH & paket perubahan) kini mengarah ke
`/api/verify/{token}` — pemindai QR melihat JSON mentah, bukan halaman SPA.
Dua perbaikan:

1. **PDF baru:** `QrCodeService::generateVerificationUrl()` menghasilkan
   `config('app.url')."/verify/{token}"` (path SPA, tanpa `/api`).
2. **PDF lama yang sudah tercetak:** `GET /api/verify/{token}` dengan
   `Accept: text/html` di-redirect (302) ke `/verify/{token}`, sehingga scan
   QR lama juga mendarat di SPA card verifikasi.

Pengguna akhir: pemegang dokumen cetak yang memindai QR. Sukses = hasil scan
membuka halaman SPA `/verify/{token}`, bukan JSON.

## Keputusan Kontrak

1. **Opsi 1 + redirect** (keputusan user 2026-11-02). Tanpa redirect,
   definisi selesai #3 ("E2E scan ulang membuka SPA card") gagal untuk semua
   dokumen yang sudah beredar.
2. **Redirect hanya untuk `Accept: text/html`.** Konsumen JSON
   (`Accept: application/json`, `X-Requested-With`, tanpa header) TETAP menerima
   envelope JSON dari `QrVerificationController::verify` — kontrak API tidak
   berubah. Implementasi: route lebih-spesifik mendahului, atau redirect
   terpisah di depan route JSON; `postman/specs/openapi.yaml` untuk
   `/api/verify/{token}` tidak diubah perilakunya untuk klien JSON.
3. **Catch-all SPA `routes/web.php` tidak disentuh** (tolak `api/` sudah benar).
4. Throttle tetap: request text/html yang di-redirect melewati throttle yang
   sama dengan versi lama di grup `api` — tidak ada jalur baru tanpa limiter.

## Perubahan

| # | File | Perubahan |
|---|------|-----------|
| 1 | `app/Support/QrCode/QrCodeService.php:35-38` | `"/api/verify/{$token}"` → `"/verify/{$token}"` |
| 2 | `routes/api.php` (dekat route verify :33-36) | Redirect `Accept: text/html` dari `GET /api/verify/{token}` ke `/verify/{token}` (302), sebelum route JSON |
| 3 | `postman/specs/openapi.yaml:5067+` | Catat redirect 302 text/html pada path `/api/verify/{token}` + bump versi minor |
| 4 | `CHANGELOG.md` (Unreleased/Changed) | Entri: URL QR → SPA + redirect QR lama |

## Testing Strategy

TDD — RED dulu, lalu GREEN, satu commit.

| Test | File | Assert |
|------|------|--------|
| Unit URL | `tests/Unit/QrCodeServiceTest.php` (ubah test lama :43-52) | URL berakhir `/verify/{token}`, TIDAK memuat `/api/verify` |
| Redirect text/html | baru, `tests/Feature/QrVerificationTest.php` | `get('/api/verify/'.$token, ['Accept' => 'text/html'])` → 302, `Location: .../verify/{token}` |
| JSON tak berubah | sama | `getJson('/api/verify/'.$token)` → tetap 200/404 JSON enveloped, bukan redirect |
| Rate limit tetap | sama (pola test existing :143-152) | Limiter masih terpasang pada path redirect+JSON |

## Acceptance Criteria

- AC1: `generateVerificationUrl` menghasilkan URL SPA; test unit lama yang
  mengunci `/api/verify` diubah mengunci `/verify` (RED bila reversi).
- AC2: Scan-simulasi `Accept: text/html` ke `/api/verify/{token}` → 302 ke
  `/verify/{token}`.
- AC3: Klien JSON tidak melihat perilaku baru — `getJson` tetap envelope
  `{success, data|404}`.
- AC4: OpenAPI + CHANGELOG ter-update; `vendor/bin/pint --test` clean;
  suite penuh hijau.

## Verify

```bash
php artisan test --compact
vendor/bin/pint --test
php artisan test --filter=QrVerificationTest
php artisan test --filter=QrCodeServiceTest
```

## Boundaries

- Always: throttle pada kedua bentuk route; kontrak JSON utuh; RED→GREEN.
- Ask first: menambah header/route di luar dua titik di atas.
- Never: mengubah catch-all `routes/web.php`; menghapus route JSON raw;
  redirect untuk semua Accept (menelan kontrak API).

## Open Questions

None — keputusan dikunci oleh interview + issue.
