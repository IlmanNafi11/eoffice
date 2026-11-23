# Spec: WFH & Change Flow Closeout (eoffice)

> Module ids and build order: `CAPABILITY-MAP-wfh-change-flow.md` (Phase 0, diajukan 2026-11-23).
> Per-module specs: `SPEC-wfh-no-revision.md`, `SPEC-change-no-evaluator-input.md`,
> `SPEC-contract-closeout.md`.
> Source of intent: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-23-wfh-change-flow-closeout.md` (tasks 1–6).

## Objective

Menyelaraskan tiga alur persetujuan dengan aturan bisnis yang dinyatakan pemilik produk,
secara sistematis dan menyeluruh:

1. **WFH personal** — submit (semua role) → `pending` → kepala bidang approve/reject.
   **Tidak ada flow revisi**: `rejected` terminal & immutable; jalur koreksi = laporan baru
   untuk tanggal yang sama, dengan absensi ikut berpindah.
2. **Laporan tim (admin)** — create → `pending` → kepala bidang approve/reject, tanpa revisi.
   Sudah sesuai; hanya diverifikasi, tidak diubah.
3. **Paket perubahan (inisiasi + implementasi)** — ajukan → kepala tim approve/reject,
   tanpa revisi; **tidak ada input evaluator** — evaluator otomatis = pengaju/pembuat, dan
   blok evaluator di PDF implementasi (termasuk tanda tangan) tetap dicetak, bersumber dari
   inisiator.

**User:** staf & kepala bidang (WFH personal), admin + kepala bidang (laporan tim), staf/kepala
tim sebagai inisiator + kepala tim sebagai approver (paket perubahan). **Konsumen kontrak
internal:** SPA pages/slices terkait dan `postman/specs/openapi.yaml`.

**Success inisiatif (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| I1 | Route, method state machine, thunk, tombol "Revisi laporan", dan matcher Redux `revise` tidak ada lagi di kode | `grep` gate + `php artisan test --compact --filter="RoutePermissionContractTest|RouteModelBindingContractTest|RoutePermissionMatrixTest"` |
| I2 | Laporan `rejected` immutable: PUT/DELETE/submit/approve ditolak; `canEdit` hanya `draft`; `isImmutable` mencakup `approved` dan `rejected` | `tests/Feature/Wfh/RejectedReportRecoveryTest.php::test_rejected_report_rejects_mutation` + `WfhReportStateMachineTest::test_rejected_is_immutable` |
| I3 | Setelah reject, `POST /wfh/reports` untuk (user, tanggal) sama membuat **draft baru**; laporan rejected tetap ada; absensi hidup laporan rejected berpindah ke laporan baru (foto sama, tanpa duplikasi) | `RejectedReportRecoveryTest` (4 test) + `UniqueActiveDraftTest::test_allow_new_draft_after_rejected` |
| I4 | `POST /changes`/`/changes/{id}/submit` dengan payload berisi `evaluator_id` tetap sukses — field diabaikan, bukan 422 | `ChangePackageFlowTest::test_submit_payload_with_evaluator_id_is_ignored` |
| I5 | PDF implementasi mencetak blok evaluator (nama, NIP, jabatan, bidang, tanda tangan) dari **inisiator**; export ditolak bila inisiator belum punya signature | `ChangeManagementPdfDataTest` + `ChangeFormPdfTemplateTest` + guard `ChangeManagementPdfController::exportImplementation` |
| I6 | Kontrak API tidak lagi memuat op revise WFH dan field `evaluator_id`/`evaluator_signed_at`; FE modul `api/users` dihapus, `Combobox` tetap | `grep` gate `openapi.yaml` + `resources/js/api/users*` tidak ada + suite `combobox.test.tsx` hijau |
| I7 | Laporan tim (admin): flow create → pending → approve/reject tetap lulus tanpa perubahan kode | `tests/Feature/Wfh/TeamReportTest.php` hijau apa adanya |
| I8 | Kedua suite hijau pada baseline tercatat | `php artisan test --compact` (baseline: 813 tests / 2595 assertions, 2026-11-23) dan `npx vitest run` exit 0 |

## Tech Stack

- Laravel 12 (`^12.69`, PHP `^8.2`, host 8.4) + PostgreSQL (test DB `eoffice_test`); Spatie
  permission; Sanctum; Blade + DOMPDF untuk PDF.
- React 19 + Redux Toolkit + TypeScript strict + Tailwind + Vite.
- PHPUnit 11 (Feature) + Vitest 5/jsdom + Testing Library.
- **Tidak ada dependency baru** di frontend maupun backend.

## Commands

Host punya `php`, `composer`, `vendor/`, `node_modules/` (toolchain lokal terverifikasi).

```bash
# Frontend
npx vitest run                                        # semua test FE
npx vitest run resources/js/pages/wfh/               # area WFH
npx vitest run resources/js/pages/changes/ resources/js/api/
npm run typecheck
npm run build

# Backend
php artisan test --compact                           # suite penuh (baseline 813 tests / 2595 assertions)
php artisan test --compact --filter="WfhReportStateMachineTest|VerificationTokenStabilityTest"
php artisan test --compact --filter="UniqueActiveDraftTest|RejectedReportRecoveryTest"
php artisan test --compact tests/Feature/ChangePackageFlowTest.php
php artisan test --compact tests/Feature/ChangeManagement

# Lint & kontrak
vendor/bin/pint --test
grep -n "revise" routes/api.php postman/specs/openapi.yaml      # harus kosong (gate I1/I6)
grep -n "evaluator" postman/specs/openapi.yaml                  # harus kosong (gate I6)
```

## Project Structure

```
app/Domains/Wfh/
  Services/WfhReportStateMachine.php   → tanpa revise(); canEdit draft saja; isImmutable approved+rejected
  Http/Controllers/ReportApprovalController.php → tanpa method revise
  Http/Controllers/ReportController.php         → store: transaksi create + relink absensi; pesan draft-only
  Repositories/EloquentWfhRepository.php        → findDraftForUserDate (draft saja) + relinkRejectedAttendances
app/Domains/ChangeManagement/
  Models/ChangeImplementation.php      → tanpa evaluator_id/evaluator_signed_at/relasi evaluator()
  Http/Requests/ChangePackageRules.php → tanpa evaluatorRule() & field evaluator
  Services/ChangePackagePdfData.php    → blok evaluator* dari inisiator
  Http/Controllers/ChangeManagementPdfController.php → signature guard: inisiator menggantikan evaluator
database/migrations/2026_11_23_*      → 2 migration baru (narrow index; drop kolom evaluator)
resources/js/
  pages/wfh/WfhReportDetailPage.tsx    → tanpa canRevise/tombol revisi; canEditReport draft saja
  store/wfhSlice.ts, api/wfh.ts        → tanpa reviseWfhReport
  pages/changes/ChangePackageFormPage.tsx → tanpa picker evaluator
  api/types.ts, api/users.ts           → tanpa tipe evaluator; users.ts DIHAPUS
  components/ui/combobox.tsx           → TETAP (primitive generik, bukan milik picker)
tests/Feature/Wfh/RejectedReportRecoveryTest.php → BARU (regresi inti jalur koreksi)
postman/specs/openapi.yaml            → kontrak API (tanpa revise, tanpa evaluator)
docs/superpowers/                     → sumber desain & plan (di-gitignore, tidak di-commit)
```

Konvensi penempatan yang **wajib**: akses jaringan hanya di `api/`; workflow state hanya lewat
`forceFill` (SEC-07); migration bernama tanggal `2026_11_23_*` anonymous class.

## Code Style

Naming: komponen `PascalCase`, fungsi `camelCase`, tipe `PascalCase`; komentar teknis bahasa
Inggris, pesan pengguna bahasa Indonesia. Pesan sukses/gagal memakai kalimat server dari envelope.

```php
// app/Domains/Wfh/Services/WfhReportStateMachine.php — guard satu kalimat, domain Indonesia
public function canEdit(WfhReport $report): bool
{
    return $report->status === 'draft';
}
```

```php
// relink absensi — bukti kehadiran milik (user, tanggal, sesi), bukan milik satu versi laporan
$sessions = WfhAttendance::query()->whereIn('report_id', $rejectedIds)->pluck('session')->all();
WfhAttendance::query()->whereIn('report_id', $rejectedIds)->update(['report_id' => $toReportId]);
```

```ts
// resources/js/api/types.ts — tipe implementasi tanpa evaluator
export interface PackageImplementationDraftInput {
  priority: "normal" | "emergency" | null;
  impact: "Minor" | "Mayor" | null;
  // … tanpa evaluator_id — evaluator = inisiator, server-side
}
```

**Dilarang:**

```php
WfhReport::where('user_id', $id)->whereIn('status', ['draft', 'rejected'])  // lookup lama
$impl->evaluator                                                            // relasi yang dihapus
```

## Testing Strategy

- Framework: Vitest 5 + jsdom (frontend); PHPUnit 11 Feature (backend).
- Lokasi: test di samping file (`*.test.ts(x)`); backend `tests/Feature/**` + `tests/Unit/**`.
- Level:
  - **Unit** — state machine (`canEdit`, `isImmutable`, tanpa `revise`).
  - **Feature kontrak** — route permission matrix & model binding tanpa op revise; guard mutasi
    laporan rejected (PUT/DELETE/submit/approve ditolak).
  - **Feature alur** — recovery setelah reject (draft baru + relink absensi + skip foto konflik);
    payload `evaluator_id` diabaikan; PDF implementasi dari inisiator.
  - **Halaman FE** — detail page rejected: alasan tampil, tanpa tombol revisi, editor mati;
    form change tanpa picker, payload tanpa `evaluator_id`.
  - **Slice** — matcher mutasi tanpa `revise`; test revise dihapus.
- TDD wajib per task: test gagal → implementasi → hijau (lihat plan tasks 1–6).
- Coverage: tanpa target persentase; setiap perilaku yang dijanjikan spec punya assertion.
- Test lama yang mengikat perilaku yang dihapus (`EvaluatorSelectionTest`, test revise,
  `test_reject_duplicate_rejected_report`) **dihapus/ditulis ulang**, bukan dipertahankan.

## Boundaries

**Always do**

- Jalankan test area yang tersentuh sebelum menyatakan task selesai; suite penuh sebelum closeout.
- Ikuti keputusan mengikat design doc §"Keputusan builder" #1–#10 (rejected immutable termasuk
  hapus; absensi dipindah; kolom evaluator di-drop; tanpa UI per-baris).
- Sesuaikan `openapi.yaml` dan SPEC modul pada perubahan kontrak yang sama dengan kodenya.
- Pertahankan guard otorisasi yang ada: self-approval WFH (Issue F), SoD laporan tim,
  guard paket perubahan (pending 422 → scope 403 → self 403).

**Ask first**

- Menghapus endpoint backend `GET /users` (kontrak publik issue #1) atau permission
  `wfh.report.update` yang kini tak terpakai oleh revise.
- Menyentuh `ChangePackagePdfData`/template Blade di luar penggantian sumber blok evaluator.
- Perubahan skema lain di luar dua migration `2026_11_23_*` yang tercantum.
- Menambah dependency apa pun.

**Never do**

- Menghidupkan kembali flow revisi WFH dalam bentuk apa pun (endpoint, tombol, status transisi).
- Mengisi ulang/meng-stamp `evaluator_id`/`evaluator_signed_at` sebagai duplikat inisiator.
- Menghapus blok tanda tangan evaluator di PDF implementasi atau mengganti sumbernya ke user lain.
- Menghapus/mengubah test otorisasi (permission matrix, SoD, visibility scope) agar lulus.
- Mengubah workflow state lewat mass assignment (selalu `forceFill`).
- Menyimpan/menyajikan foto absensi atau lampiran di disk publik.

## Success Criteria

I1–I8 terpenuhi dengan bukti perintah yang tercantum. Rincian per modul ada di
`SPEC-wfh-no-revision.md`, `SPEC-change-no-evaluator-input.md`, `SPEC-contract-closeout.md`.

## Open Questions

Tidak ada. Keputusan yang mengikat: opsi B (rejected terminal + laporan baru untuk tanggal sama
dengan relink absensi), Opsi 1 cutover bersih kolom evaluator, `GET /users` backend tetap sambil
konsumen FE dihapus, `Combobox` tetap, dan tanpa UI "buat laporan" per baris.
