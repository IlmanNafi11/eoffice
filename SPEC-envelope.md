# SPEC-envelope

> Capability map: `CAPABILITY-MAP.md` → module id `envelope`. Depends on: —
> Root conventions: `SPEC.md`.

## Objective

Menetapkan **satu** kontrak respons HTTP untuk seluruh API, menggantikan 4 bentuk
envelope dan 3 bentuk pagination yang ada, serta mengganti resolusi model manual
dengan route-model binding. Modul ini adalah fondasi modul lain, jadi harus
selesai sebelum `error-contract`, `authorization-consistency`, `dedup-*`.

## Kontrak final

### Sukses baca (200)

```json
{ "success": true, "data": { }, "message": null, "meta": null }
```

`data` boleh objek, array resource, atau `null`. `meta` hanya untuk list berhalaman.

### Sukses buat (201)

```json
{ "success": true, "data": { }, "message": "User berhasil dibuat." }
```

### Sukses hapus (204)

Tanpa body. Header tidak memuat `Content-Type: application/json`.

### Sukses mutasi non-buat (200)

```json
{ "success": true, "data": { }, "message": "Profil berhasil diperbarui." }
```

### Error (4xx/5xx)

```json
{ "success": false, "message": "Pesan yang aman ditampilkan.", "errors": null }
```

`errors` hanya untuk 422 validasi: `{ "field": ["pesan"] }`. **Tidak ada** kunci
lain. Tidak ada `trace`, `exception`, `file`, `line`, atau nama kelas model.

### List berhalaman (200)

```json
{
  "success": true,
  "data": [ ],
  "meta": { "current_page": 1, "last_page": 3, "per_page": 15, "total": 42 }
}
```

Empat kunci `meta` **selalu** ada, urutan tidak dipentingkan. `per_page` wajib
ada di sini (sebelumnya hanya `/changes` yang memuatnya).

## In scope

1. **`app/Support/Http/ApiResponse.php`** — kelas final dengan `ok()`, `created()`,
   `deleted()`, `paginated()`, `fail()`. Semua mengembalikan tipe yang tepat
   (`JsonResponse` / `Response` untuk 204).
2. **Ganti seluruh `response()->json(...)` di `app/`** dengan helper tersebut,
   kecuali di `app/Exceptions/Handler.php` (modul `error-contract`) dan respons
   non-JSON (stream PDF).
3. **`per_page` clamp seragam**: `min(max((int) input('per_page', 15), 1), 100)`
   di semua endpoint list. `/changes` (`ChangePackageController.php:34`) saat ini
   tanpa clamp → diperbaiki.
4. **Route-model binding sungguhan.** Ubah tanda tangan controller agar memakai
   model yang di-type-hint, dan hapus `find()`/`findOrFail()` manual:

   | Route (`routes/api.php`) | Sekarang | Menjadi |
   |---|---|---|
   | `/admin/users/{user}` (`:52-54`) | `int $id` + `find()` | `User $user` |
   | `/wfh/reports/{report}` (`:81-83`) | `int $id` + `find()` | `WfhReport $report` |
   | `.../submit|approve|reject|revise` (`:103-108`) | `int $id` + `find()` | `WfhReport $report` |
   | `/wfh/reports/{report}/pdf` (`:116`) | `int $id` + `findReportWithRelations` | `WfhReport $report` (eager-load relasi di controller/service) |
   | `/admin/wfh/team-reports/{id}/approve|reject` (`:128-129`) | `int $id` + `find()` | `WfhTeamReport $report` |
   | `/changes/{id}` dkk (`:136-153`) | `int $id` + `findPackage()` | tetap `int $id` **hanya bila** `findPackage` memuat relasi khusus; kalau tidak, `ChangeInitiation $package` |
   | `/admin/roles/{id}/permissions` (`:63`) | `int $id` + `Role::find()` | `{role}` + `Role $role` |

   Bila binding dipakai, 404 otomatis dari framework dan **bentuk body-nya
   dinormalisasi oleh modul `error-contract`** (bukan dibiarkan FQCN).
5. **`POST /wfh/reports`**: jalur get-or-create mengembalikan **200** dengan
   `data` laporan yang sudah ada; jalur buat baru **201**. Perbedaan status
   dipertahankan (bukan bug) tapi didokumentasikan di pesan/response.
6. **`/admin/wfh/team-reports`** (index admin & user): ganti paginator mentah
   dengan `ApiResponse::paginated(...)` + `TeamReportResource` baru.
7. **`/admin/settings`, `/admin/settings/{key}`, `/wfh/session-config`**: tambah
   `success`. `PUT /admin/settings/{key}` untuk key tidak ada → **404** (bukan 422).
8. **`POST /changes/{id}/attachments`**: kembalikan koleksi terbungkus
   `ImplementationResource`-style (`url` + `path`), bukan koleksi Eloquent mentah.

## Out of scope

- Pemetaan exception → envelope (modul `error-contract`).
- Perbaikan guard/urutan otorisasi (modul `authorization-consistency`).
- Penggabungan resource user (modul `dedup-http`).
- Bentuk resource per-domain (hanya wrapper-nya yang distandarkan di sini).

## Acceptance criteria

1. `grep -rn "response()->json(" app/` → 0 hit di luar `ApiResponse.php` dan
   `Handler.php`.
2. Tidak ada `return response()->json($paginator)` di mana pun.
3. Semua endpoint list mengembalikan `meta` dengan **tepat** 4 kunci.
4. `per_page` di setiap endpoint list dibatasi 1..100 (test: `per_page=1000` →
   `meta.per_page == 100`; `per_page=0` → 1 atau fallback 15, pilih **clamp ke 1**).
5. Semua DELETE mengembalikan 204 tanpa body (test `assertNoContent()`).
6. Parameter route model memakai type-hint model; `grep -c "int \$id"` di
   `app/Domains/*/Http/Controllers/` = 0 kecuali controller non-model.
7. `GET /admin/wfh/team-reports` mengembalikan `success` + `meta` 4 kunci.
8. `PUT /admin/settings/nonexistent` → 404 dengan `success:false`.
9. Suite penuh hijau; test yang mem-pin bentuk lama diperbarui.

## Verify

```bash
docker compose run --rm app php artisan test --compact
docker compose run --rm app vendor/bin/pint --test
grep -rn "response()->json(" app --include=*.php | grep -v ApiResponse.php | grep -v Handler.php
grep -rn "int \$id" app/Domains/*/Http/Controllers/*.php
curl -s -H "Authorization: Bearer $TOKEN" localhost:8000/api/admin/users | jq '.meta'
```

## Catatan risiko

- Mengubah binding menyentuh banyak test yang meng-assert 404 manual. Assertion
  status 404 dipertahankan; body disesuaikan.
- `ReportController::store` punya dua jalur status (200/201) yang di-pin
  `tests/Feature/Wfh/ReportDateFilterTest.php` dsb. — cek sebelum mengubah.
