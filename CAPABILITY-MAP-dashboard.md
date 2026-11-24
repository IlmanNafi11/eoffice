# CAPABILITY-MAP-dashboard

> Module id: `dashboard` (satu modul; endpoint + halaman tidak bisa dipisah tanpa menulis ulang
> kontrak — Phase 0 capability map terpisah tidak diperlukan).
> Spec: `SPEC.md` (approved 2026-11-24). Intent: `docs/superpowers/specs/2026-11-24-dashboard-design.md`.
> Plan: `docs/superpowers/plans/2026-11-24-dashboard.md` (Tasks 1–8).

| Module id | Responsibility | Depends on | Backend change | Status |
|---|---|---|---|---|
| `dashboard` | Beranda `/` per-permission: satu `GET /api/dashboard` (domain `app/Domains/Dashboard/`) + halaman SPA `pages/dashboard/`; seksi `today` (me + scope), `queue`, `trend` (14 hari kerja), `attention` (maks 5, < 60%) dikirim hanya bila peminta berhak | — (memakai `Setting::get('wfh_allowed_days')`, `DashboardScope`, model WFH/Change yang sudah ada) | Ya: route `GET /dashboard`, `DashboardController`/`DashboardResource`/`DashboardService`, 4 SectionBuilder, `DashboardScope`, `WorkdayWindow`, `postman/specs/openapi.yaml` | **IMPLEMENTED 2026-11-24** (T1–T8; commit `cb841b0`, `495c65f`, `0f6849c`, `6864558`, `0557bdf`, `b4001e7`, `4503727`, `7cd4fd2`, `f865e68`; closeout menunggu review human Checkpoint D) |

**Build order:** `today.me` → `today.scope` → `queue` ∥ `trend`+`attention` → FE tipe/slice → halaman
→ chart/kartu lanjutan → seeder demo + smoke 4 role + docs. (T3 dan T4 paralel-able; sisanya sekuensial
karena tiap slice menambah seksi ke kontrak yang sama.)

**Non-goal modul ini:**

- Tidak mengubah definisi metrik kepatuhan (`approved|pending` = compliant, penyebut = hari kerja ×
  user aktif) — keputusan design yang sudah dikunci.
- Tidak menambah permission baru, matriks role, atau migrasi skema. `RolePermissionSeeder` tidak disentuh.
- Tidak memakai `applyVisibilityScope` (field-scoped) untuk antrean change — antrean tetap
  **team-scoped**.
- Tidak menambah library chart selain shadcn `chart` (`recharts@3.8.0`).
- Tidak ada polling interval; refetch hanya saat `visibilitychange` → visible.

## Antarmuka lintas modul yang dipakai

- `Setting::get('wfh_allowed_days'|'wfh_sessions')` (`App\Models\Setting`) — satu-satunya sumber
  "hari kerja"/"sesi absensi"; setelan kosong = fail-closed.
- `app/Domains/Wfh/Models/{WfhReport,WfhAttendance,WfhTeamReport}` dan
  `app/Domains/ChangeManagement/Models/{ChangeInitiation,ChangeImplementation}` — dibaca, tidak diubah.
- Permission Spatie yang sudah ada sebagai satu-satunya gerbang seksi (`$user->can(...)`), dengan
  `DashboardScope` untuk cakupan per peran (admin=all, kepala_tim=tim pertama yang dipimpin,
  kepala_bidang=field-nya, staf=diri).
- Sisi FE: `ApiResponse` envelope (`requireData` di `@/api/client`), `can()` di `@/lib/permissions`,
  primitives `Card`/`Skeleton`/`Badge`/`Button` + shadcn `chart`.

## Verification receipts (2026-11-24)

- Backend: `php vendor/bin/phpunit tests/Feature/Dashboard` → **31 passed, 109 assertions**;
  `tests/Feature/Database` → **13 passed, 68 assertions** (termasuk `DashboardDemoSeederTest`
  5 tests / 49 assertions, mutation-verified: semua-laporan-approved → RED pada status-mix,
  straggler dibuat compliant → RED pada attention-uniqueness + role sections).
- Frontend: `npm run test` suite penuh hijau (T7 receipt: 792 passed / 59 files), `npm run typecheck`,
  `vite build` hijau.
- Smoke browser nyata (headless Chromium via CDP, `localhost:8000`, DB `eoffice_test` setelah
  `DashboardDemoSeeder`):
  - staf — kartu absensi "1/3 sesi" + badge Draf, tren "11 dari 14", pintasan absen/paket perubahan;
    tanpa `queue`, tanpa `scope`, tanpa `attention`.
  - kepala_tim — rekap "1 dari 4 belum absen", tren "32 dari 56", antrean "2 paket perubahan" +
    "1 implementasi", perhatian "Nia Noncompliant 1/14".
  - kepala_bidang — rekap "1 dari 4" Bidang, "2 laporan tim menunggu persetujuan", perhatian sama.
  - admin — rekap Organisasi "1 dari 5", tren "45 dari 70", ketiga antrean, perhatian, pintasan
    "Kelola user".
  - Skeleton: pada load awal terukur 9 elemen skeleton + `today-skeleton` meliputi seksi, lalu
    0 skeleton setelah data tiba (per-seksi, bukan blank).
