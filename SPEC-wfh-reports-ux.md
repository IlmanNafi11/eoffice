# SPEC-wfh-reports-ux

> Module id: `wfh-reports-ux` — dari `CAPABILITY-MAP-ux-fixes.md`
> (Phase 0, approved 2026-11-03). Intent: `docs/intent/ux-settings-wfh-rbac.md`.
> Contract: `postman/specs/openapi.yaml` (tag `WFH Reports` — 3 op tersentuh)
> + `routes/api.php:104-113`. Depends on: — (memakai primitif `ui-form-kit`
> yang tertutup: `DateInput`, `Button`; pola adapter string-`DateInput`).

## Objective

Dua perbaikan UX di domain WFH personal:

1. **Tombol "Buat Laporan"** — hari ini tidak ada jalur create di UI sama
   sekali (komentar `WfhReportsPage.tsx:17`: create "menyusul", tidak
   pernah dibuat), padahal semua role sudah punya `wfh.report.create` +
   `wfh.attendance.create` (seeder). Semua karyawan — staf, kepala tim,
   kepala bidang, **admin pun** — harus bisa absen & melapor kegiatan
   WFH-nya sendiri. Admin sama seperti karyawan lain: melapor untuk
   dirinya sendiri; tidak ada jalur laporan atas nama user lain (aturan
   `user_id = aktor` di `ReportController::store` tetap).
2. **Filter tanpa duplikasi** — filter `Tanggal` (DateInput penuh
   Y-M-D) berdampingan dengan filter `Bulan` (MonthInput Y-M) di
   `WfhReportsPage`, dan `date`+`month` di samping `date_from`/`date_to`
   di Monitoring "Semua Laporan", membuat dua input bisa saling
   bertentangan. Bulan dibuang; rentang `date_from`–`date_to` menjadi
   satu-satunya filter tanggal (rentang satu hari = tanggal tunggal).

Success: pemegang `wfh.report.create` menekan satu tombol, memilih
tanggal, dan mendarat di detail laporan untuk isi absensi/kegiatan;
semua filter tanggal di dua halaman berbentuk rentang; `month` tidak
pernah dikirim dari UI lagi.

## Tech Stack

- Frontend: React 19 + TypeScript + Redux Toolkit + Vite; primitif
  `ui-form-kit` existing (`DateInput` adapter string, `Button`, `Card`,
  `Field`).
- Backend: Laravel 12 + Postgres; zona yang tersentuh hanya
  `ReportController::index` (validasi + bounds helper).

## Commands

```
Frontend:
  Dev:         npm run dev
  Test:        npm test               # vitest run all
  Typecheck:   npx tsc --noEmit
  Build:       npm run build
Backend (Docker, host tanpa php):
  Test wfh:    docker compose exec app php artisan test tests/Feature/Wfh
  Satu file:   docker compose exec app php artisan test tests/Feature/Wfh/ReportDateFilterTest.php
  Route list:  docker compose exec app php artisan route:list --path=wfh
```

## Backend Change (satu-satunya di inisiatif ini)

`ReportController::index` — dari:

```php
$validated = $request->validate([
    'date' => ['nullable', 'date'],
    'month' => ['nullable', 'date_format:Y-m'],
]);
$bounds = DateRangeHelper::resolve($validated['date'] ?? null, $validated['month'] ?? null);
```

menjadi (precedence `date_from`/`date_to` > `date`/`month` > no filter —
persis pola `resolveAdminBounds` yang sudah ada, diekstrak jadi helper
bersama agar tidak diduplikasi):

```php
$request->validate([
    'date'      => ['nullable', 'date'],
    'month'     => ['nullable', 'date_format:Y-m'],
    'date_from' => ['nullable', 'date'],
    'date_to'   => ['nullable', 'date'],
]);
$bounds = $this->resolveBounds($request);
```

`paginateReportsForUser` **tidak berubah** — signature `$filters` dan
`applyDateRangeFilter` sudah menerapkan `date_from`/`date_to`.

Kontrak `openapi.yaml` diperbarui di tempat yang sama (deskripsi
`GET /api/wfh/reports` + schema query): `date_from`/`date_to` masuk,
perilaku default tetap "semua laporan user".

**`month` di backend tidak dihapus** (versi API tetap, klien lama aman);
yang dihapus adalah konsumsinya dari UI.

## Project Structure

```
app/Domains/Wfh/Http/Controllers/ReportController.php   → validasi + bounds index personal
app/Support/Dates/DateRangeHelper.php                   → + helper bounds dari request (bersama adminIndex)
postman/specs/openapi.yaml                              → query params GET /wfh/reports
tests/Feature/Wfh/ReportDateFilterTest.php              → case date_from/date_to personal
resources/js/api/types.ts                               → ListWfhReportsQuery += date_from/date_to
resources/js/store/wfhSlice.ts                          → fetchWfhReports query (sudah generik; cek)
resources/js/pages/wfh/WfhReportsPage.tsx               → tombol create + filter rentang, MonthInput keluar
resources/js/pages/wfh/WfhReportsPage.test.tsx          → test tombol + filter
resources/js/pages/wfh/MonitoringPage.tsx               → buang month+date tunggal tab reports, MonthInput keluar
resources/js/pages/wfh/MonitoringPage.test.tsx          → sesuaikan filter test
```

Tidak ada file/route baru di frontend: create = dialog kecil di
`WfhReportsPage` (DateInput + tombol buat → `createWfhReport` → navigate
`/wfh/{id}`, pola get-or-create: respons 200 "sudah ada" tetap navigate).

## Code Style

Mengikuti konvensi modul WFH existing (pesan UI Indonesia, typed hooks,
adapter string, gouge testid `data-testid`):

```tsx
// Tombol create — gate permission sintetik, bukan role name (konvensi SPEC-admin).
{can(user, "wfh.report.create") && (
  <Button data-testid="wfh-create-button" onClick={() => setOpen(true)}>
    <Plus aria-hidden="true" className="size-4" /> Buat Laporan
  </Button>
)}

// Alur get-or-create: 200 (sudah ada) maupun 201 (baru) → navigate ke detail.
const report = await createWfhReport({ report_date: date });
navigate(`/wfh/${report.id}`);
```

Tag komentar menjelaskan kontrak (`openapi`Section/pesan server), bukan
naratif. Error server (mis. 422 "Hari ini bukan hari WFH") dirender apa
adanya, tidak pernah ditelan.

## Testing Strategy

- Vitest + RTL, `*.test.tsx` di samping modul (konvensi repo).
- Backend: PHPUnit feature test diperluas di `ReportDateFilterTest`
  (personal `date_from`/`date_to`: rentang, satu hari, precedence atas
  `date`, invalid 422) — pola case admin di `AdminReportFilterValidationTest`.
- Frontend unit wajib:
  - `WfhReportsPage.test.tsx` — tombol create ada bila memegang
    `wfh.report.create` dan hilang bila tidak; alur create mem-post
    `{report_date}` dan navigate ke detail; respons get-or-create 200
    tetap navigate; filter kirim `date_from`+`date_to`, TIDAK pernah
    `month`/`date`.
  - `MonitoringPage.test.tsx` — filter tab reports kirim rentang saja;
    `month` tidak ada lagi di query.
- Test echo/wiring dilarang (konvensi repo); tiap test mengunci perilaku
  kontrak.
- E2E manual (real browser, `DemoUsersSeeder`): login staf → Buat
  Laporan → isi absensi + kegiatan → submit → muncul di daftar; login
  admin → alur yang sama untuk dirinya; Monitoring "Semua Laporan"
  filter rentang. Terdokumentasi di commit message.
- Sistem test existing yang diketahui sensitif filter (`PaginationMetaTest`,
  `UnifiedReportTest`, test FE `wfh.test.ts` list query) dijalankan penuh
  — perubahan query personal tidak boleh meregangkan mereka.

## Boundaries

**Always:**
- Samakan query/payload dengan `openapi.yaml` + `routes/api.php` sebelum
  menulis kode; ubah ketiganya dalam satu commit yang sama.
- Precedence bounds personal == admin (`date_from/to` > `date`/`month` > all).
- Tombol create digate `can(user, "wfh.report.create")` — permission
  sintetik, bukan role name.
- Error server dirender apa adanya, tak lenyap saat refetch (regresi `a602c46`).

**Ask first:**
- Menghapus validasi/query param `date`/`month` dari backend (breaking
  kontrak klien lama) — di luar scope; minta sebelum menyentuh.
- Mengubah signature `paginateReportsForUser`/repository.
- Menambah dependency baru.

**Never:**
- Parameter `user_id` di `StoreReportRequest` atau jalur laporan atas
  nama user lain (intent terkunci).
- Meng-gate tombol create by role (hardcode `admin`/`staf`).
- Mengirim `month` dari UI mana pun setelah modul ini.
- Menyentuh approval flow/team-reports/monitoring board yang tidak
  disebut di Project Structure.

## Success Criteria (re-runnable)

1. `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm test` hijau
   (termasuk test existing yang tidak disentuh).
2. Docker PHPUnit: `php artisan test tests/Feature/Wfh` hijau dengan
   case range personal baru; `AdminReportFilterValidationTest` pass
   unmodified.
3. Tombol "Buat Laporan" tampak untuk user dengan `wfh.report.create`
   (staf/kepala tim/kepala bidang/admin dari seeder) dan hilang tanpa itu.
4. Grep audit: tidak ada `MonthInput` di `WfhReportsPage`/`MonitoringPage`;
   query yang dikirim UI tidak pernah memuat `month=`.
5. E2E manual dua peran (staf + admin personal) terdokumentasi.

## Open Questions

1. Tanggal default dialog create: hari ini (saya pakai ini) atau kosong?
   Harus tetap bisa dipilih mundur untuk pelaporan terlambat — konfirmasi
   saat build bila mau kosong.
