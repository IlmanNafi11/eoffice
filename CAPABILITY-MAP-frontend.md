# Capability Map: Frontend Phase 2+ (eoffice)

> Source intent: `docs/intent/frontend-fresh-build.md` (confirmed 2026-10-31).
> Contract: `postman/specs/openapi.yaml` (single source of truth, 59 operations).
> Phase 1 shipped Auth + Profile + Shell (10 ops): login/getMe/logout/changePassword/
> forgotPassword/verifyOtp/resetPassword/getProfile/updateProfile/uploadSignature.
> Remaining: **49 operations** across 6 independently testable domains.

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
| `change-package` | OPEN |
| `admin` | OPEN |
| `verification` | OPEN |

## Closure log

| Date | Module | Scope closed | Evidence |
|---|---|---|---|
| 2026-11-01 | `wfh-reports` | 17 operations: list/create/get/update/delete, submit/approve/reject/revise, activities add/update/delete/reorder, attendance add/delete, PDF export, session-config | 9 commits (`c0c8cec`…`f32d1bb`); 23 test files / 231 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 3 role in a real browser (staf create→submit→PDF, kepala bidang approve and reject-with-reason, staf revise→resubmit, 403/422 surfaced as Indonesian messages). E2E found a real defect: the 422 message never reached the user because the post-mutation refetch cleared `current.error` — fixed in `a602c46` with a page-level regression test. Primitives left reusable for the next five modules: `status-badge`, `pagination`, `pdf-download` (blob + objectURL), `activities-editor` (id-diff links), `attendance-upload` (fetch+bearer preview) |
| 2026-11-01 | `wfh-team-reports` | 4 operations: list/create/approve/reject — daftar laporan tim (paginate + badge), buat (admin), approve/reject ber-alasan (kepala bidang) | 7 commits (`9d3d732`…`d43ff91`); 26 test files / 270 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 3 peran in a real browser (admin create → 422 duplikat tersaji, kepala bidang approve & reject-with-reason, kepala tim view-only, staf menu hilang + 403 tersaji Indonesia). E2E found a real defect: `GET /admin/wfh/team-reports` mengirim envelope `ApiResponse::paginated`, bukan paginator raw yang diasumsikan `TeamReportListResponse`/klien → list selalu kosong — fixed di `a78e547` dengan RED→GREEN test pemetaan envelope (2 test) + koreksi `openapi.yaml` |
| 2026-11-01 | `wfh-monitoring` | 3 operations: getWfhMonitoring (board harian belum absen/belum laporan, scope server per peran), adminListWfhReports (list paginated + filter status/tim/tanggal), exportTeamWfhPdf (PDF rekap tim per grup di board) | 6 commits (`020ed71`…`69bdbf1`); 29 test files / 305 tests green, `tsc --noEmit` clean, `npm run build` exit 0; E2E manual 4 peran in a real browser (admin scope semua, kepala bidang scope bidang + 403 lintas-bidang, kepala tim scope tim + PDF timnya valid, staf menu hilang + 403). Pinjam `listTeams` dari `api/wfh-team` (bukan duplikasi); ekstraksi `report-row` murni refactor dengan test lama pass unmodified. |