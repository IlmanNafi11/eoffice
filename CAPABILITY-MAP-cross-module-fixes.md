# CAPABILITY-MAP-cross-module-fixes

> Phase 0, approved 2026-11-24. Intent: `docs/superpowers/specs/2026-11-24-cross-module-fixes-design.md`.
> Plan: `docs/superpowers/plans/2026-11-24-cross-module-fixes.md` (9 tasks).
> Ini adalah update perbaikan atas 5 modul yang sudah CLOSED — bukan modul baru.
> Spec turunan: `SPEC.md` ini (index seluruh kemampuan; tidak ada `SPEC-<id>.md` baru,
> sesuai permintaan user "buat SPEC.md di root" yang menggantikan konvensi per-modul).

| Module id | Responsibility | Depends on | Backend change | Status |
|---|---|---|---|---|
| `wfh-pdf` | Layout kop table + tanggal di PDF laporan tim; penandatangan "Yang Membuat Laporan" = `created_by` laporan (lookup tim+tanggal bila `team_report_id` tak dikirim) | — | Ya: `ReportPdfController::exportTeam` + `WfhReportPdfData::forTeam` + `SignatureGuard` | **CLOSED 2026-11-24** (T1–T2; `0ac9d7d`; PDF render + koordinat dompdf terverifikasi) |
| `wfh-nav-team` | Back detail WFH context-aware via `location.state.from`; dialog "Buat laporan" di `/team-reports` | `wfh-reports` (route `/wfh/:reportId` existing) | Tidak ada | **CLOSED 2026-11-24** (T3–T4; `e7b7f9d`…`2a7616e`; smoke browser back + dialog) |
| `rbac-labels` | Kamus `ROLE_LABELS` untuk form user, tabel users, halaman roles | — | Tidak ada | **CLOSED 2026-11-24** (T5; `b1b078c`; 3 halaman admin terverifikasi) |
| `change-attachments` | Multi-preview sejak create, hapus/ganti attachment (draft-only), input attachment hanya di form, label "Tanggapan Perubahan", "Tanda Tangan" di PDF Implementasi | `change-package` (upload endpoint + `AttachmentList` existing); endpoint DELETE baru di module ini | Ya: route DELETE + controller + repository + openapi | **CLOSED 2026-11-24** (T6–T9; `e33fe04`…`c1255fa`; DELETE 204 + preview + label consistency) |

**Build order:** `wfh-pdf` → `wfh-nav-team` → `rbac-labels` → `change-attachments`.

Alasan: `wfh-pdf` memegang risiko regresi render tertinggi dan tidak bergantung apa pun;
`wfh-nav-team`/`rbac-labels` murni frontend; `change-attachments` terakhir karena satu-satunya
yang menambah kontrak API dan menyentuh frontend + backend + PDF sekaligus (Tasks 7–9 plan).

**Dependency direction:** satu arah, tanpa siklus. Antarmuka lintas-modul yang dipakai:
- `wfh-pdf` → view-data keys `pdf.wfh-report-admin` (nama kunci tetap; sumber nilainya yang berubah).
- `wfh-nav-team` → kontrak `location.state: { from: string }` (diproduksi `MonitoringPage`, dikonsumsi `WfhReportDetailPage`).
- `change-attachments` → `DELETE /api/changes/{id}/attachments/{attachment}` (204), kontrak baru modulus sendiri.

## Closure log

| Date | Module | Scope closed | Evidence |
|---|---|---|---|
| 2026-11-24 | `wfh-pdf`, `wfh-nav-team`, `rbac-labels`, `change-attachments` | 10 temuan QA lintas 4 modul (9 tasks): PDF tim layout + maker, back context-aware + dialog tim, label role human-friendly, attachment preview/hapus/ganti + input hanya di form, label PDF + caption tanda tangan, endpoint DELETE baru | 8 commits (`0ac9d7d`…`c1255fa`; human review Checkpoint D disetujui 2026-11-24); `php vendor/bin/phpunit` 826 tests / 2662 assertions OK (2 deprecations lama di `PayloadAllowlistTest` doc-comment metadata), `npm run test` 56 file / 748 tests, `npm run typecheck` + `npm run build` hijau; smoke 5 alur di browser nyata (PDF tim admin 200 application/pdf; back monitoring → `/monitoring` & direct → `/wfh`; dialog `/team-reports` `role=dialog`; label role humanis di `/admin/users`; attachment create→preview→hapus→draft, edit→DELETE 204→refetch, detail read-only). Rincian: `tasks/archive/{plan,todo}-cross-module-fixes.md`. |
