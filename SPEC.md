# Spec: API Hardening & Audit Closeout (eoffice)

> Module ids and build order: `CAPABILITY-MAP.md` (approved 2026-10-28).
> Source intent: `docs/intent/api-hardening-closeout.md`.
> Per-module specs: `SPEC-<module-id>.md`.

## Objective

Menutup **seluruh** temuan audit arsitektur `eoffice` tanpa terkecuali, dalam satu
rangkaian perubahan tanpa shim kompatibilitas. Sasaran akhir: satu kontrak API
tunggal, satu jalur error tunggal, tanpa dead code, tanpa duplikasi guard, dan
tanpa N+1 pada jalur yang terukur.

**User:** tim backend `eoffice`. **Konsumen API:** SPA di repo ini yang belum
diimplementasi → *breaking change* penuh diperbolehkan.

**Success (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | Setiap respons (sukses & error) memuat `success` boolean | Test kontrak baru + grep `response()->json(` di `app/` hanya di `ApiResponse`/`Handler` |
| S2 | Tidak ada `catch` yang mengubah exception non-otoritatif menjadi body HTTP | grep `catch` di `app/`; hanya `ApiException`/`DomainException` yang dipetakan |
| S3 | Setiap route memakai route-model binding untuk parameter model | grep `int $id` di controller = 0 kecuali non-model |
| S4 | Tidak ada respons 500 untuk kondisi yang dapat dipicu user | Test transisi invalid (submit/approve ulang) = 422 |
| S5 | Dead code A1–A11 hilang atau dipakai | grep daftar simbol = 0 hit non-definisi |
| S6 | Klaster duplikasi DRY tertutup | `git grep` pola duplikat = 1 lokasi per aturan |
| S7 | Query per baris pada import & list hilang | Test hitung query (`DB::listen`) |
| S8 | Suite test penuh hijau | `php artisan test --compact` exit 0 |
| S9 | `APP_DEBUG` default aman pada template deploy | grep `.env.example`, `docker-compose.yml` |

## Tech Stack

- PHP `^8.2` (CI memakai 8.4), Laravel `^11.0`
- `laravel/sanctum ^4.0` (Bearer token), `spatie/laravel-permission ^6.25` (RBAC)
- `barryvdh/laravel-dompdf ^3.1` (dev-dep, PDF), `maatwebsite/excel ^3.1` (import)
- `intervention/image ^4.2` (normalisasi tanda tangan), `resend/resend-laravel ^1.4` (email OTP)
- PostgreSQL 15 (produksi & test), PHPUnit 11, Laravel Pint (preset `laravel`)

**Tidak ada dependency baru** dalam initiative ini.

## Commands

Host **tidak** punya `php`/`composer`/`vendor`. Semua perintah lewat Docker
(`docker-compose.yml`, service `app` + `postgres`).

```bash
# Sekali per checkout (vendor masuk ke ./vendor di host via bind mount)
docker compose up -d postgres
docker compose run --rm app composer install --no-interaction --prefer-dist

# Verifikasi utama
docker compose run --rm app vendor/bin/pint --test          # lint (make lint)
docker compose run --rm app php artisan test --compact      # semua test (make test)
docker compose run --rm app php artisan test --compact --filter=SegregationOfDutiesTest
docker compose run --rm app php artisan test --compact tests/Feature/ChangePackageFlowTest.php

# Auto-fix format
docker compose run --rm app vendor/bin/pint

# Container image check (sama dengan CI job build)
docker build --check .

# Tinker terarah
docker compose run --rm app php artisan tinker
```

`phpunit.xml` sudah menyetel `APP_ENV=testing`, `CACHE_DRIVER=array`,
`MAIL_MAILER=array`, `QUEUE_CONNECTION=sync`. `DB_*` datang dari environment
container (`pgsql` → `postgres:5432`).

## Project Structure

```
app/
  Domains/                     → modular monolith, satu folder per domain
    Auth/                      → login, OTP, reset password
      Http/{Controllers,Requests}, Concerns, Services
    ChangeManagement/          → paket perubahan (initiation + implementation)
      Http/{Controllers,Requests,Resources}, Models, Repositories, Services
    Organization/              → user, team, role, permission, profile
    Wfh/                       → laporan WFH, absensi, team report, monitoring
    Shared/Contracts/          → interface lintas domain (RepositoryInterface)
  Exceptions/ApiException.php  → SATU-satunya exception yang boleh jadi body HTTP
  Http/{Controllers,Middleware,Requests}
  Models/                      → User, Team, Field, Setting
  Providers/
  Repositories/EloquentRepository.php  → base CRUD (find/create/update/delete saja)
  Support/                     → Constants, Dates, Http(ApiResponse), Import, Pdf,
                                 QrCode, Signature
routes/api.php                 → SELURUH permukaan API (/api prefix)
routes/web.php                 → hanya catch-all SPA
tests/Feature/                 → test endpoint (per domain: Auth/, Organization/, Wfh/)
tests/Unit/                    → state machine, service, helper
docs/intent/                   → statement of intent (bukan dokumentasi fitur)
CAPABILITY-MAP.md, SPEC*.md    → artefak spec ini
```

Konvensi penempatan yang **wajib** dipertahankan: controller baru untuk domain
X tinggal di `app/Domains/X/Http/Controllers/`, request di `.../Http/Requests/`,
resource di `.../Http/Resources/`, service lintas-domain yang murni teknis di
`app/Support/`.

## Code Style

Laravel Pint preset `laravel`, PSR-12, 4 spasi, trailing comma pada array
multibaris. Nama kelas `PascalCase`, metode `camelCase`, kolom/JSON `snake_case`.
Constructor property promotion untuk dependency. Tanpa `final` (kode existing
tidak memakainya). Komentar bahasa Indonesia untuk pesan pengguna, bahasa
Inggris untuk komentar teknis.

**Pola respons — satu-satunya cara:**

```php
// app/Support/Http/ApiResponse.php
final class ApiResponse
{
    public static function ok(mixed $data = null, ?string $message = null): JsonResponse
    public static function created(mixed $data, string $message): JsonResponse   // 201
    public static function deleted(): Response                                   // 204
    public static function paginated(LengthAwarePaginator $page, string $resource): JsonResponse
    public static function fail(string $message, int $status = 422, ?array $errors = null): JsonResponse
}
```

```php
// Controller: baca
return ApiResponse::ok(new UserResource($user));

// Controller: mutasi
return ApiResponse::created(new UserResource($user), 'User berhasil dibuat.');

// Controller: hapus
return ApiResponse::deleted();

// Controller: aturan bisnis dilanggar (dipetakan Handler, bukan dibangun manual)
throw new ApiException('Hanya paket draft yang dapat disubmit.', 422);
throw new ApiException('Inisiator tidak dapat menyetujui paketnya sendiri.', 403);
```

**Larangan gaya** yang harus tetap dipatuhi setelah perubahan:

```php
// ❌ dilarang: envelope manual
return response()->json(['success' => false, 'message' => '...'], 404);

// ❌ dilarang: mengembalikan teks exception arbitrer
return response()->json(['message' => $e->getMessage()], 500);

// ❌ dilarang: paginator mentah
return response()->json($paginator);
```

## Testing Strategy

- Framework: PHPUnit 11, `RefreshDatabase` untuk Feature test, database PostgreSQL.
- Lokasi: `tests/Feature/**` untuk kontrak HTTP, `tests/Unit/**` untuk state machine,
  service, helper.
- Setup wajib di Feature test yang menyentuh izin:
  `$this->artisan('db:seed', ['--class' => 'RolePermissionSeeder'])`.
- Level yang dipakai:
  - **Unit** — `WfhReportStateMachine`, `TeamReportStateMachine`, `ChangePackage`
    transisi, `DateRangeHelper`, `QrCodeService`, `PasswordResetService`.
  - **Feature** — setiap endpoint: status, `success`, path `data`/`meta`, dan
    perilaku otorisasi (401/403/404/422).
  - **Kontrak** — satu test baru per aturan global: envelope semua endpoint yang
    disentuh, 204 pada DELETE, 404 generik tanpa FQCN, 500 tanpa stack trace.
- Assertion gaya baru: `assertJsonPath('success', true)` + `assertJsonStructure`;
  **jangan** `assertSee`/string-matching body.
- Coverage: tidak ada target persentase; setiap perubahan perilaku wajib punya
  test yang gagal sebelum dan lulus sesudah.
- Tidak ada test baru untuk wiring/forwarding/tautan sepele.

## Boundaries

**Always do**

- Jalankan `php artisan test --compact` sebelum menyatakan slice selesai.
- Pertahankan konvensi yang sudah ada (domain folder, resource, factory, seeder,
  bahasa pesan pengguna Indonesia).
- Pertahankan perilaku otorisasi yang sudah benar: Sanctum + Spatie + guard
  kepemilikan di controller.
- Perbarui test yang mem-pin perilaku lama; assertion dipertahankan, nilai
  status/envelope disesuaikan dengan kontrak baru.
- Jaga agar setiap respons JSON berbentuk satu kontrak (`success` selalu ada).

**Ask first**

- Perubahan skema/tabel database, atau migrasi baru.
- Menambah dependency composer/npm.
- Mengubah `phpunit.xml`, `docker-compose.yml` service, atau matrix CI.
- Menghapus permission yang masih dirujuk route/controller.
- Mengubah aturan bisnis (bukan representasinya) — mis. siapa boleh approve.

**Never do**

- Menambah shim/alias/endpoint kompatibilitas mundur atau parameter `legacy`.
- Menyisakan `TODO`, stub, fallback palsu, atau kode mati baru.
- Mengembalikan teks exception arbitrer (`$e->getMessage()` diluar
  `ApiException`/`DomainException`) ke body HTTP.
- Menonaktifkan/menghapus test tanpa menggantinya dengan test perilaku baru.
- Menyentuh `vendor/`, `.git/`, atau file rahasia.
- Mematikan `SecurityHeaders` atau melemahkan `throttle:auth` demi test.
