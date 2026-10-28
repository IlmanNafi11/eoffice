# SPEC-error-contract

> Capability map: `CAPABILITY-MAP.md` → module id `error-contract`. Depends on:
> `envelope`. Root conventions: `SPEC.md`.

## Objective

Satu jalur error untuk seluruh aplikasi: exception apa pun yang lolos ke HTTP
dirender oleh `Handler::render()` menjadi envelope `SPEC-envelope.md`, tanpa
membocorkan detail internal, dan tanpa pernah menghasilkan 500 untuk kondisi yang
dapat dipicu user.

## In scope

### 1. `App\Exceptions\ApiException`

```php
namespace App\Exceptions;

use RuntimeException;

final class ApiException extends RuntimeException
{
    public function __construct(
        string $message,
        private readonly int $status = 422,
        private readonly ?array $errors = null,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($message, 0, $previous);
    }

    public function status(): int;
    public function errors(): ?array;
}
```

Satu-satunya exception yang pesannya boleh tampil ke klien. Seluruh pesan
otorisasi/bisnis di controller dipindah ke `throw new ApiException(...)`.

### 2. `App\Exceptions\Handler::render()`

Pemetaan (urutan penting — yang pertama cocok menang):

| Exception | Status | Body |
|---|---|---|
| `ApiException` | `$e->status()` | `{success:false, message:$e->getMessage(), errors:$e->errors()}` |
| `ValidationException` | 422 | `{success:false, message:"Data yang diberikan tidak valid.", errors:$e->errors()}` |
| `AuthenticationException` | 401 | `{success:false, message:"Unauthenticated."}` |
| `AuthorizationException` + Spatie `UnauthorizedException` | 403 | `{success:false, message:"Anda tidak memiliki izin untuk aksi ini."}` |
| `ModelNotFoundException` / `NotFoundHttpException` | 404 | `{success:false, message:"Data tidak ditemukan."}` — **tanpa FQCN/id** |
| `ThrottleRequestsException` | 429 | `{success:false, message:"Terlalu banyak permintaan. Coba lagi nanti."}` |
| `MethodNotAllowedHttpException` | 405 | `{success:false, message:"Metode tidak diizinkan."}` |
| `HttpExceptionInterface` lain | status asli | `{success:false, message:"Permintaan tidak dapat diproses."}` |
| `Throwable` lain | 500 | `{success:false, message:"Terjadi kesalahan pada server."}` |

`Handler::register()` menambah `reportable` yang mencatat `['exception' => $e]`
(trace utuh) untuk status ≥ 500, dengan `Log::error`. Tidak ada `getMessage()`
mentah untuk status 500.

Tambahan wajib:

- `shouldRenderJsonWhen()` → true untuk `$request->is('api/*')` **atau**
  `$request->expectsJson()`, sehingga aplikasi API-only tidak pernah jatuh ke
  halaman HTML/redirect.
- Hormati `APP_DEBUG`: saat `true`, detail boleh ditambahkan pada kunci `debug`
  **hanya** untuk lingkungan non-production; pada `APP_DEBUG=false` tidak ada
  tambahan apa pun.

### 3. `app/Http/Middleware/Authenticate.php`

`redirectTo()` → `return null;` (tidak ada route `login`; API-only). Menghilangkan
`RouteNotFoundException` → 500 untuk klien tanpa header JSON.

### 4. `app/Http/Middleware/SecurityHeaders.php`

Header keamanan harus terpasang pada **semua** respons termasuk error. Pindahkan
penerapan ke `RequestHandled` event di `AppServiceProvider::boot()`, atau bungkus
dengan `try/finally`; jangan mematikan middleware.

### 5. Transisi state invalid (H1)

`IlluminateChangeManagementRepository::transitionPackage()` melempar
`InvalidArgumentException` yang lolos jadi 500. Ganti menjadi
`ApiException("Cannot transition…", 409)` **atau** tangkap di controller dan
petakan ke 422. **Keputusan spec: `ApiException` dengan status 422** — konsisten
dengan WFH state machine dan ~30 assertion 422 yang sudah ada; 409 tidak dipakai
di API ini.

### 6. `UserController::import()` (M5)

- `catch (\Throwable)` → pisahkan: error validasi file (Excel) → `ApiException` 422
  berpesan "Import gagal. Silakan periksa format file."; error infrastruktur
  (DB/IO) → lempar ulang agar Handler menghasilkan 500.
- `Log::error('User import failed', ['exception' => $e])`.

### 7. Template deploy (H2)

- `.env.example:4` → `APP_DEBUG=false` + komentar "set true hanya di lokal".
- `docker-compose.yml:12` → `APP_DEBUG: "true"` dipindah ke
  `docker-compose.override.yml` (file baru, di-gitignore? **tidak** — commit,
  karena harness dev) atau diganti `${APP_DEBUG:-false}`. **Keputusan:**
  `${APP_DEBUG:-false}` di compose utama + dokumentasi di README.
- `$dontFlash` ditambah `code`, `reset_token`.

### 8. Endpoint `SettingController::update` not-found

Pindahkan ke `ApiException(..., 404)` — konsisten dengan modul `envelope`.

## Out of scope

- Perubahan aturan otorisasi (modul `authorization-consistency`).
- Perubahan bentuk resource domain (modul `dedup-http`).

## Acceptance criteria

1. `grep -rn "getTraceAsString\|var_dump\|\bdd(" app/` → 0.
2. Tidak ada `catch` di `app/` yang mengembalikan `$e->getMessage()` kecuali
   untuk `ApiException`/`DomainException` yang memang pesan klien.
3. `GET /api/admin/users/99999` → 404 body **tidak** memuat `App\Models\User`.
4. `POST /api/changes/{id}/approve` pada paket non-pending → 422, bukan 500.
5. Request tanpa `Accept: application/json` ke route terproteksi → 401 JSON,
   bukan 500/redirect.
6. Respons error 401/403/404/422/500 memuat `X-Content-Type-Options`,
   `X-Frame-Options`, `Referrer-Policy`.
7. `APP_DEBUG=true` + exception tak terduga → body memuat `debug`; dengan
   `false` tidak.
8. `.env.example` `APP_DEBUG=false`; `docker-compose.yml` tidak memaksa `true`.
9. Setiap respons error: `success === false` dan `message` ada.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app php artisan test --compact --filter=SecurityHardeningTest
docker compose run --rm app php artisan test --compact --filter=SegregationOfDutiesTest
# smoke body 404:
docker compose run --rm app php artisan route:list --path=api
```

## Catatan risiko

- `Handler::render()` menyentuh **semua** respons error; lakukan setelah modul
  `envelope` agar body sukses sudah stabil dan diff mudah dibaca.
- `ModelNotFoundException` mapping bisa menyembunyikan id invalid yang diharapkan
  test — periksa assertion `assertNotFound()` yang juga meng-assert body.
