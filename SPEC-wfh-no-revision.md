# SPEC-wfh-no-revision

> Module id: `wfh-no-revision` — dari `CAPABILITY-MAP-wfh-change-flow.md` (Phase 0, diajukan 2026-11-23).
> Intent: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md` §A (approved).
> Plan: `docs/superpowers/plans/2026-11-23-wfh-change-flow-closeout.md` (tasks 1–2, 4).
> Depends on: — (domain `Wfh` berdiri sendiri).

## Objective

Menghapus flow revisi pada WFH personal dan menutup celah koreksinya: `rejected` menjadi status
terminal yang immutable, dan karyawan mengoreksi lewat **laporan baru untuk tanggal yang sama**
dengan absensi ikut berpindah. Approver tidak berubah: submit semua role → `pending` → kepala
bidang (`fields.head_id`).

**Success criteria (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | `POST /wfh/reports/{report}/revise` tidak ada; method `WfhReportStateMachine::revise` tidak ada; `canEdit()` true hanya `draft`; `isImmutable()` true untuk `approved` dan `rejected` | `RoutePermissionMatrixTest` (entri revise dihapus), `WfhReportStateMachineTest::test_can_edit_only_draft` + `test_rejected_is_immutable` |
| S2 | Laporan `rejected` menolak PUT update, DELETE, submit, approve — 422 dengan pesan draft-only/pending-guard | `RejectedReportRecoveryTest::test_rejected_report_rejects_mutation` |
| S3 | Setelah reject, `POST /wfh/reports` untuk (user, tanggal) sama membuat draft baru; laporan rejected tetap ada (2 baris) | `RejectedReportRecoveryTest::test_store_after_reject_creates_new_draft_not_rejected` |
| S4 | Absensi hidup milik laporan rejected untuk (user, date) berpindah ke laporan baru: `report_id` di-update, foto sama, tanpa duplikasi; laporan rejected tidak lagi memuat absensi | `RejectedReportRecoveryTest::test_new_report_inherits_rejected_attendances` |
| S5 | Unggah absensi sesi yang sudah terisi pada laporan recovery ditolak tanpa file yatim: tepat satu baris sesi itu, `photo_path` lama, file unggahan baru tidak ada di `Storage::disk('local')` | `RejectedReportRecoveryTest::test_conflicting_session_photo_on_recovery_is_skipped` |
| S6 | Partial unique index hanya mengunci `draft`: draft+draft (user, tanggal) sama → 23505; rejected+draft baru → sukses | `UniqueActiveDraftTest::test_reject_duplicate_active_draft` + `test_allow_new_draft_after_rejected` |
| S7 | Token verifikasi: laporan rejected mempertahankan `verification_token`-nya dan QR lama tidak lagi mengembalikan `terverifikasi`; laporan baru punya token sendiri yang lolos setelah approve | `VerificationTokenStabilityTest::test_rejected_report_keeps_token_and_new_report_verifies_independently` |
| S8 | FE: detail page rejected menampilkan alasan penolakan **tanpa** tombol revisi, editor mati (`canEditReport` draft saja); slice/api tanpa `reviseWfhReport` | `WfhReportDetailPage.test.tsx` + `wfhSlice.test.ts` + `wfh.test.ts` |
| S9 | UI list tidak menambah aksi per-baris: tombol global "Buat Laporan" + dialog tanggal menutup jalur koreksi (server get-or-create mengembalikan draft baru) | Perilaku server S3 + review `WfhReportsPage.tsx` tanpa perubahan aksi baris |

## Tech Stack

Laravel 12 (PHP 8.4), Postgres partial unique index, Spatie permission, Sanctum; React 19 +
Redux Toolkit + TypeScript strict + Vitest 5/jsdom. **Tidak ada dependency baru.**

## Commands

```bash
php artisan test --compact --filter="WfhReportStateMachineTest|RoutePermissionContractTest|RouteModelBindingContractTest|RoutePermissionMatrixTest|VerificationTokenStabilityTest"
php artisan test --compact --filter="UniqueActiveDraftTest|RejectedReportRecoveryTest"
php artisan test --compact tests/Feature/Wfh            # seluruh modul WFH
npx vitest run resources/js/pages/wfh/ resources/js/store/wfhSlice.test.ts resources/js/api/wfh.test.ts
npm run typecheck
vendor/bin/pint --test
```

## Project Structure

```
app/Domains/Wfh/Services/WfhReportStateMachine.php      → tanpa revise; canEdit/isImmutable baru
app/Domains/Wfh/Http/Controllers/ReportApprovalController.php → tanpa method revise
app/Domains/Wfh/Http/Controllers/ReportController.php   → store transaksional + relink; pesan draft-only
app/Domains/Wfh/Repositories/EloquentWfhRepository.php  → findDraftForUserDate (draft saja)
                                                          + relinkRejectedAttendances(userId, date, toReportId): list<string>
app/Domains/Wfh/Repositories/WfhRepositoryInterface.php → signature relink
routes/api.php                                          → tanpa route revise
database/migrations/2026_11_23_000001_narrow_active_draft_unique_index_to_draft.php
resources/js/pages/wfh/WfhReportDetailPage.tsx          → tanpa canRevise/tombol; canEditReport draft saja
resources/js/store/wfhSlice.ts + api/wfh.ts             → tanpa reviseWfhReport (thunk, matcher, komentar)
tests/Feature/Wfh/RejectedReportRecoveryTest.php        → BARU
```

## Code Style

Komentar teknis Inggris, pesan pengguna Indonesia; workflow state hanya `forceFill` (SEC-07).

```php
// Relink = pindah kepemilikan, bukan duplikasi: bukti kehadiran milik (user, tanggal, sesi).
public function relinkRejectedAttendances(int $userId, string $date, int $toReportId): array
{
    $rejectedIds = WfhReport::query()
        ->where('user_id', $userId)->where('report_date', $date)
        ->where('status', 'rejected')->pluck('id');
    if ($rejectedIds->isEmpty()) {
        return [];
    }

    $sessions = WfhAttendance::query()->whereIn('report_id', $rejectedIds)->pluck('session')->all();
    WfhAttendance::query()->whereIn('report_id', $rejectedIds)->update(['report_id' => $toReportId]);

    return $sessions;
}
```

```ts
// Satu pintu gate edit — dipakai semua aksi edit (rejected kini immutable).
export function canEditReport(status: WfhReport["status"]): boolean {
  return status === "draft";
}
```

**Dilarang:** `whereIn('status', ['draft', 'rejected'])` pada lookup draft; transisi
`rejected → draft` dalam bentuk apa pun; mass assignment kolom workflow.

## Testing Strategy

- PHPUnit 11 Feature + Unit; Vitest 5 + jsdom. TDD per task (RED → GREEN → commit).
- Unit: state machine (`canEdit`, `isImmutable`, tanpa revise).
- Feature kontrak: permission matrix & model binding tanpa op revise; guard mutasi rejected.
- Feature alur: recovery (S3–S5) + unique index (S6) + token (S7).
- Halaman/slice FE: S8; review list S9.
- Test lama yang mengikat perilaku lama dihapus/ditulis ulang (`test_can_revise_*`,
  `test_revise_report_requires_update_permission`, `test_revise_missing_report_*`,
  `test_reject_duplicate_rejected_report`, blok revise di test FE) — tidak dipertahankan.

## Boundaries

**Always do**

- Jalankan test WFH yang tersentuh sebelum menyatakan task selesai.
- Buat laporan baru dalam satu transaksi: create → relink → insert absensi (skip sesi konflik
  dengan menghapus file unggahan yatim).
- Pertahankan self-approval kepala bidang (Issue F) dan guard pending submit.

**Ask first**

- Mengubah pesan error guard lain di `ReportController` di luar yang disebut desain (#2).
- Menyentuh `TeamReportStateMachine`/`TeamReportController` (modul laporan tim — out of scope).

**Never do**

- Menghidupkan kembali revisi (endpoint, method, tombol, thunk) dalam bentuk apa pun.
- Menghapus foto absensi atau filenya saat relink; mengubah unique index ke bentuk non-parsial.
- Mass assignment workflow state; melemahkan test otorisasi.

## Success Criteria

S1–S9 terpenuhi dengan bukti perintah pada bagian masing-masing; `php artisan test --compact
tests/Feature/Wfh` hijau.

## Open Questions

Tidak ada — keputusan opsi B + rejected immutable + relink absensi dikunci di design doc.
