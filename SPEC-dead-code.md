# SPEC-dead-code

> Capability map: `CAPABILITY-MAP.md` → module id `dead-code`. Depends on: —
> Root conventions: `SPEC.md` (wajib dibaca; tidak diulang di sini).

## Objective

Menghapus seluruh simbol mati yang terkonfirmasi audit, tanpa mengubah perilaku
runtime apa pun. Ini modul pertama karena menghapus permukaan yang tidak perlu
sebelum modul lain merapikannya.

## In scope

| ID | Simbol | Aksi |
|---|---|---|
| A1 | `PdfRendererService::download()` (`app/Support/Pdf/PdfRendererService.php:28-35`) | Hapus metode |
| A2 | `RepositoryInterface::restore()` + impl (`Shared/Contracts/RepositoryInterface.php:25`, `app/Repositories/EloquentRepository.php:63-72`) | Hapus dari interface + base |
| A3 | `RepositoryInterface::all()` + impl | Hapus |
| A4 | `RepositoryInterface::paginate()` + impl | Hapus |
| A5 | `RepositoryInterface::findBy()` + impl | Hapus |
| A6 | `UserRepositoryInterface::findByNip()` + impl | Hapus |
| A7 | `UserRepositoryInterface::findByEmail()` + impl | Hapus |
| A8 | `Roles::{ADMIN,KEPALA_BIDANG,KEPALA_TIM,STAF,ALL}` (`app/Support/Constants/Roles.php:7-15`) | **Pakai ulang di seeder** (ganti string hardcoded di `RolePermissionSeeder`, `DemoUsersSeeder`) dan di controller yang membandingkan nama role; sisakan `PROTECTED` |
| A9 | `Setting::flushCache()` (`app/Models/Setting.php:46-49`) | Hapus + hapus pemanggil di `SessionConfigTest.php:119` |
| A10 | `BroadcastServiceProvider` + `routes/channels.php` + baris komentar di `config/app.php:174` + `config/broadcasting.php` bila tak ada pembaca lain | Hapus |
| A11 | Relasi inverse tak terpakai: `Team::users()`, `Field::teams()`, `WfhAttendance::report()`, `WfhReportActivity::report()`, `WfhReportLink::activity()` | Hapus (satu baris masing-masing + import tak terpakai) |
| A12 | Middleware alias `guest` (`Kernel.php:91`) dan `signed` (`:94`) + kelas `RedirectIfAuthenticated`, `ValidateSignature` + `RouteServiceProvider::HOME` (`:19`) | Hapus |
| A13 | `SpikeController` + `resources/views/spike/*` + `routes/web.php:3,6-10` | Hapus total (bukan dinonaktifkan) |
| A14 | `resources/views/welcome.blade.php` | Hapus |
| A15 | `config/change-mgmt.php` (1 key, 1 pemanggil) | Ganti dengan `env('CHANGE_DOC_PREFIX', '9/1.1/114')` di `DocNumberGenerator`; hapus file config |
| A16 | Variabel env scaffold tak terbaca: `REDIS_*`, `MEMCACHED_HOST`, `AWS_*`, `PUSHER_*`, `VITE_PUSHER_*`, `BROADCAST_DRIVER`, `MAIL_HOST/PORT/USERNAME/PASSWORD/ENCRYPTION` | Hapus dari `.env.example`; hapus blok config mati yang hanya dilayani variabel itu (`config/broadcasting.php` sudah dihapus di A10; `config/cache.php` blok memcached; `config/database.php` blok redis bila tak ada klien redis) |

## Out of scope

- `EloquentRepository::{find,create,update,delete}` — tetap (dipakai).
- `SignatureServiceInterface`/`TeamRepositoryInterface` — **dipertahankan**
  (keputusan: boundary substitusi untuk test), bukan dead code.
- `RepositoryInterface::find` — tetap.

## Acceptance criteria

1. `grep -rn` setiap simbol A1–A11 di `app/ routes/ database/ config/ resources/`
   → hanya 0 hit (di luar test yang memang memakai A8 melalui konstanta baru).
2. `RepositoryInterface` tinggal 5 metode: `find`, `create`, `update`, `delete`
   (+ tidak ada metode turunan yang menambah CRUD).
3. `RolePermissionSeeder` dan `DemoUsersSeeder` memakai `Roles::*` (tidak ada
   literal `'admin'`/`'staf'`/`'kepala_tim'`/`'kepala_bidang'` untuk nama role).
4. `routes/web.php` hanya berisi catch-all SPA.
5. `.env.example` konsisten: `MAIL_MAILER=resend` dan **tanpa** variabel SMTP
   scaffold; tidak ada `REDIS_*`/`MEMCACHED_*`/`AWS_*`/`PUSHER_*`.
6. `config/app.php` providers tidak memuat baris komentar provider mati.
7. Suite test penuh hijau (`AGENTS`/`Docs` tidak relevan; test yang menyentuh
   `flushCache`/spike disesuaikan atau dihapus bila menguji kode yang dihapus).

## Verify

```bash
docker compose run --rm app vendor/bin/pint --test
docker compose run --rm app php artisan test --compact
# bukti grep:
grep -rn "PdfRendererService\|->download(" app/ | grep -v render
grep -rn "BroadcastServiceProvider\|channels.php" app/ config/ routes/
grep -rn "flushCache" app/ tests/
grep -rn "SpikeController\|spike\." app/ routes/ resources/
```

## Catatan risiko

- A8 mengubah seeder → jalankan `RolePermissionSeeder` ulang di environment dev;
  test `RefreshDatabase` otomatis aman.
- A10/A13 menghapus file: pastikan tidak ada `use` yang tertinggal (Pint akan
  menangkap import tak terpakai sebagai error bila `--test`).
