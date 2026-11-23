# SPEC-change-no-evaluator-input

> Module id: `change-no-evaluator-input` — dari `CAPABILITY-MAP-wfh-change-flow.md` (Phase 0, diajukan 2026-11-23).
> Intent: `docs/superpowers/specs/2026-11-23-wfh-change-flow-closeout-design.md` §B (approved).
> Plan: `docs/superpowers/plans/2026-11-23-wfh-change-flow-closeout.md` (tasks 3, 5).
> Depends on: — (domain `ChangeManagement` berdiri sendiri).

## Objective

Mencabut input evaluator pada paket perubahan (inisiasi + implementasi): evaluator otomatis =
**pengaju/pembuat paket (inisiator)**. Kolom `evaluator_id`/`evaluator_signed_at` di-drop
(cutover bersih), aturan validasi same-field dihapus, dan **blok evaluator di PDF implementasi
tetap dicetak** — nama, NIP, jabatan, bidang, dan tanda tangan bersumber dari inisiator. Flow
approval tidak berubah: draft → submit → kepala tim approve/reject, tanpa revisi.

**Success criteria (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | Kolom `evaluator_id` & `evaluator_signed_at` tidak ada di `change_implementations`; model tanpa keduanya di `$fillable`/casts/relasi `evaluator()` | `SchemaRelationshipTest`/migration hijau + `grep` gate `app/Domains/ChangeManagement` |
| S2 | Payload submit/create yang mengirim `implementation.evaluator_id` tetap sukses — field diabaikan (`array_intersect_key`), bukan 422; resource tidak memuat kunci evaluator | `ChangePackageFlowTest::test_submit_payload_with_evaluator_id_is_ignored` |
| S3 | `ChangePackageRules` tanpa `evaluator_id` di `IMPLEMENTATION_FIELDS`, tanpa rule `implementation.evaluator_id`, tanpa `evaluatorRule()`, tanpa prohibited `evaluator_signed_at` | Grep gate + suite rules hijau |
| S4 | `ChangePackagePdfData::forImplementation` menghasilkan kunci `evaluatorName`/`evaluatorNip`/`evaluatorPosition`/`evaluatorSig`/`evaluatorBidang` dari **inisiator**; template Blade `pdf.change-implementation.blade.php` tidak berubah | `ChangeManagementPdfDataTest` + `ChangeFormPdfTemplateTest` |
| S5 | Export PDF implementasi menolak (422) bila **inisiator** belum punya signature; guard memeriksa `[$package->initiator, $impl->reviewer, $impl->responsible]` | Test guard di `ChangeManagementPdfDataTest` (kasus inisiator tanpa signature) |
| S6 | FE form tanpa picker evaluator: state `evaluatorId`/`evaluators`, effect `listFieldUsers`, prefill, dan blok `<Field>` Combobox dihapus; payload draft/submit tanpa `evaluator_id` | `ChangePackageFormPage.test.tsx` + `npm run typecheck` |
| S7 | Modul `resources/js/api/users.ts` + `users.test.ts` dihapus; tipe `PickerUser`/`ListFieldUsersQuery` dihapus dari `api/types.ts`; **`components/ui/combobox.tsx` + test tetap ada** | Grep gate `resources/js/api/users*` + `npx vitest run resources/js/components/ui/combobox.test.tsx` hijau |
| S8 | `openapi.yaml` tanpa `evaluator_id`/`evaluator_signed_at` (schema request/response + contoh); deskripsi `GET /users` bukan lagi "picker evaluator" | Grep gate (task `contract-closeout`) |
| S9 | Flow approval tak tersentuh: guard pending 422 → scope 403 → self 403 tetap; tanpa revisi | Suite `ChangePackageFlowTest` hijau apa adanya |

## Tech Stack

Laravel 12 (PHP 8.4) + Postgres; Blade + DOMPDF; React 19 + RTK + TypeScript strict; Vitest 5.
**Tidak ada dependency baru.**

## Commands

```bash
php artisan test --compact --filter="ChangeManagementPdfDataTest|ChangeFormPdfTemplateTest|ChangePackageFlowTest"
php artisan test --compact tests/Feature/ChangeManagement
npx vitest run resources/js/pages/changes/ resources/js/api/
npm run typecheck
vendor/bin/pint --test
```

## Project Structure

```
database/migrations/2026_11_23_000002_drop_evaluator_columns_from_change_implementations.php
app/Domains/ChangeManagement/Models/ChangeImplementation.php       → tanpa evaluator*
app/Domains/ChangeManagement/Http/Requests/ChangePackageRules.php  → tanpa evaluatorRule()/field
app/Domains/ChangeManagement/Http/Resources/ImplementationResource.php → tanpa 2 kunci
app/Domains/ChangeManagement/Services/ChangePackagePdfData.php     → blok evaluator* dari inisiator
app/Domains/ChangeManagement/Repositories/EloquentChangeManagementRepository.php → eager load disesuaikan
app/Domains/ChangeManagement/Http/Controllers/ChangeManagementPdfController.php → guard inisiator
resources/js/pages/changes/ChangePackageFormPage.tsx               → tanpa picker
resources/js/api/types.ts                                          → tanpa tipe evaluator
resources/js/api/users.ts + users.test.ts                          → DIHAPUS
tests/Feature/EvaluatorSelectionTest.php                           → DIHAPUS
```

## Code Style

Komentar teknis Inggris, pesan pengguna Indonesia; workflow state hanya `forceFill` (SEC-07).

```php
// Sumber blok evaluator di PDF: inisiator — evaluator otomatis = pengaju paket.
'evaluatorBidang'  => $initiator?->team?->field?->name ?? '-',
'evaluatorName'    => $initiator ? strtoupper($initiator->name) : '-',
'evaluatorSig'     => $this->resolveSignature($initiator?->signature_path),
```

```ts
// Payload implementation — tanpa evaluator_id (server-side: evaluator = inisiator).
function implementationDraft(): PackageImplementationDraftInput {
  return { priority: ..., impact: ..., /* tanpa evaluator_id */ };
}
```

**Dilarang:** men-stamp `evaluator_id = initiator_id` (dua sumber kebenaran); relasi
`$impl->evaluator` dalam bentuk apa pun; restyle form di luar penghapusan blok picker.

## Testing Strategy

- PHPUnit 11 Feature; Vitest 5 + jsdom. TDD per task (RED → GREEN → commit).
- Feature: payload `evaluator_id` diabaikan (S2); PDF data & template dari inisiator (S4) +
  kasus inisiator tanpa signature (S5); flow approval tak berubah (S9).
- Halaman FE: form tanpa picker, payload tanpa evaluator (S6).
- Test lama yang mengikat perilaku lama dihapus: `EvaluatorSelectionTest` seluruhnya,
  assertion picker & fixture evaluator di test FE.
- Verifikasi render PDF nyata (tinker/Docker) sebagai bukti tambahan bila template disentuh —
  di sini template tidak berubah, jadi test struktural cukup.

## Boundaries

**Always do**

- Jalankan test ChangeManagement yang tersentuh sebelum menyatakan task selesai.
- Drop foreign key `evaluator_id` sebelum drop kolom (Postgres); `down()` membuat ulang keduanya
  nullable + FK `nullOnDelete` tanpa janji mengembalikan data (disepakati).
- Pastikan relasi `initiator.team.field` ter-load di jalur PDF implementasi.

**Ask first**

- Menghapus endpoint backend `GET /users` (kontrak publik issue #1) — hanya konsumen FE yang
  dicabut di modul ini.
- Mengubah `components/ui/combobox.tsx` (primitive generik, bukan milik picker).

**Never do**

- Mengisi ulang kolom evaluator atau menyimpan duplikat inisiator di mana pun.
- Menghapus blok tanda tangan evaluator di PDF atau mengganti sumbernya ke user lain.
- Mengubah guard approval (pending/scope/self) atau menghidupkan revisi paket.
- Mass assignment workflow state; menyentuh `vendor/` atau file generated.

## Success Criteria

S1–S9 terpenuhi dengan bukti perintah pada bagian masing-masing; `php artisan test --compact
tests/Feature/ChangeManagement` + `tests/Feature/ChangePackageFlowTest.php` hijau; gate grep
tanpa jejak `evaluator` di kontrak & kode FE terkait.

## Open Questions

Tidak ada — Opsi 1 (cutover bersih) dikunci di design doc; `GET /users` backend tetap (keputusan
#6), konsumen FE dihapus (keputusan #9), `Combobox` tetap.
