# SPEC-contract-closeout

> Module id: `contract-closeout` — dari `CAPABILITY-MAP-wfh-change-flow.md` (Phase 0, diajukan 2026-11-23).
> Intent: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md` (approved).
> Plan: `docs/superpowers/plans/2026-11-23-wfh-change-flow-closeout.md` (task 6).
> Depends on: `wfh-no-revision`, `change-no-evaluator-input` — kontrak hanya ditutup setelah
> kode kedua modul mendarat.

## Objective

Menutup kontrak API dan dokumen setelah dua modul perilaku mendarat, lalu memverifikasi seluruh
inisiatif: `openapi.yaml` tanpa op revise WFH dan tanpa field evaluator, SPEC modul terdampak
diperbarui, CHANGELOG mencatat perubahan untuk operator, dan kedua suite hijau. Termasuk
**verifikasi laporan tim (admin)** — flow `create → pending → approve/reject` tanpa revisi sudah
sesuai aturan dan tidak boleh tersentuh; buktinya adalah suite yang lulus tanpa perubahan kode.

**Success criteria (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | `openapi.yaml` tidak memuat path `/api/wfh/reports/{report}/revise`, operationId `reviseWfhReport`, atau field `evaluator_id`/`evaluator_signed_at`; deskripsi `GET /users` bukan lagi "picker evaluator"; kalimat "submit/approve/reject/revise" diganti tanpa revise | `grep -n "revise\|evaluator" postman/specs/openapi.yaml` kosong |
| S2 | `SPEC-wfh-reports.md`: flow `draft → pending → approved / rejected` tanpa revisi; tabel endpoint tanpa `/revise`; catatan "revisi dihapus 2026-11-23" + rujukan design doc | Review dokumen |
| S3 | `SPEC-change-package.md`: evaluator = inisiator (REQuery #1 ditutup sebagai digugurkan); catatan rujukan yang sama | Review dokumen |
| S4 | `CHANGELOG.md` `[Unreleased]` mencatat: revisi WFH dihapus (rejected terminal, laporan baru untuk tanggal sama, absensi ikut), evaluator paket perubahan otomatis inisiator, kolom DB di-drop, konsumen FE `GET /users` dilepas | Review dokumen |
| S5 | Laporan tim (admin) tanpa perubahan kode: flow create → pending → approve/reject lulus; tidak ada tombol revisi yang bocor dari komponen bersama | `php artisan test --compact tests/Feature/Wfh/TeamReportTest.php` + review `TeamReportsPage.tsx` |
| S6 | Seluruh suite hijau pada baseline tercatat: `php artisan test --compact` (baseline 813 tests / 2595 assertions, 2026-11-23 — angka boleh bergeser wajar karena test dihapus/ditambah) dan `npx vitest run` + `npm run typecheck` + `vendor/bin/pint --test` exit 0 | Perintah verifikasi penuh |
| S7 | Grep gate struktural: `grep -rn "revise" routes/api.php resources/js/store/wfhSlice.ts resources/js/api/wfh.ts` kosong; `grep -rn "evaluator" app/Domains/ChangeManagement` kosong | Perintah gate |

## Tech Stack

Dokumen Markdown + YAML; verifikasi memakai toolchain yang sudah ada (PHPUnit 11, Vitest 5,
Pint, tsc). **Tidak ada dependency baru.**

## Commands

```bash
grep -n "revise" postman/specs/openapi.yaml routes/api.php resources/js/store/wfhSlice.ts resources/js/api/wfh.ts
grep -n "evaluator" postman/specs/openapi.yaml app/Domains/ChangeManagement
php artisan test --compact tests/Feature/Wfh/TeamReportTest.php
vendor/bin/pint --test && php artisan test --compact && npx vitest run && npm run typecheck
```

## Project Structure

```
postman/specs/openapi.yaml        → kontrak API (satu sumber kebenaran op/field)
SPEC-wfh-reports.md               → SPEC modul WFH lama; diperbarui + catatan
SPEC-change-package.md            → SPEC modul change lama; diperbarui + catatan
CHANGELOG.md                      → [Unreleased] perubahan inisiatif
SPEC.md + CAPABILITY-MAP-wfh-change-flow.md + SPEC-<module>.md → dokumen inisiatif ini
```

## Code Style

Markdown prosa; tabel untuk matriks peran; catatan penghapusan perilaku selalu menyertakan
tanggal dan rujukan design doc (`docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md`).

```yaml
# openapi.yaml — deskripsi GET /users setelah picker evaluator dilepas
summary: List active users for field-scoped dropdowns
description: >
  Field-scoped active users for authenticated non-admin callers.
  Former consumer (change-package evaluator picker) removed 2026-11-23.
```

**Dilarang:** mendeskripsikan op/field yang sudah tidak ada; menulis "deprecated" untuk sesuatu
yang dihapus bersih (cutover, bukan sunset).

## Testing Strategy

- Tidak ada test baru di modul ini — ini modul verifikasi & dokumentasi.
- Bukti: grep gate (S1, S7), suite `TeamReportTest` (S5), suite penuh backend + FE + typecheck +
  lint (S6), review dokumen (S2–S4).
- Baseline pembanding: 813 tests / 2595 assertions (2026-11-23, sebelum perubahan).

## Boundaries

**Always do**

- Tutup kontrak pada perubahan kode yang sama dengan inisiatifnya — jangan menunda.
- Catat angka suite baru hasil verifikasi penuh di CHANGELOG atau commit message.

**Ask first**

- Menghapus endpoint backend `GET /users` atau permission yang menjadi yatim
  (`wfh.report.update` kini hanya dipakai edit metadata & sub-resource — jangan dihapus di sini).
- Menulis ulang SPEC modul lain di luar dua yang tercantum.

**Never do**

- Menghapus/mengubah test otorisasi (permission matrix, SoD, visibility) agar lulus.
- Mendeskripsikan ulang perilaku lama (revise/evaluator) di dokumen mana pun.
- Menyatakan closeout sebelum suite penuh hijau.

## Success Criteria

S1–S7 terpenuhi; inisiatif ditutup dengan satu commit docs + bukti verifikasi penuh.

## Open Questions

Tidak ada.
