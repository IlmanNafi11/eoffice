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

Default admin: `admin@kominfo.go.id` / `password`

## Test
```bash
php artisan test
```

## API Structure
- `/api/auth/*` — Login, me, logout
- `/api/profile/*` — Profile view, update, signature upload
- `/api/admin/users/*` — User CRUD + Excel import
- `/api/wfh/*` — Attendance, reports, approval flow, PDF export
- `/api/changes/*` — Initiation, implementation, review, PDF export
- `/api/admin/wfh/monitoring` — Admin attendance monitoring

## Architecture
- Domain-driven: `app/Domains/{Auth,Organization,Wfh,ChangeManagement}`
- Repository pattern with interfaces for testability
- Cross-cutting services: `app/Support/{Pdf,Signature,QrCode,Import}`
- Spatie RBAC: roles (admin, kepala_tim, staf) + 27 permissions

## PDF Generation
- dompdf + Blade templates replicate government form layouts
- Signature images rendered via `position:absolute` coordinates
- QR codes as inline SVG (bacon/bacon-qr-code)
- Templates: `resources/views/pdf/{wfh-report,change-initiation,change-implementation}.blade.php`

## Config
- `config/wfh.php` — Allowed WFH days (default: Friday)
- Document number prefix: `CHANGE_DOC_PREFIX` env var (default `9/1.1/114`)

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
