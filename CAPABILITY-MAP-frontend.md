# Capability Map: Frontend Phase 2+ (eoffice)

> Source intent: `docs/intent/frontend-fresh-build.md` (confirmed 2026-10-31).
> Contract: `postman/specs/openapi.yaml` (single source of truth, 59 operations).
> Phase 1 shipped Auth + Profile + Shell (10 ops): login/getMe/logout/changePassword/
> forgotPassword/verifyOtp/resetPassword/getProfile/updateProfile/uploadSignature.
> Inisiatif **tuntas** (2026-11-02): 59/59 operations tertutup — Phase 1 (10) +
> keenam modul Phase 2+ (49). Semua modul CLOSED; lihat Status + Closure log.

**Consumer:** SPA repo ini (staff, kepala tim, kepala bidang, admin). Backend out of scope —
frontend only consumes the contract; no API/Laravel change.

| Module id | Responsibility (operations) | Reuses primitives from |
|---|---|---|
| `wfh-reports` | Laporan WFH personal: list/create/get/update/delete + submit/approve/reject/revise + activities (add/update/delete/reorder) + attendance (add/delete) + PDF export + session-config (17 ops) | — |
| `wfh-team-reports` | Laporan tim (kepala tim): list/create/approve/reject (4 ops) | `wfh-reports` |
| `wfh-monitoring` | Dashboard monitoring (users × report status) + admin list semua laporan + PDF tim (3 ops: getWfhMonitoring/adminListWfhReports/exportTeamWfhPdf) | `wfh-reports` |
| `change-package` | Change package: list/create/show/update/delete + submit/approve/reject + attachment upload + change-types + initiation/implementation PDF (12 ops) | `wfh-reports` |
| `admin` | RBAC admin UI: user mgmt (list/create/get/update/delete/import, 6) + roles/permissions (list/update/sync, 3) + settings (list/update, 2) + listTeams (1) = 12 ops | `wfh-reports` |
| `verification` | Halaman publik verifikasi QR (verifyQrToken, 1 op, tanpa auth) | — |

## Build order

```
wfh-reports → wfh-team-reports → wfh-monitoring
   │
   └─────────→ change-package  (independent domain, can slot anytime)
   └─────────→ admin           (independent domain, can slot anytime)

verification → ship anytime (1 op, no auth, no dependency)
```

**Per module**: `SPEC-<module-id>.md` at repo root (tracked), named by module id.
The map, not filename guessing, is the index of what exists.

## Dependency notes

- **No hard data/entity dependencies** between these modules — each domain's entities are
  self-contained in the API contract. "Reuses primitives from" records *who pioneers the
  reusable UI* (pagination table, status badge, upload control, PDF-with-bearer download),
  so downstream modules inherit rather than fork. It is **not** a runtime coupling.
- `wfh-reports` goes first because it is the largest surface, the daily driver, and pioneers
  every cross-cutting primitive the other five modules reuse.
- `wfh-monitoring`'s `exportTeamWfhPdf` keys off `team` + `date` (not a team-report id), and
  `adminListWfhReports` reuses the personal report row/badge — hence primitives-only reuse.
- `verification` is a no-auth leaf; it blocks nothing and nothing blocks it. It may be cut or
  deferred without touching any other module.

## Phase 0 decisions (approved 2026-10-31)

1. Admin boundary: **one module `admin`** (not split user-management / rbac-settings).
2. Build order: **`wfh-reports` first**.
3. Verification: **separate tiny module, ship fast**.

## Status

| Module id | Status |
|---|---|
| `wfh-reports` | **CLOSED 2026-11-01** (Phases 0–4, 9 commit `c0c8cec`…`f32d1bb`; 231/231 test FE, tsc + build bersih, E2E manual 3 role di browser — menemukan + memperbaiki bug visibilitas pesan 422 `a602c46`) |
| `wfh-team-reports` | **CLOSED 2026-11-01** (4 ops list/create/approve/reject, 10 commit `9d3d732`…`b309c73` incl. ship-review #5; 26 file / 272 test FE, tsc + build bersih, E2E manual 3 peran di browser — menemukan + memperbaiki defect bentuk list envelope `a78e547`) |
| `wfh-monitoring` | **CLOSED 2026-11-01** (3 ops getWfhMonitoring/adminListWfhReports/exportTeamWfhPdf, 6 commit `020ed71`…`69bdbf1`; 29 file / 305 test FE, tsc + build bersih, E2E manual 4 peran di browser) |
| `change-package` | **CLOSED 2026-11-01** (12 ops, 7 commit `28b8120`…`ded498b`; 34 file / 390 test FE, tsc + build bersih, E2E manual 4 peran di browser) |
| `admin` | **CLOSED 2026-11-02** (12 ops, 8 commit `784ba9a`…`b169c26`; 40 file / 495 test FE, tsc + build bersih, E2E manual 4 peran di browser — flow a-d: default-password onboarding, import duplikat tersaji, 422 lockout tersaji, staf 403 tersaji Indonesia) |
| `verification` | **CLOSED 2026-11-02** (1 op verifyQrToken — modul terakhir inisiatif 59/59; 3 commit `716f33d`…`5499a80`; 42 file / 508 test FE, tsc + build bersih, E2E manual 4 alur publik di browser tanpa login) |

## Closure log

| Date | Module | Scope closed | Evidence |
|---|---|---|---|
| 2026-11-01 | `wfh-reports` | 17 operations: list/create/get/update/delete, submit/approve/reject/revise, activities add/update/delete/reorder, attendance add/delete, PDF export, session-config | 9 commits (`c0c8cec`…`f32d1bb`); 23 test files / 231 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 3 role in a real browser (staf create→submit→PDF, kepala bidang approve and reject-with-reason, staf revise→resubmit, 403/422 surfaced as Indonesian messages). E2E found a real defect: the 422 message never reached the user because the post-mutation refetch cleared `current.error` — fixed in `a602c46` with a page-level regression test. Primitives left reusable for the next five modules: `status-badge`, `pagination`, `pdf-download` (blob + objectURL), `activities-editor` (id-diff links), `attendance-upload` (fetch+bearer preview) |
| 2026-11-01 | `wfh-team-reports` | 4 operations: list/create/approve/reject — daftar laporan tim (paginate + badge), buat (admin), approve/reject ber-alasan (kepala bidang) | 7 commits (`9d3d732`…`d43ff91`); 26 test files / 270 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 3 peran in a real browser (admin create → 422 duplikat tersaji, kepala bidang approve & reject-with-reason, kepala tim view-only, staf menu hilang + 403 tersaji Indonesia). E2E found a real defect: `GET /admin/wfh/team-reports` mengirim envelope `ApiResponse::paginated`, bukan paginator raw yang diasumsikan `TeamReportListResponse`/klien → list selalu kosong — fixed di `a78e547` dengan RED→GREEN test pemetaan envelope (2 test) + koreksi `openapi.yaml` |
| 2026-11-01 | `wfh-monitoring` | 3 operations: getWfhMonitoring (board harian belum absen/belum laporan, scope server per peran), adminListWfhReports (list paginated + filter status/tim/tanggal), exportTeamWfhPdf (PDF rekap tim per grup di board) | 6 commits (`020ed71`…`69bdbf1`); 29 test files / 305 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 4 peran in a real browser (admin scope semua, kepala bidang scope bidang + 403 lintas-bidang, kepala tim scope tim + PDF timnya valid, staf menu hilang + 403). Pinjam `listTeams` dari `api/wfh-team` (bukan duplikasi); ekstraksi `report-row` murni refactor dengan test lama pass unmodified. Ship-review #6 (3 persona sejajar, 2026-11-01): 2 High ditutup di `df4c396` — H1 filter basi bocor ke pagination (pending slice kini REPLACE query, bukan merge) dan H2 pesan 422/403 PDF tim terselin (ApiError membawa responseBody Blob, didekode via FileReader, prop `getError` pada PdfDownloadButton); 310 tests green (+5 regresi), tsc + build clean. Low non-blocking: PII board (nip/email/phone tak dipakai UI — follow-up backend trim allowlist), validasi content-type blob PDF, chunk >500kB hint — lazim; dimuat malas nanti). |
| 2026-11-01 | `change-package` | 12 operations: list/create/show/update/delete, submit/approve/reject (tanpa reason), upload attachment (`files[]` ≤10, jpg/png), listChangeTypes, PDF inisiasi & implementasi (blob bearer) | 7 commits (`28b8120`…`ded498b`); 34 test files / 390 tests green, `tsc --noEmit` clean, `npm run build` exit 0; unconsumed-scan 12 op → 12 fungsi `api/change-package.ts`; permission-scan file non-test ⊆ seeder; test lama pass unmodified (types.test.ts 0 baris assert terhapus, store/index.ts hanya +reducer). E2E manual 4 peran in a real browser (staf create draft → unggah lampiran → submit → pending; kepala tim approve/reject paket staf + self-package tanpa tombol setujui; kepala bidang PDF 422 tanda-tangan tersaji lalu 200; admin scope semua + PDF implementasi). Doctor note: kepala tim memegang `change.*.export_pdf` di `RolePermissionSeeder.php:129,135` sehingga tombol PDF tampil — spec role-matrix mencatat ✗; UI gate `can()` = seeder, drift spec-vs-seeder dicatat di sini. Ship-review #7 (3 persona sejajar, 2026-11-02): 2 High konvergen ditutup di `1ff2e27` — H1 race detail (`fetchPackage` tanpa guard `latestRequestId` + data id lama tak dikosongkan → submit paket salah via `buildSubmitInputFromResource`(stale)), H2 `canDoSubmit` create-mode tak mengecek tim/bidang (REQuery #2 bocor: admin lihat tombol Submit yang pasti 422); +3 test regresi mutation-verified; gate pasca-fix 34 file / 393 test, tsc + build bersih, backend-php 734/2189 + Pint OK (tak berubah), `npm audit --omit=dev` 0 vuln. Temuan non-blocking: Low same-origin check bearer-blob attachment + filename tanpa ekstensi (pola-hardening lintas-modul, follow-up), coverage gap kecil (boundary 10 lampiran, thunks rejected delete/upload). |
| 2026-11-02 | `admin` | 12 operations: listUsers/createUser/getUserById/updateUser/deleteUser/importUsers (user mgmt), listRoles/updateRolePermissions/listPermissions (RBAC), listSettings/updateSetting (settings), + listTeams dipinjam dari `api/wfh-team` (bukan duplikasi) | 8 commits (`784ba9a`…`b169c26`); 40 test files / 495 tests green, `tsc --noEmit` clean, `npm run build` exit 0; unconsumed-scan 12 op = 0; permission-scan file modul ⊆ seeder (8 nama persis: user.create/delete/import/manage/update, role.manage, permission.manage, setting.manage); test lama pass unmodified (0 baris `-` pada diff test range, 2233 insertions; `store/index.ts` hanya +reducer). E2E manual 4 peran in a real browser (admin buat user tanpa password → login default → must_change tersaji; import CSV valid+duplikat → `1 diimpor, 1 dilewati` + pesan baris; uncheck `user.manage` pada role admin → dialog konfirmasi → 422 lockout tersaji; ubah `password_default_user` → user baru login pakai default baru; staf → 3 menu admin hilang + URL langsung → 403 Indonesia). Catatan E2E: NIP numerik murni (mis. `88880001`) gagal import server-side (`The N.nip field must be a string` — Maatwebsite row-validation coercion; pre-existing backend quirk, out of scope FE) — workaround smoke pakai NIP berawalan nol. Human review disetujui 2026-11-02. |
| 2026-11-02 | `admin` (ship-review #8) | 3 persona sejajar (code-reviewer: GO 0C/0H/1M/2L; security-auditor: GO 0C/0H/0M/1L; test-engineer: REQUEST CHANGES 1H/3M/3L) | 1 High + 3 Medium ditutup: H1 error hapus terdorong keluar oleh dialog overlay z-50 (pola b309c73) → error dirender di dalam DialogContent; M2 guard race `fetchUser` (latestRequestId + clear-on-different-id) dites; M3 `updateUser` permissions `[]` (sync penuh) dites form-level; M4 guard error import-file ≤10 MB klien. Bonus kualitas: `createUserThunk`/`updateUserThunk` + matcher dead-code dihapus (dipanggil langsung api/admin.ts). 495 → 498 tests post-fix (+6 regresi mutation-verified: 2 race fetchUser, 1 permissions-[], 1 error-survival, 1 size-guard, 1 delete-in-dialog; −3 echo/dead). 3 commit fix `0f5fc38`/`462f792`/`884e108` + `52f1035` (catatan). tsc + build bersih; backend phpunit 734 OK + Pint (tak berubah; 2 PHPUnit deprecations pre-existing). |
| 2026-11-02 | `verification` | 1 operation: verifyQrToken — halaman publik `/verify/{token}` (card centered tanpa login): doc_type/doc_number/report_date (bila ada)/status/message; 404/429 tersaji dari ApiError; token salah bentuk dicek klien tanpa panggilan API | 3 commits (`716f33d`…`5499a80`); 42 test files / 508 tests green, `tsc --noEmit` clean, `npm run build` exit 0; unconsumed-scan 59/59 op = 0 (modul terakhir inisiatif); permission-scan file modul = hasil kosong (publik, tanpa gate); test lama pass unmodified (0 baris `-` diff test; `store/index.ts` & `nav-registry.ts` TIDAK berubah). E2E manual 4 alur publik in a real browser tanpa login (WFH-236 approved → card lengkap; Change Initiation tanpa `report_date` → render tanpa baris tanggal; token acak 64-hex → 404 "tidak ditemukan" tersaji `role="alert"`; token `abc` → "tidak valid" dengan 0 network request; login staf tab lain → tetap tanpa sidebar/AppShell). Human review disetujui 2026-11-02. Risiko tercatat: QR tercetak mengarah `/api/verify/{token}` (path API, bukan SPA) — keputusan backend/deploy, di luar modul ini. |