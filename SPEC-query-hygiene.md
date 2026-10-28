# SPEC-query-hygiene

> Capability map: `CAPABILITY-MAP.md` → module id `query-hygiene`. Depends on:
> `envelope`, `dedup-http`. Root conventions: `SPEC.md`.

## Objective

Menghilangkan pola "satu query per baris" pada jalur terukur, dan menutup
over-fetching list, tanpa mengubah bentuk respons yang sudah distandarkan.

## In scope

### 1. Import user: preload + batch (`app/Support/Import/UserImport.php`)

Sekarang per baris: `User::where('nip')->exists()` (`:45`),
`User::where('email')->exists()` (`:53`), `Team::where('name')->first()` (`:61`),
lalu di `UserController::import` loop `roleAssignments` melakukan
`User::where('email')->first()` + `assignRole()` (`:162-167`). ≈5 query/baris →
±2500 query untuk 500 baris.

Perbaikan:

- Di awal import (sebelum loop): muat sekali ke memori —
  `$this->existingNips = User::pluck('nip')->flip()`,
  `$this->existingEmails = User::pluck('email')->flip()`,
  `$this->teamIdsByName = Team::pluck('id', 'name')`.
- Cek `isset(...)` alih-alih query.
- `roleAssignments` menyimpan **user id** (dari model yang dibuat), bukan email →
  `UserController` melakukan `User::whereIn('id', $ids)->get()` sekali, lalu
  `assignRole` per user (Spatie tetap menulis; tidak bisa dihindari).
- Jaga pesan error per baris (`Baris N: NIP ... sudah terdaftar`) — hanya sumber
  lookup yang berubah.

### 2. `Setting::prime()` (`app/Models/Setting.php`)

`SettingController::index` (`:14-16`) memanggil `Setting::get($key)` per key
sedangkan `Setting::get` hanya mengisi `$cache` statis (`:15-17`) → SELECT ulang
per key. Tambahkan:

```php
public static function prime(): void
{
    foreach (static::all() as $setting) {
        self::$cache[$setting->key] = static::decode($setting->value);
    }
}
```

`index()` menjadi `Setting::prime()` lalu membaca cache (1 query). Logika decode
diekstrak ke metode privat bersama agar `get()` dan `prime()` identik.

### 3. List report: `withCount` bukan full load

`paginateReportsForUser` (`EloquentWfhRepository.php:41`) dan
`paginateAllReports` (`:51`) memuat `activities.links` + `attendances` penuh,
sedangkan `WfhReportResource` (`:16`) hanya memakai `activities->count()`.

- List: `->withCount('activities')->with(['attendances'])` (attendances tetap
  dibutuhkan resource `:26-33`).
- Detail (`findReportWithRelations`, `:87`) tetap memuat penuh.
- `WfhReportResource`: `activity_count` memakai `activities_count` bila tersedia
  (`whenCounted('activities')`).

### 4. `reorderActivities`: satu UPDATE

`EloquentWfhRepository.php:255-257` loop `where('id')->update()` per id → ganti
satu statement `CASE` atau upsert massal. Pertahankan validasi kepemilikan
(`:247` sudah SELECT) dan `InvalidArgumentException`/`ApiException` lama.

### 5. Eager-load `user.team.field`

`findReportWithRelations` (`:87`) tidak memuat `user.team.field`, padahal
`ReportPdfController.php:60-61` (`$team?->field`) mengaksesnya → 1 query
tersembunyi tiap ekspor PDF personal. Tambahkan `'user.team.field'` ke `with`.

### 6. Rantai `team?->field` berulang

`ReportApprovalController.php:26-27`, `TeamReportController.php:27-28`,
`ReportController.php:57` memuat relasi yang sama secara lazy per request.
Solusi: eager-load `user.team.field` sekali di awal aksi, atau serahkan ke trait
`EnsuresSameField` (modul `dedup-state`) yang menerima field id aktor.
Target: tidak ada lazy-load relasi `team.field` pada jalur approval.

### 7. `updateActivity` link diff

`EloquentWfhRepository.php:205-222` melakukan 1–2 query per link. N kecil —
dipertahankan; jangan menambah kompleksitas demi optimasi yang tak terukur
(YAGNI).

### 8. `addAttachments` batch insert

`EloquentChangeManagementRepository.php:190-197` melakukan satu INSERT per file.
Ganti dengan satu `insert($rows)` (sort_order sudah dihitung sekali di `:188`).

## Out of scope

- Bentuk respons (modul `envelope`), resource (modul `dedup-http`).
- Skema/index database — kebutuhan index baru = **Ask first**.

## Acceptance criteria

1. Test import: query SELECT lookup per baris = 0. Dibuktikan dengan counter
   `DB::listen` yang meng-assert jumlah query tidak tumbuh linear terhadap baris
   (bandingkan import 2 baris vs 6 baris: selisih ≤ jumlah INSERT).
2. `SettingController::index` menghasilkan **1** SELECT settings.
3. `GET /api/wfh/reports` tidak memuat query per activity/link;
   `data[i].activity_count` tetap benar dan sama dengan nilai di detail.
4. `PATCH .../activities/reorder` melakukan tepat 1 UPDATE.
5. Ekspor PDF personal tidak memicu lazy `user.team.field`.
6. Lampiran: satu INSERT untuk N file.
7. Suite penuh hijau.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app php artisan test --compact --filter=UserImportTest
docker compose run --rm app php artisan test --compact --filter=SettingTest
docker compose run --rm app php artisan test --compact --filter=ReportActivitySubResourceTest
docker compose run --rm app vendor/bin/pint --test
```

## Catatan risiko

- `withCount` menghilangkan relasi `activities` yang ter-load → `WfhReportResource`
  wajib memakai `whenCounted()`, kalau tidak akan lazy-load dan justru
  menciptakan N+1.
- Mengubah `roleAssignments` menjadi id user menyentuh
  `tests/Feature/Organization/UserImportTest.php`; perbarui test, jangan hapus.
- Assertion jumlah query rapuh terhadap perubahan internal framework; gunakan
  ambang longgar + assertion arah ("tidak bertambah per baris").
