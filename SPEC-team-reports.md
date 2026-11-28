# SPEC: Laporan Tim — Detail, Filter, dan Toggle Tema

> Capability map (Phase 0, approved 2026-11-27): tiga modul — `wfh-team-report-filters`,
> `wfh-team-report-detail`, `theme-modes`. Build order: filters → detail; theme-modes
> independen. Tiap modul punya suite test sendiri dan bisa dinilai terpisah.
>
> Intent & keputusan yang disetujui: `docs/superpowers/specs/2026-11-25-team-reports-detail-filter-theme-design.md`
> (approved 2026-11-25, builder check selesai).
> Rencana implementasi TDD (9 task): `docs/superpowers/plans/2026-11-25-team-reports-detail-filter-theme.md`.
> Kontrak API: `postman/specs/openapi.yaml` (tag `WFH Team Reports`).
>
> Catatan penamaan root: `SPEC.md` sebelumnya berisi spec Dashboard Beranda; dipindah ke
> `SPEC-dashboard.md`, lalu root dipakai spec ini hingga closeout — kini dipindah ke
> `SPEC-team-reports.md` (root `SPEC.md` = WFH UX remediation + QR cut-off, 2026-11-28).
> Module id `wfh-team-reports` di `CAPABILITY-MAP-frontend.md` tetap
> CLOSED — modul di spec ini adalah kelanjutannya, bukan penulisan ulang.

## Capability Map

| Module id | Tanggung jawab | Depends on | Backend change | Selesai bila |
|---|---|---|---|---|
| `wfh-team-report-filters` | List Laporan Tim menerima filter status/rentang tanggal/tim, scope peran tidak melonggar; dropdown filter tunggal di header card `/team-reports` | — | Ya: validasi + query filter di `TeamReportController::index`, `openapi.yaml` | `TeamReportFilterTest` hijau; filter & pagination diuji di `TeamReportsPage.test.tsx` |
| `wfh-team-report-detail` | Halaman detail laporan tim (`/team-reports/:id`) dengan approve/reject ber-alasan dan unduh PDF; action Detail + Unduh PDF di list; admin boleh unduh PDF lintas bidang | `wfh-team-report-filters` (berbagi `TeamReportsPage.tsx`, `wfhTeamSlice.ts`, `api/types.ts`) | Ya: `GET /admin/wfh/team-reports/{report}`, repo `getTeamReportDetailData`, `TeamReportDetailResource`, guard `exportTeam`, `openapi.yaml` | `TeamReportShowTest` + `PdfExportGuardsTest` hijau; `TeamReportDetailPage.test.tsx` hijau; smoke browser admin |
| `theme-modes` | Toggle Terang/Gelap/Sistem di header (kiri dropdown user), persist, ikut OS pada mode Sistem, tanpa flash saat reload | — | Tidak | `theme-toggle.test.tsx` + `AppShell.test.tsx` hijau; smoke visual dark di halaman utama |

**Alasan urutan:** filter bisa dikirim dan divalidasi tanpa endpoint detail; detail butuh
kontrak baru + guard PDF sendiri sehingga mengikuti filter. Tema tidak menyentuh backend
dan tidak berbagi berkas dengan dua modul lain — boleh kapan saja, dijadwalkan terakhir
di plan hanya karena urutan task.

## Objective

Menu **Laporan Tim** (`/team-reports`) hari ini hanya daftar ringkas: approver memutuskan
approve/reject dari satu baris (tim, tanggal, status, pembuat) tanpa bisa melihat isi
laporan, unduh PDF hanya tersedia di Monitoring, dan daftar tidak bisa disaring. Selain
itu aplikasi tidak punya kontrol tema: `app.css` sudah memuat blok `.dark`, tetapi tidak
ada kode yang men-set class `dark`, sehingga UI praktis selalu terang apa pun setelan
perangkat.

Target pengguna:

| Role | Permission Laporan Tim | Yang dibutuhkan |
|---|---|---|
| admin | view/create/approve/reject + `wfh.report.export_pdf` | semua laporan semua bidang, detail, unduh PDF lintas bidang, filter |
| kepala bidang | view/approve/reject + `wfh.report.export_pdf` | laporan se-bidang, detail untuk memutuskan, filter, unduh PDF |
| kepala tim | view + `wfh.report.export_pdf` | laporan timnya, detail read-only, filter (tanpa aksi transisi) |
| staf | — | tanpa akses (403; menu disembunyikan) — tidak berubah |
| semua role login | — | toggle tema Terang/Gelap/Sistem di header |

**Success = semua kondisi ini benar:**

1. `/team-reports` punya satu tombol filter di header card; memilih status, tim, dan/atau
   rentang tanggal lalu "Terapkan" mengirim query yang sesuai dan kembali ke halaman 1.
   Pagination dan per-halaman mempertahankan filter aktif.
2. Filter tidak pernah memperluas scope: kepala tim yang memilih tim lain mendapat data
   kosong, bukan kebocoran; kepala bidang di luar bidangnya juga kosong; admin bebas.
3. Setiap baris punya aksi **Detail** (navigasi `/team-reports/:id`) dan **Unduh PDF**
   (gate `wfh.report.export_pdf`), tanpa mengubah tombol approve/reject yang ada.
4. `/team-reports/:id` memuat data lewat endpoint (aman untuk refresh/deep-link) dan
   menampilkan: tim, tanggal, status, pembuat, supervisor, alasan penolakan (bila
   `rejected`), tombol Unduh PDF, serta satu kartu per anggota aktif berisi status laporan
   personal, absensi per sesi (foto bukti), dan kegiatan (jam, teks, tautan).
5. Status `pending` + permission menampilkan Setujui dan Tolak di halaman detail; Tolak
   wajib alasan (dialog, tombol mati saat kosong/spasi); sukses memicu refetch dan status
   berubah di tempat. Tanpa permission, tombol tidak dirender sama sekali.
6. Admin dapat mengunduh PDF tim milik bidang mana pun (200); non-admin lintas bidang tetap
   403 dengan pesan server; konten PDF tidak berubah sedikit pun.
7. Header menampilkan toggle tema (ikon + menu Terang/Gelap/Sistem) tepat di kiri dropdown
   user. Memilih Gelap menambahkan class `dark` pada `documentElement`, Terang
   menghapusnya, Sistem mengikuti `prefers-color-scheme` dan ikut berubah saat OS berganti.
8. Pilihan tema bertahan setelah reload dan diterapkan sebelum paint (tidak ada kilatan
   terang→gelap), dan toast (`sonner`) ikut tema aktif.

## Scope

### `wfh-team-report-filters`

Backend:

- `GET /api/admin/wfh/team-reports` menerima query opsional `status`
  (`draft|pending|approved|rejected`), `date_from`, `date_to` (`date`, inklusif kedua
  batas), `team_id` (integer, `exists:teams,id`) — selain `per_page`/`page` yang sudah ada.
- Validasi ketat: status tak dikenal / `team_id` non-numerik / tim tak exist → 422 (bukan
  500), mengikuti preseden `AdminReportFilterValidationTest`.
- Filter berlapis di atas scope yang ada (admin semua; non-admin bidang; kepala bidang
  semua tim bidang; kepala tim/staf tim sendiri).

Frontend:

- Dropdown filter tunggal di `CardAction` header card daftar, port pola Monitoring tab
  Semua Laporan (`ListFilter` + `DropdownMenu modal={false}` + `onInteractOutside` guard
  popover/select; Field Status/Tim/Dari tanggal/Sampai tanggal; tombol Terapkan).
- Filter lokal sampai Terapkan; `date_from`/`date_to` diteruskan apa adanya bila terisi
  (pola Monitoring), `per_page` default tidak dikirim.
- Dropdown Tim memakai `listTeams()` dan tersedia untuk semua pemegang `view` (bukan hanya
  pemegang `create`).

### `wfh-team-report-detail`

Backend:

- `GET /api/admin/wfh/team-reports/{report}` (`permission:wfh.team_report.view`) →
  envelope `ApiResponse::ok` berisi field `TeamReportResource` + `members[]`.
- Scope: admin semua; non-admin tanpa bidang → 422 "User tidak terhubung dengan bidang
  manapun."; lintas bidang → 403 "Laporan tidak berada dalam bidang Anda."; kepala tim di
  luar timnya → 403 pesan sama.
- `WfhRepositoryInterface::getTeamReportDetailData(int $teamId, string $date): array` —
  per anggota aktif: `user_id, name, nip, report_id|null, report_status|null`,
  `activities[{id,start_time,end_time,activity,links[]}]`,
  `attendances[{id,session,photo_url|null}]`.
- Laporan personal ganda per anggota per tanggal (alur no-revision: `rejected` + laporan
  baru; partial unique index hanya melarang dua draft/rejected): pilih laporan live
  terbaru — `pending|approved` di atas `draft|rejected`, lalu `updated_at` terbaru.
  Absensi milik laporan lain tidak dirender.
- `photo_url` = route `attendances.photo` (`PrivateMediaPath::attendanceUrl`) untuk absensi
  laporan terpilih; endpoint foto yang ada tidak diubah (guard-nya tetap).
- `getTeamReportData` (dipakai PDF) dan `WfhReportPdfData::forTeam` **tidak diubah**.
- `ReportPdfController::exportTeam`: role admin (`Roles::ADMIN`) boleh mengekspor tim dari
  bidang mana pun; non-admin aturan lama (own team boleh, tim tetangga butuh
  `wfh.monitoring.view`, lintas bidang 403). Konten PDF byte-identical.
- `openapi.yaml`: parameter filter pada op list, op `getWfhTeamReport`, schema
  `WfhTeamReportDetail` + `WfhTeamReportMember`.

Frontend:

- `api/types.ts`: `ListTeamReportsQuery` + filter; `WfhTeamReportDetail`,
  `WfhTeamReportMember`.
- `api/wfh-team.ts`: `getWfhTeamReport(id)`; `listWfhTeamReports` meneruskan filter.
- `wfhTeamSlice`: state `detail {data,status,error}`, thunk `fetchWfhTeamReportDetail`,
  selektor; approve/reject sukses me-refetch list (sudah ada) dan detail aktif.
- `pages/wfh/TeamReportDetailPage.tsx` di route `/team-reports/:id`: header (tim, tanggal,
  badge status, pembuat, supervisor, alasan reject), tombol Unduh PDF
  (`wfh.report.export_pdf`), kartu anggota dengan foto via `fetchAttendanceObjectUrl`,
  footer Setujui/Tolak (dialog alasan wajib, pola list), back link ke `/team-reports`.
- `TeamReportsPage`: aksi Detail + Unduh PDF per baris
  (`exportTeamWfhPdf(team_id, {date: report_date, team_report_id: id})`, nama unduhan
  `WFH-Team-{teamId}-{date}.pdf`).

### `theme-modes`

- `next-themes ^0.4.6` sudah menjadi dependency dan sudah dipakai `components/ui/sonner.tsx`
  (`useTheme()`), jadi tidak ada dependency baru; memakainya menyatukan class `dark` dengan
  warna toast.
- `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`,
  `storageKey="theme"`, `disableTransitionOnChange`) membungkus app di `app.tsx`.
- `components/layout/theme-toggle.tsx`: Button ghost berikon (Sun/Moon/Monitor) + menu
  Terang/Gelap/Sistem, `aria-label="Tema"`, `data-testid="theme-toggle"`; dirender di
  `Header.tsx` di dalam grup `ml-auto` sebelum dropdown user.
- Script inline kecil di `resources/views/app.blade.php` (`<head>`, sebelum `@vite`) yang
  menerapkan tema dari `localStorage` + `matchMedia` sebelum bundle berjalan (anti-flash).

## Tech Stack

Backend (existing, tanpa dependensi baru):

- PHP `^8.2` (host: 8.4.28), Laravel `^12.69`, Sanctum, `spatie/laravel-permission`.
- Domain `app/Domains/Wfh/` (controller, repository, resource sudah ada).
- Envelope `App\Support\Http\ApiResponse` (`ok`/`paginated`/`fail`).

Frontend (existing, tanpa dependensi baru):

- React `^19`, Vite, Redux Toolkit, TypeScript, Vitest + jsdom, Tailwind v4 + shadcn.
- `next-themes ^0.4.6` (sudah terpasang), `sonner` (sudah terpasang).
- Primitif yang dipakai ulang: `Card`, `Button`, `Dialog`, `DropdownMenu`, `Select`,
  `DateInput`, `Skeleton`, `WfhStatusBadge`, `Pagination`, `PdfDownloadButton`.

## Commands

Dari root repo:

```
# Backend — modul ini
vendor/bin/phpunit --filter TeamReportFilterTest
vendor/bin/phpunit --filter TeamReportShowTest
vendor/bin/phpunit --filter PdfExportGuardsTest
vendor/bin/phpunit --filter TeamReportTest
vendor/bin/phpunit --filter TeamReportPdfTest     # konten PDF tidak berubah

# Backend — penuh & lint
php artisan test --compact
vendor/bin/pint --test
make lint

# Frontend
npm test -- resources/js/api/wfh-team.test.ts resources/js/store/wfhTeamSlice.test.ts
npm test -- resources/js/pages/wfh/TeamReportsPage.test.tsx resources/js/pages/wfh/TeamReportDetailPage.test.tsx
npm test -- resources/js/components/layout/theme-toggle.test.tsx resources/js/components/layout/AppShell.test.tsx
npm run typecheck
npm run build

# Gerbang lengkap sebelum closeout
make ci
```

Bila host tidak punya PHP/vendor: `docker compose exec app php artisan test --compact --filter=...`
(skill `eoffice-laravel-docker-test-harness`).

## Project Structure

```
app/Domains/Wfh/
  Http/Controllers/TeamReportController.php          → index (+filter) + show()
  Http/Controllers/ReportPdfController.php           → guard admin di exportTeam()
  Http/Resources/TeamReportResource.php              → tidak diubah
  Http/Resources/TeamReportDetailResource.php        → NEW: resource + members[]
  Repositories/WfhRepositoryInterface.php            → + getTeamReportDetailData()
  Repositories/EloquentWfhRepository.php             → implementasi detail (getTeamReportData TIDAK diubah)
  Services/WfhReportPdfData.php                      → tidak diubah (PDF byte-identical)
routes/api.php                                       → GET /admin/wfh/team-reports/{report}
postman/specs/openapi.yaml                           → filter params + getWfhTeamReport + schemas

tests/Feature/Wfh/
  TeamReportFilterTest.php                           → NEW (filter + scope)
  TeamReportShowTest.php                             → NEW (repo data + endpoint + guard)
  PdfExportGuardsTest.php                            → + admin lintas bidang 200 / non-admin 403

resources/js/
  api/types.ts                                       → ListTeamReportsQuery filter, WfhTeamReportDetail, WfhTeamReportMember
  api/wfh-team.ts (+ .test.ts)                       → getWfhTeamReport, filter params
  store/wfhTeamSlice.ts (+ .test.ts)                 → detail state + thunk + refetch pasca-mutasi
  pages/wfh/TeamReportsPage.tsx (+ .test.tsx)        → filter dropdown, aksi Detail/PDF
  pages/wfh/TeamReportDetailPage.tsx (+ .test.tsx)   → NEW
  routes/index.tsx                                   → route /team-reports/:id
  components/layout/Header.tsx                       → ThemeToggle kiri dropdown user
  components/layout/theme-toggle.tsx (+ .test.tsx)   → NEW
  app.tsx                                            → ThemeProvider
resources/views/app.blade.php                        → inline anti-flash theme script

docs/superpowers/specs/2026-11-25-...-design.md      → intent (approved)
docs/superpowers/plans/2026-11-25-...-detail-filter-theme.md → langkah TDD per task
SPEC-team-reports.md                                 → file ini
SPEC-dashboard.md                                    → spec root sebelumnya (dipindah)
```

## Code Style

Backend — filter sebagai closure yang diterapkan ke kedua builder scope; guard admin
memakai konstanta role, bukan string:

```php
// TeamReportController::index
$validated = $request->validate([
    'status' => ['nullable', Rule::in(['draft', 'pending', 'approved', 'rejected'])],
    'date_from' => ['nullable', 'date'],
    'date_to' => ['nullable', 'date'],
    'team_id' => ['nullable', 'integer', Rule::exists('teams', 'id')],
]);

$filters = fn ($query) => $query
    ->when($validated['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
    ->when($validated['date_from'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '>=', $v))
    ->when($validated['date_to'] ?? null, fn ($q, $v) => $q->whereDate('report_date', '<=', $v))
    ->when($validated['team_id'] ?? null, fn ($q, $v) => $q->where('team_id', $v));

// ReportPdfController::exportTeam
$isAdmin = $admin->hasRole(Roles::ADMIN);
if (! $isAdmin && (! $fieldId || $team->field_id !== $fieldId)) {
    return ApiResponse::fail('Tim tidak ditemukan dalam bidang Anda.', 403);
}
```

Frontend — tipe mengikuti kontrak envelope; aksi gate permission, bukan role:

```tsx
// TeamReportDetailPage.tsx — footer aksi
const canApprove = can(user, "wfh.team_report.approve");
const canReject = can(user, "wfh.team_report.reject");
const canExportPdf = can(user, "wfh.report.export_pdf");

{detail.status === "pending" && canApprove && <Button onClick={submitApprove}>Setujui</Button>}
{detail.status === "pending" && canReject && <Button onClick={openReject}>Tolak</Button>}
```

Konvensi:

- PHP: `PascalCase` kelas/berkas, `camelCase` method, `UPPER_SNAKE` konstanta; satu method,
  satu tanggung jawab (`show()` tidak menyusun konten sendiri — delegasi ke repository).
- TS: komponen `PascalCase`, slice/modul `camelCase`, tipe domain di `api/types.ts`, tidak
  ada `any` baru.
- UI copy bahasa Indonesia; label status hanya dari `WFH_STATUS_LABELS`/`WfhStatusBadge`.
- Foto privat selalu lewat `fetchAttendanceObjectUrl` (bearer), tidak pernah `<img src=url>`
  langsung atau `/storage`.
- Komentar hanya untuk keputusan non-obvious (mis. aturan "laporan live terbaru").

## Testing Strategy

| Level | Framework | Lokasi | Menguji |
|---|---|---|---|
| Backend feature | PHPUnit | `tests/Feature/Wfh/TeamReportFilterTest.php` | kombinasi filter, batas tanggal inklusif, 422 input invalid, scope tidak melonggar (kepala tim/bidang) |
| Backend feature | PHPUnit | `tests/Feature/Wfh/TeamReportShowTest.php` | repo detail (laporan live terbaru, absensi asing dihilangkan, anggota tanpa laporan), endpoint 200/403/422 per peran, payload `members` |
| Backend feature | PHPUnit | `tests/Feature/Wfh/PdfExportGuardsTest.php` | admin lintas bidang 200; non-admin lintas bidang 403; non-admin tim sendiri 200 |
| Backend regression | PHPUnit | `TeamReportTest`, `TeamReportPdfTest` | list tanpa filter tidak berubah; PDF tim byte-identical |
| Frontend unit | Vitest + jsdom | `api/wfh-team.test.ts`, `store/wfhTeamSlice.test.ts` | filter params diteruskan; unwrap detail; refetch detail pasca-mutasi; state error |
| Frontend komponen | Vitest + jsdom | `pages/wfh/TeamReportsPage.test.tsx` | Terapkan → query + halaman 1; pagination menjaga filter; Detail navigasi; Unduh PDF memanggil `exportTeamWfhPdf` dengan `date` + `team_report_id` |
| Frontend halaman | Vitest + jsdom | `pages/wfh/TeamReportDetailPage.test.tsx` | mount fetch by route param; gate approve/reject; dialog alasan wajib; alasan reject tampil; anggota tanpa laporan tidak crash |
| Frontend komponen | Vitest + jsdom | `components/layout/theme-toggle.test.tsx` | Gelap menambah `dark`, Terang menghapus, Sistem mengikuti `matchMedia` |
| Manual/E2E | browser | admin + kepala bidang + kepala tim | filter, detail, approve/reject dari detail, unduh PDF (termasuk lintas bidang sebagai admin), tema Gelap/Terang/Sistem + reload |

Aturan:

- Test-first per task: tulis test gagal → jalankan (pastikan gagal) → implement → hijau →
  commit. Setiap task menambah test di lokasi yang sudah ada; tidak membuat harness kedua.
- Test lama yang mengunci kontrak lama (mis. `ListTeamReportsQuery` hanya `per_page`/`page`)
  diperbarui di task yang sama, tidak di-pin ulang.
- Tanpa target coverage angka; ukurannya adalah Acceptance Criteria per modul.
- `make ci` dijalankan sekali di task verifikasi terakhir.

## Boundaries

**Always:**

- Jalankan test yang relevan sebelum setiap commit (`vendor/bin/phpunit --filter=...`,
  `npm test -- <path>`), lalu `npm run typecheck`.
- Catat setiap perubahan kontrak di `postman/specs/openapi.yaml` pada commit yang sama
  dengan perubahan controller-nya.
- Pertahankan scope peran di setiap query baru: filter hanya mempersempit; admin satu-
  satunya role lintas bidang, dan hanya untuk role `Roles::ADMIN` (bukan string literal).
- Bangun `photo_url` lewat `PrivateMediaPath::attendanceUrl` (route `attendances.photo`) dan
  ambil di FE lewat `fetchAttendanceObjectUrl`.
- Tolak (reject) selalu lewat dialog alasan; server tetap `required|string`.
- Tema membaca/menulis satu kunci `localStorage` (`theme`) lewat `next-themes`; komponen
  lain memakai `useTheme()`, bukan manipulasi class sendiri.
- Sembunyikan aksi yang tidak diizinkan (bukan `disabled`), dan biarkan server tetap
  penentu akhir (403/422 tetap tersaji).

**Ask first:**

- Menambah dependensi (tema wajib memakai `next-themes`; library tema kedua tidak boleh).
- Mengubah `getTeamReportData`, `WfhReportPdfData`, atau blade `pdf.wfh-report-admin`
  (konten PDF harus byte-identical; perubahan hanya boleh disetujui eksplisit).
- Mengubah skema database/migrasi (modul ini seharusnya tidak perlu).
- Menyentuh `nav-registry.ts` (detail bukan menu baru).
- Mengubah aturan segregation of duties atau state machine approve/reject.
- Memperluas akses `exportTeam` untuk role selain admin.

**Never:**

- Membuka data lintas bidang/tim lewat filter atau `show()` untuk non-admin.
- Mengganti preview detail dengan embed PDF (ditolak user; keputusan design terkunci).
- Mengubah guard `attendance photo` (`wfh.monitoring.view` + bidang) untuk memudahkan
  halaman detail.
- Menampilkan foto absensi lewat `<img src>` langsung atau URL `/storage` publik.
- Menambahkan endpoint `/storage` publik atau menghapus header privat pada PDF.
- Melemahkan atau menghapus test yang gagal tanpa persetujuan manusia.
- Menyimpan kopi kedua label status/sesi — satu peta, dipakai bersama.
- Menaruh `dark` sebagai default statis di blade (default tetap `system`).

## Open Questions

1. **Penempatan tombol Detail/Unduh PDF** — plan memilih aksi per baris. Bila saat review UI
   tombol PDF lebih pas di header card (satu tombol untuk filter aktif), itu keputusan
   implementasi yang tidak mengubah kontrak; default: per baris.
2. **Bentuk kartu anggota** — jumlah kolom, ukuran thumbnail foto, dan tampilan kegiatan
   mengikuti bahasa visual Monitoring/detail personal. Tidak mengubah data.
3. **Animasi transisi tema** — default instant (`disableTransitionOnChange`). Bila ada
   permintaan transisi halus, itu perubahan baru.

## Success Criteria

### `wfh-team-report-filters`

- [ ] `GET /admin/wfh/team-reports?status=&date_from=&date_to=&team_id=` memfilter sesuai
      kontrak, inklusif di kedua batas tanggal, dan 422 untuk input invalid.
- [ ] Filter tidak memperluas scope kepala tim/kepala bidang (diuji test backend).
- [ ] Dropdown filter tunggal di header card `/team-reports`; Terapkan → halaman 1; pagination
      dan per-halaman menjaga filter aktif (diuji test frontend).
- [ ] `openapi.yaml` memuat parameter filter baru.

### `wfh-team-report-detail`

- [ ] `GET /admin/wfh/team-reports/{report}` mengembalikan header + `members[]`; 403 untuk
      lintas bidang/tim, 422 untuk user tanpa bidang.
- [ ] Detail memilih laporan personal live terbaru per anggota dan tidak merender absensi
      milik laporan lain (diuji test).
- [ ] Admin dapat mengunduh PDF tim lintas bidang (200); non-admin tetap 403; `TeamReportPdfTest`
      hijau (konten PDF tidak berubah).
- [ ] `/team-reports/:id` aman untuk refresh/deep-link, menampilkan header, alasan reject,
      kartu anggota (foto + kegiatan), dan tombol Setujui/Tolak hanya untuk `pending` +
      permission; Tolak wajib alasan.
- [ ] List punya aksi Detail dan Unduh PDF dengan gate permission yang benar.

### `theme-modes`

- [ ] Header menampilkan toggle tema di kiri dropdown user; tiga opsi berfungsi dan
      menandai pilihan aktif.
- [ ] Gelap/Terang mengubah class `dark` di `documentElement`; Sistem mengikuti
      `prefers-color-scheme` dan bereaksi saat OS berganti.
- [ ] Pilihan bertahan setelah reload tanpa kilatan tema; toast mengikuti tema.
- [ ] `make ci` hijau di akhir seluruh modul.
