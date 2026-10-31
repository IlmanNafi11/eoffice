# WFH & Change Management Backend — Kominfo Jatimprov

Backend API for Kominfo Jatimprov with two modules:
1. **WFH Module** — Attendance + activity reporting with PDF export
2. **Change Management Module** — Change initiation + implementation approval workflow with PDF export

## Tech Stack
- PHP 8.2+ / Laravel 11
- PostgreSQL 15+
- Spatie Permission (RBAC)
- dompdf (PDF generation)
- Intervention Image (signature normalization)
- Maatwebsite Excel (bulk import)
- Bacon QR Code (document verification)
- Docker / Docker Compose (dev environment)
- Makefile (command gateway)

## Requirements
PHP extensions (MANDATORY):
```
ext-pdo_pgsql, ext-gd, ext-mbstring, ext-xml, ext-dom, ext-zip
```

## Quick Start

```bash
make lint           # Check code style (Pint)
make test           # Run test suite
make ci             # Lint + test + build check
```

## Docker Development

Menjalankan environment development tanpa install PHP/PostgreSQL manual:

```bash
docker compose up -d

# Jalankan command di container app:
docker compose exec app composer install
docker compose exec app cp .env.example .env
docker compose exec app php artisan key:generate
docker compose exec app php artisan migrate
docker compose exec app make test
```

PostgreSQL container exposed di host port `5433` (hindari konflik dengan local postgres).

## Setup

> **Docker users:** Skip this section, gunakan `docker compose exec app` commands di section Docker Development.

```bash
composer install
cp .env.example .env
php artisan key:generate

# Configure PostgreSQL in .env:
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=kominfo_wfh
DB_USERNAME=your_user
DB_PASSWORD=your_password

php artisan storage:link
php artisan migrate
php artisan db:seed --class=RolePermissionSeeder
php artisan db:seed --class=ChangeTypeSeeder
php artisan db:seed --class=AdminUserSeeder
```

Default admin: `admin@kominfo.go.id`. Password-nya diambil dari `APP_ADMIN_PASSWORD`; jika variabel itu
kosong, seeder membuat password acak dan mencetaknya **sekali** ke stdout. Akun admin hasil seeder selalu
memiliki `must_change_password=true`, jadi password tersebut wajib diganti saat login pertama.

## Test
```bash
php artisan test
```

## API Structure
- `/api/auth/*` — Login, me, logout
- `/api/profile/*` — Profile view, update, signature upload
- `/api/signatures/{user}` — Authorized e-signature image (owner, `user.manage`, or `kepala_*` of the same bidang)
- `/api/admin/users/*` — User CRUD + Excel import
- `/api/wfh/*` — Attendance, reports, approval flow, PDF export
- `/api/changes/*` — Initiation, implementation, review, PDF export
- `/api/admin/wfh/monitoring` — Admin attendance monitoring

## Architecture
- Domain-driven: `app/Domains/{Auth,Organization,Wfh,ChangeManagement}`
- Repository pattern with interfaces for testability
- Cross-cutting services: `app/Support/{Pdf,Signature,QrCode,Import}`
- Spatie RBAC: roles (admin, kepala_bidang, kepala_tim, staf) + granular permissions

## PDF Generation
- dompdf + Blade templates replicate government form layouts
- Signature images rendered via `position:absolute` coordinates
- QR codes as inline SVG (bacon/bacon-qr-code)
- Templates: `resources/views/pdf/{wfh-report,change-initiation,change-implementation}.blade.php`

## Private Evidence Storage

Semua bukti disimpan di disk privat (disk `local`) dan **tidak** pernah di-serve sebagai file
statis — `/storage/*` tidak boleh dapat diakses:

| Jenis bukti | Lokasi privat | Cara baca |
|---|---|---|
| Tanda tangan | `storage/app/signatures` | `GET /api/signatures/{user}` |
| Foto absensi WFH | `storage/app/attendances/{user}/{tanggal}` | `GET /api/wfh/reports/{report}/attendances/{attendance}/photo` |
| Lampiran paket perubahan | `storage/app/change-attachments` | `GET /api/changes/{id}/attachments/{attachment}` |

Setiap endpoint memeriksa ulang hak akses per request; melihat URL tidak cukup untuk membaca
berkas. Saat upgrade dari versi lama (bukti masih di disk publik), jalankan sekali:

```bash
php artisan media:migrate-private --dry-run   # lihat rencana
php artisan media:migrate-private             # pindahkan + hapus salinan publik
```

Perintah ini idempoten, menangani ketiga jenis bukti sekaligus, dan juga membersihkan
`public/storage/{signatures,attendances,change-attachments}` pada deployment yang menyalin
direktori (bukan symlink) — pembersihan itu rekursif, karena bukti tersimpan bersarang
(`attendances/{user}/{tanggal}/x.jpg`). Perintah lama `signatures:migrate-private` sudah dihapus.
Jalankan sebagai user yang punya izin tulis pada `public/storage/*` (`exit 1` dengan pesan
"sisa di disk publik" berarti ada berkas yang tidak bisa dihapus), lalu verifikasi:

```bash
curl -sI https://<host>/storage/attendances/<user>/<tanggal>/<file>.jpg | head -1   # harus 404
```

## Kebijakan Kata Sandi Default

`SettingsSeeder` hanya menyemai `password_default_admin`/`password_default_user` di environment
`local`/`testing`. Di produksi tidak ada kata sandi default: `DefaultPassword` membuat kata sandi
acak per akun (dicetak sekali di log) sampai operator menyetel nilainya lewat
`PUT /api/admin/settings`, dan setiap akun yang dibuat lewat API/impor ditandai
`must_change_password`. Untuk akun admin bootstrap, set `APP_ADMIN_PASSWORD` (lihat
`AdminUserSeeder`) atau catat kata sandi acak yang dicetak sekali saat seeding.

## Config
- `config/wfh.php` — Allowed WFH days (default: Friday)
- Document number prefix: `CHANGE_DOC_PREFIX` env var (default `9/1.1/114`)

## Health Check

`GET /up` adalah probe untuk orchestrator/load balancer. Tanpa autentikasi, dan
memeriksa koneksi database:

| Kondisi | Status | Body |
|---|---|---|
| Database terjangkau | `200` | `{"status":"ok"}` |
| Database tidak terjangkau | `503` | `{"status":"unavailable"}` |

Probe ini sengaja **tidak** berada di bawah `/api/*` dan tidak memakai envelope
error API: ia milik infrastruktur, bukan klien. Jangan arahkan traffic ke instance
yang menjawab `503`.

## APP_DEBUG

`APP_DEBUG=false` adalah default template (`.env.example` dan `docker-compose.yml`). Debug mode
menambahkan blok `debug` (class, message, file:line) pada response error — kedengarannya berguna saat
development, tetapi kebocoran stack trace di produksi adalah kerentanan keamanan. Untuk troubleshooting
lokal melalui Docker:

```bash
APP_DEBUG=true docker compose up -d
```

atau set `APP_DEBUG=true` di `.env` (host) — `docker-compose.yml` membaca variabel tersebut dengan
fallback `false`. Jangan pernah commit `.env` dengan `APP_DEBUG=true` untuk environment produksi.

## Proses Runtime Wajib (Queue & Scheduler)

`QUEUE_CONNECTION=database` adalah default, dan dua notifikasi bersifat queued:
`ResetPasswordOtpNotification` (kode OTP reset kata sandi) dan
`WfhReminderNotification`. Tanpa worker, OTP tidak pernah terkirim dan pengguna
terkunci dari alur reset kata sandi.

Jadwal juga harus dipicu, karena `SendWfhReminders` didaftarkan `->everyMinute()`:

```bash
# 1) worker notifikasi
php artisan queue:work --tries=3 --timeout=60

# 2) pemicu jadwal (pilih salah satu)
php artisan schedule:work
* * * * * cd /path/app && php artisan schedule:run >> /dev/null 2>&1   # cron
```

Keduanya harus hidup berdampingan dengan web server. `docker-compose.yml` di repo
ini hanya menjalankan `app` + `postgres` untuk pengembangan, bukan topologi
produksi. Jika `MAIL_MAILER=resend` tanpa API key, OTP gagal terkirim — periksa
`MAIL_*` sebelum go-live.

## CI/CD Pipeline

GitHub Actions otomatis menjalankan pemeriksaan berikut per branch:

| Branch | Trigger | Lint | Test | Build Check | Wajib Lulus |
|---|---|---|---|---|---|
| `devs` | Push | ✅ | ✅ | — | — |
| `staging` | PR | ✅ | ✅ | — | ✅ |
| `main` | PR | ✅ | ✅ | ✅ | ✅ |

**Status checks** (digunakan untuk branch protection): `lint`, `test`, `build`.

### Manual: Branch Protection Rules

Setelah workflow pertama kali berjalan, aktifkan branch protection di GitHub:

1. GitHub.com → repository → **Settings** → **Branches** → **Add branch protection rule**

**Rule untuk `staging`:**
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date
- Status checks: `lint`, `test`
- ✅ Include administrators

**Rule untuk `main`:**
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date
- Status checks: `lint`, `test`, `build`
- ✅ Include administrators

Setelah rules aktif, PR dengan status merah **tidak bisa di-merge**. Hanya PR dengan semua status hijau dan base branch yang up-to-date yang bisa di-merge.
