# SPEC: Dashboard Beranda

> Module id: `dashboard` (satu modul; endpoint + satu halaman tidak bisa dipisah tanpa
> menulis ulang kontrak, jadi Phase 0 capability map tidak diperlukan).
> Intent & keputusan yang disetujui: `docs/superpowers/specs/2026-11-24-dashboard-design.md`
> (approved 2026-11-24).
> Rencana implementasi (8 task TDD): `docs/superpowers/plans/2026-11-24-dashboard.md`.
> Kontrak API: `postman/specs/openapi.yaml` → `GET /api/dashboard`.
>
> Catatan penamaan root: spec initiative sebelumnya (cross-module-fixes) dipindah ke
> `SPEC-cross-module-fixes.md` saat file ini dibuat; rujukan di `tasks/plan.md`,
> `tasks/todo.md`, dan `CAPABILITY-MAP-cross-module-fixes.md` sudah diperbarui.

## Objective

Mengganti placeholder `HomePage` di route `/` (`resources/js/routes/index.tsx:51`) dengan dashboard
beranda yang menjawab satu pertanyaan pada pandangan pertama: **"apa yang harus saya lakukan hari ini,
dan bagaimana kondisi kepatuhan WFH?"** — isinya menyesuaikan role peminta.

Penerima manfaat:

| Role | Yang dilihat | Yang membuat berbeda |
|---|---|---|
| staf | absensi hari ini, status laporan hari ini, pintasan absen/buat laporan | hanya data diri |
| kepala tim | rekap kehadiran timnya hari ini, antrean laporan tim & paket perubahan tim | `wfh.monitoring.view` + team-scoped |
| kepala bidang | rekap seluruh bidang, antrean laporan tim, tren & daftar perhatian | field-scope |
| admin | rekap organisasi, tren organisasi, daftar perhatian | scope all |

**Masalah saat ini:** `/` hanya berisi teks "Beranda — modul menyusul di fase berikutnya."; kepala
tim/bidang dan admin tidak punya satu tempat untuk melihat beban kerja harian + kepatuhan sekaligus.

**Success = semua kondisi ini benar di browser untuk keempat role:**

1. `/` merender `DashboardPage`; teks placeholder lama tidak ada lagi; `HomePage` terhapus (cutover bersih).
2. Skeleton tampil per seksi selama loading; seksi tanpa permission tidak dirender sama sekali.
3. Data hari ini memakai zona waktu server dan setelan `wfh_allowed_days` — hari non-kerja menampilkan
   status netral "Hari ini bukan hari WFH", bukan angka 0 yang menyesatkan.
4. Angka rekap/tren selalu pembilang + penyebut (contoh "3 dari 12 belum absen"), bukan persen telanjang.
5. Penyebut hanya menghitung user **aktif** dalam cakupan; user nonaktif tidak masuk penyebut, tren,
   maupun daftar perhatian.
6. Cakupan role: staf = diri; kepala tim = anggota tim pertama yang dipimpin (`ledTeams()->first()`);
   kepala bidang = seluruh user field-nya; admin = semua. Kepala tanpa tim/bidang = deny-by-default
   (seksi rekap tidak muncul, antrean change = 0).
7. Antrean hanya berisi item yang benar-benar boleh diputuskan peminta (permission + status), dan
   hitungannya konsisten dengan halaman list masing-masing.
8. Tren = 14 hari kerja terakhir (asc), `compliant` = user yang punya laporan `approved` **atau**
   `pending` hari itu; `draft`/`rejected`/tanpa laporan = tidak compliant.
9. Daftar perhatian = maksimal 5 user dengan kepatuhan terendah (< 60%) dalam 14 hari kerja, urut terendah dulu.
10. Tab yang difokuskan ulang me-refetch data tanpa blank (skeleton halus di atas data lama).

## Tech Stack

Backend (existing, tidak ada dependensi baru):

- PHP `^8.2`, Laravel `^12.69`, Spatie `spatie/laravel-permission ^6.25`.
- Domain baru `app/Domains/Dashboard/` mengikuti pola domain existing (`Http/Controllers`,
  `Http/Resources`, `Services`).
- Respons envelope `ApiResponse::ok` (`App\Support\Http\ApiResponse`).

Frontend (existing + satu tambahan):

- React `^19.2.7`, Vite `^8.3.5`, Redux Toolkit `^2.13.0`, TypeScript, Vitest + jsdom, Tailwind + shadcn.
- Tambahan yang disetujui design: shadcn `chart` (`npx shadcn add chart` → `recharts@3.8.0`,
  style `radix-nova`). `animate-ui` tidak punya chart — jangan menambah library chart lain.
- Komponen existing yang dipakai ulang: `Card`, `Skeleton`, `Badge`, `Button` dari `@/components/ui`.

## Commands

Full executable, dari root repo:

```
# Backend tests (semua)
php artisan test --compact

# Backend tests (fokus modul ini)
php artisan test --compact --filter=Dashboard

# Bila host tidak punya PHP/vendor — pakai harness Docker
# (skill: eoffice-laravel-docker-test-harness), contoh:
docker compose exec app php artisan test --compact --filter=Dashboard

# Lint backend (Pint, tidak auto-fix di CI)
vendor/bin/pint --test
make lint                 # = vendor/bin/pint --test

# Frontend
npm run test              # vitest run
npm run test -- resources/js/pages/dashboard/ resources/js/api/dashboard.test.ts
npm run typecheck         # tsc -p tsconfig.json --noEmit
npm run dev               # vite dev server
npm run build             # vite build

# Gerbang lengkap sebelum closeout
make ci                   # lint + test + frontend-test + frontend-typecheck + frontend-build

# Chart dependency (hanya sekali, Task 7)
npx shadcn add chart
```

## Project Structure

```
app/Domains/Dashboard/
  Http/Controllers/DashboardController.php     → satu endpoint GET /api/dashboard
  Http/Resources/DashboardResource.php         → generated_at + seksi seadanya (pass-through)
  Services/DashboardService.php                → buildFor(User): array; orkestrasi seksi
  Services/SectionBuilders/TodaySection.php    → today.me + today.scope
  Services/SectionBuilders/QueueSection.php    → queue (per permission)
  Services/SectionBuilders/TrendSection.php    → trend (14 hari kerja)
  Services/SectionBuilders/AttentionSection.php→ attention (max 5, < 60%)
  Services/DashboardScope.php                  → resolver cakupan + label
routes/api.php                                 → GET /dashboard di group auth:sanctum
postman/specs/openapi.yaml                     → path /api/dashboard (sumber kebenaran kontrak)

tests/Feature/Dashboard/                       → DashboardTodayTest, DashboardTodayScopeTest,
                                                 DashboardQueueTest, DashboardTrendTest,
                                                 DashboardAttentionTest

resources/js/api/dashboard.ts (+ .test.ts)     → getDashboard()
resources/js/api/types.ts                      → tipe Dashboard*
resources/js/store/dashboardSlice.ts (+ .test.ts) → thunk fetchDashboard + state
resources/js/store/index.ts                    → daftarkan reducer `dashboard`
resources/js/pages/dashboard/
  DashboardPage.tsx (+ .test.tsx)              → halaman + fetch-on-mount + refetch-on-focus
  sections/TodayCards.tsx
  sections/QueueCard.tsx
  sections/TrendChart.tsx
  sections/AttentionCard.tsx
  sections/ShortcutsRow.tsx
resources/js/lib/nav-registry.ts               → entri "Beranda" tetap (`id: home`, path `/`)

docs/superpowers/specs/2026-11-24-dashboard-design.md  → intent & keputusan (approved)
docs/superpowers/plans/2026-11-24-dashboard.md         → langkah TDD per task
SPEC.md                                                → file ini
CHANGELOG.md, CAPABILITY-MAP-dashboard.md              → diperbarui di Task 8
```

## Code Style

Backend — satu builder, satu tanggung jawab; seksi opsional = `null`, bukan array kosong:

```php
// app/Domains/Dashboard/Services/SectionBuilders/AttentionSection.php
final class AttentionSection
{
    public const THRESHOLD_PERCENT = 60;
    public const MAX_USERS = 5;

    public function __construct(private readonly DashboardScope $scope) {}

    public function build(User $user): ?array
    {
        if (! $user->can('wfh.monitoring.view')) {
            return null; // seksi tidak untuk peminta
        }

        return [
            'users' => $this->below($user),
            'threshold_note' => 'kepatuhan < 60% dalam 14 hari kerja terakhir',
        ];
    }
}
```

Frontend — tipe mengikuti kontrak OpenAPI; seksi opsional = `| undefined`; status warna satu peta:

```tsx
// resources/js/pages/dashboard/sections/QueueCard.tsx
const STATUS_STYLE: Record<ReportStatus, string> = {
  draft: "text-muted-foreground",
  pending: "text-warning",
  approved: "text-success",
  rejected: "text-error",
};

export function QueueCard({ section }: { section: DashboardQueue | undefined }) {
  if (!section) return null; // tidak punya permission → tidak dirender
  return <Card>{/* ... */}</Card>;
}
```

Konvensi:

- Nama kelas/berkas PHP: `PascalCase`; method `camelCase`; konstanta `UPPER_SNAKE`.
- FE: komponen `PascalCase` di `pages/dashboard/`; slice/modul `camelCase`; teks UI bahasa Indonesia.
- Jumlah seri tren wajib menyebut pembilang + penyebut, tidak pernah persen telanjang.
- Komentar hanya untuk keputusan non-obvious (mis. "tim pertama yang dipimpin = status quo").

## Testing Strategy

| Level | Framework | Lokasi | Menguji |
|---|---|---|---|
| Backend feature | PHPUnit (Laravel) | `tests/Feature/Dashboard/*` | kontrak JSON per role, scoping, hari non-kerja, user nonaktif, hitungan antrean, tren & attention |
| Backend contract | PHPUnit | `tests/Feature/EnvelopeContractTest.php` (existing) | envelope + entri OpenAPI tetap valid |
| Frontend unit | Vitest + jsdom | `*.test.ts(x)` berdampingan | modul API (stub axios), slice (pending/fulfilled/rejected), komponen seksi, refetch-on-focus |
| Manual/E2E | browser | keempat role demo | skeleton → terisi, seksi per role, empty state |

Aturan:

- Test-first per task: tulis test gagal → jalankan (pastikan gagal) → implement → hijau → commit.
- Setiap task menambahkan test di lokasi yang sudah ada; tidak membuat harness kedua.
- `npm run test` penuh dijalankan di Task 7/8 untuk memastikan tidak ada regresi.
- Tanpa target coverage angka; keberadaan perilaku di Success Criteria yang menjadi ukurannya.

## Boundaries

**Always:**

- Jalankan test yang relevan sebelum setiap commit (`php artisan test --compact --filter=...`,
  `npm run test -- <path>`), lalu `npm run typecheck`.
- Catat setiap perubahan kontrak di `postman/specs/openapi.yaml` pada commit yang sama.
- Hormati cakupan role: setiap query baru menyaring lewat `DashboardScope`, dan default-nya menolak
  (kepala tanpa tim → kosong), bukan membuka semua.
- Sertakan pembilang + penyebut pada setiap angka kepatuhan.
- Semua hitungan "hari kerja" membaca `settings.wfh_allowed_days`; setelan kosong = semua hari non-kerja.
- Seksi tanpa permission tidak dirender (FE) dan tidak dikirim (BE).
- Pakai satu peta warna status (draft/pending/approved/rejected) di seluruh halaman.

**Ask first:**

- Menambah dependensi baru selain shadcn `chart`/`recharts`.
- Mengubah skema database atau migrasi (modul ini seharusnya tidak perlu).
- Mengubah `nav-registry` (entri "Beranda" tetap; hanya boleh bila label/path berubah).
- Menyentuh kode di luar `app/Domains/Dashboard/`, `resources/js/{api,store,pages/dashboard}`,
  `routes/api.php`, `postman/specs/openapi.yaml`.
- Mengubah definisi metrik kepatuhan (compliant/pembilang/penyebut) — itu keputusan design yang sudah kunci.

**Never:**

- Memakai `wfh_monitoring`/`applyVisibilityScope` sebagai field-scope untuk antrean change — antrean
  change tetap **team-scoped**.
- Menghitung user nonaktif dalam penyebut atau daftar perhatian; `is_active = false` selalu dikecualikan.
- Menampilkan data lintas cakupan role (kebocoran antre tim/bidang).
- Menambah library chart selain shadcn chart/recharts.
- Menghapus atau melemahkan test yang gagal tanpa persetujuan manusia.
- Commit rahasia/kredensial; menyunting direktori vendor/generated shadcn secara manual.

## Open Questions

1. **Threshold perhatian**: design mengunci `< 60%` di atas 14 hari kerja dengan maksimal 5 user. Bila
   ternyata lebih dari 5 user melanggar, hanya 5 terendah ditampilkan — apakah perlu indikator "…dan N
   lainnya"? Default: tidak, cukup 5 terendah (keputusan saya, mudah ditambah nanti).
2. **`next_session`** pada hari kerja yang sesinya sudah lengkap: dikirim `null`. Apakah FE perlu teks
   "absensi selesai" khusus? Default: ya, teks netral satu kalimat (keputusan saya).
3. **Refetch-on-focus** memakai `visibilitychange` saja (bukan interval polling). Bila kelak butuh
   polling, itu perubahan scope baru.

## Success Criteria

- [ ] `GET /api/dashboard` mengembalikan envelope `ApiResponse::ok` dengan `generated_at` ISO 8601 dan
      seksi sesuai permission peminta; terdokumentasi di `postman/specs/openapi.yaml`.
- [ ] Keempat role melihat seksi yang tepat di `/` (staf: hari ini; kepala tim/bidang: rekap + antrean;
      admin: organisasi + tren + perhatian) — diverifikasi di browser.
- [ ] Hari non-kerja dan user nonaktif berperilaku sesuai Boundaries (diuji test backend).
- [ ] Tren 14 hari kerja membaca setelan `wfh_allowed_days` (bukan konstanta Sen–Jum) dan
      `compliant` = `approved|pending`.
- [ ] Daftar perhatian maksimal 5 user, `< 60%`, urut terendah dulu.
- [ ] Skeleton per seksi saat loading; refetch-on-focus tanpa blank; empty state satu kalimat.
- [ ] `HomePage` placeholder terhapus; `make ci` hijau.
