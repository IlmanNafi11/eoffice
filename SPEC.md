# SPEC: WFH UX Remediation + QR Cut-off

> Capability map (Phase 0, approved 2026-11-28): tiga modul — `wfh-qr-cutoff`,
> `wfh-correction-prefill`, `wfh-report-actions`. Build order: qr-cutoff →
> correction-prefill → report-actions; tidak ada siklus. Tiap modul punya suite
> test sendiri dan bisa dinilai terpisah. **Status: CLOSED 2026-11-28** —
> T1–T9 selesai, gate penuh hijau, closure log di `CAPABILITY-MAP.md`.
>
> Intent & keputusan yang disetujui owner:
> `docs/superpowers/specs/2026-11-28-wfh-ux-remediation-design.md` (approved
> 2026-11-28, builder check passed). Rencana implementasi TDD (8 task):
> `docs/superpowers/plans/2026-11-28-wfh-ux-remediation.md`.
>
> Catatan penamaan root: `SPEC.md` sebelumnya berisi spec Laporan Tim (Detail,
> Filter, Toggle Tema) yang seluruh modulnya sudah CLOSED; dipindah ke
> `SPEC-team-reports.md` dan rujukan di `CAPABILITY-MAP.md` +
> `CAPABILITY-MAP-dashboard.md` sudah diperbarui.

## Capability Map

| Module id | Tanggung jawab | Depends on | Backend change | Selesai bila |
|---|---|---|---|---|
| `wfh-qr-cutoff` | Penghapusan total fitur QR/verifikasi dokumen: service, token (3 tabel), endpoint `/api/verify`, redirect text/html, halaman SPA `/verify/:token`, blok `.qr-box` di kedua template PDF, dependency `bacon/bacon-qr-code`, test & rujukan spec | — | Ya: migration drop kolom `verification_token` di `wfh_reports`, `change_initiations`, `wfh_team_reports`; hapus route, controller, service, trait-minting | `QrCodeServiceTest`, `QrVerificationTest`, `VerificationTokenStabilityTest` dihapus; `WfhReportPdfDataTest`/`WfhReportPdfTemplateTest`/`ChangeManagementPdfDataTest` hijau tanpa `qrSvg`; full suite hijau |
| `wfh-correction-prefill` | Aturan "satu laporan non-rejected per (user, tanggal)": migrasi unique absensi → `(report_id, session)` + index laporan → `status IN ('draft','pending','approved')`; guard lintas-laporan di `submit()`; copy (bukan move) kegiatan+link+absensi+foto dari rejected terbaru ke draft perbaikan; pesan 422 "menunggu keputusan" untuk store/update | `wfh-qr-cutoff` (bersih dulu kolom & test-nya agar migration tidak tabrakan test) | Ya: satu migration pair + perubahan `ReportController`, `ReportAttendanceController`, `EloquentWfhRepository`, `WfhReportStateMachine`, interface repo | `RejectedReportCorrectionTest` (rename+perluas `RejectedReportRecoveryTest`) + `UniqueActiveDraftTest` (diperluas) hijau; arsip rejected terbukti utuh |
| `wfh-report-actions` | Shortcut "Buat Laporan Perbaikan" di detail rejected; kolom "Aksi" dropdown per baris di list personal (`/wfh`) — Detail, Edit (draft), Hapus (draft), Unduh PDF (pending/approved) — gate permission; klik baris tetap buka detail; Monitoring tidak berubah | `wfh-correction-prefill` (shortcut bergantung pada prefill server; dropdown independen secara kode tapi divalidasi setelah flow koreksi utuh) | Tidak ada | `WfhReportDetailPage.test.tsx` + `WfhReportsPage.test.tsx` + `report-row.test.tsx` hijau; typecheck + build bersih |

**Alasan urutan:** qr-cutoff paling mandiri dan menghapus test yang akan
menabrak migration modul berikutnya; correction-prefill memegang seluruh
perubahan skema + kontrak store; report-actions murni frontend dan butuh
perilaku store hasil prefill untuk diuji end-to-end.

**Dependency direction:** satu arah, tanpa siklus. Antarmuka lintas-modul:
- `wfh-correction-prefill` → kontrak API `POST /api/wfh/reports` tetap
  (get-or-create + 201/200); baru: 422 dengan pesan domain saat diblokir
  `pending`/`approved`.
- `wfh-report-actions` → thunk `createWfhReport({report_date})`,
  `deleteWfhReport(id)`, `exportWfhReportPdf(id)` (semua existing); tanpa
  endpoint baru.

## Objective

Tiga temuan usability di modul WFH personal ditambah satu fitur mati yang
dipotong:

1. **QR tidak pernah bermakna.** Rantai QR lengkap ter-wire (token per
   dokumen, service, endpoint verify, halaman SPA, blok `.qr-box` di PDF)
   tetapi Dompdf 3.x tidak merender SVG inline sehingga QR tidak pernah muncul
   di PDF cetakan; tidak ada fitur lain yang memakainya. Keputusan owner:
   potong total, bukan perbaiki render.
2. **Koreksi kehilangan kerja.** Setelah penolakan, laporan baru hanya
   mewarisi foto absensi — dan itu pun dengan cara **memindahkan** barisnya,
   mengosongkan arsip laporan rejected. Kegiatan (jam, nama, link) tidak
   dibawa sama sekali sehingga user mengetik ulang semuanya.
3. **Pintu masuk koreksi terkubur.** User membaca alasan di detail, kembali ke
   list, mengingat tanggal, lalu membuat laporan baru dari sana.
4. **List tanpa aksi per baris.** Klik baris membuka detail, tapi edit/hapus/
   unduh PDF harus dicari di tempat lain.

Prinsip owner (2026-11-28): laporan rejected adalah **arsip/history** — tidak
boleh ada data yang hilang darinya (copy, never move); **satu laporan
non-rejected per (user, tanggal)** sebagai anti-spam submit (pending/approved
mengunci tanggal sampai rejected); perubahan skema diperbolehkan demi
kebenaran, efisiensi (tanpa N+1), dan best practice.

Target pengguna:

| Role | Yang berubah untuk mereka |
|---|---|
| staf (pemilik laporan) | koreksi pasca-reject tinggal cek & perbaiki (prefill penuh); tombol "Buat Laporan Perbaikan" di detail rejected; aksi per baris di list; diblokir jelas saat tanggal terkunci pending/approved |
| kepala bidang | tidak berubah alurnya (submit → pending → keputusan); PDF tanpa QR kosong |
| admin | list personal punya aksi per baris sesuai permission; monitoring tetap row-click |

**Success = semua kondisi ini benar:**

1. Tidak ada jejak QR/verifikasi di kode, skema, route, SPA, PDF, dependency,
   dan dokumen kontrak; suite penuh hijau tanpa test QR.
2. Setelah reject, `POST /wfh/reports` untuk (user, tanggal) sama membuat
   draft baru yang berisi: kegiatan+link hasil **copy** dari rejected terbaru,
   absensi (baris + file foto) hasil **copy**. Laporan rejected tetap memuat
   semua datanya (kegiatan, link, absensi) — diverifikasi test.
3. Tanggal dengan laporan `draft`/`pending`/`approved` menolak laporan baru
   (dan perubahan `report_date` ke tanggal terkunci) dengan pesan Indonesia
   yang membedakan "sudah ada draft" (get-or-create) vs "menunggu keputusan"
   (422) vs "sudah final" (422); dua `pending` mustahil (guard `submit()` +
   index).
4. Detail rejected milik sendiri menampilkan tombol "Buat Laporan Perbaikan"
   yang membuat draft dan langsung menavigasi ke sana.
5. Setiap baris `/wfh` punya dropdown "Aksi" berisi Detail, Edit (draft +
   `wfh.report.update`), Hapus (draft + `wfh.report.delete`), Unduh PDF
   (`pending|approved` + `wfh.report.export_pdf`); aksi tak diizinkan tidak
   dirender; klik baris tetap buka detail; Monitoring tak berubah.
6. Absensi hasil copy mempertahankan `date` + `check_in_at` asli (bukti
   bisnis); hanya `created_at`/`updated_at` yang baru.

## Tech Stack

Backend (existing; **dependency dikurangi**, bukan ditambah):

- PHP `^8.2` (host 8.4), Laravel `^12.69`, Sanctum, `spatie/laravel-permission`,
  Postgres (partial unique index).
- `bacon/bacon-qr-code` **dihapus** dari `composer.json` (require-dev) pada
  modul `wfh-qr-cutoff`.
- Domain `app/Domains/Wfh/` + `app/Domains/ChangeManagement/`,
  `app/Support/{QrCode,Media,Pdf,Signature}`, envelope `ApiResponse`.

Frontend (existing, tanpa dependensi baru):

- React `^19`, Vite, Redux Toolkit, TypeScript strict, Vitest 5 + jsdom,
  Tailwind v4 + shadcn/radix.
- Primitif dipakai ulang: `DropdownMenu`, `Button`, `WfhStatusBadge`,
  `PdfDownloadButton`, `WfhReportRow`, toast `sonner`.

## Commands

Dari root repo:

```
# Backend — per modul
php artisan test --compact --filter="QrVerificationTest|QrCodeServiceTest"      # Task 1: harus 404 test setelah dihapus
php artisan test --compact tests/Feature/Wfh/WfhReportPdfDataTest.php tests/Feature/Wfh/WfhReportPdfTemplateTest.php
php artisan test --compact tests/Feature/ChangeManagement
php artisan test --compact --filter="RejectedReportCorrectionTest|UniqueActiveDraftTest|DuplicateRecoveryTest|WfhReportStateMachineTest"
php artisan test --compact tests/Feature/Wfh            # seluruh modul WFH

# Backend — penuh & lint
php artisan test --compact
vendor/bin/pint --test
make lint

# Frontend
npm test -- resources/js/pages/wfh/ resources/js/components/wfh/ resources/js/store/wfhSlice.test.ts resources/js/api/wfh.test.ts
npm run typecheck
npm run build

# Gerbang lengkap sebelum closeout
make ci
```

Bila host tidak punya PHP/vendor: `docker compose exec app php artisan test --compact --filter=...`
(skill `eoffice-laravel-docker-test-harness`).

## Project Structure

```
database/migrations/
  2026_11_28_000001_drop_verification_tokens_for_qr_cutoff.php   → NEW: drop kolom token (3 tabel)
  2026_11_28_000002_rekey_attendance_and_widen_report_lock.php   → NEW: unique absensi (report_id, session)
                                                                    + index laporan IN (draft,pending,approved)
                                                                    + delete orphan attendance + fail-fast collision

app/Support/QrCode/QrCodeService.php                             → DELETE
app/Http/Controllers/QrVerificationController.php                → DELETE
routes/api.php                                                   → hapus route /api/verify/{token} + redirect text/html
app/Domains/Wfh/Services/Concerns/TransitionsReportState.php     → hapus minting token (trait tetap untuk pending guard)
app/Domains/Wfh/Services/WfhReportPdfData.php                    → tanpa QrCodeService/qrSvg
app/Domains/ChangeManagement/Services/ChangePackagePdfData.php   → idem
resources/views/pdf/wfh-report.blade.php                         → hapus blok .qr-box + @if qrSvg
resources/views/pdf/change-initiation.blade.php                  → idem
composer.json / composer.lock                                    → hapus bacon/bacon-qr-code

app/Domains/Wfh/Repositories/WfhRepositoryInterface.php          → relinkRejectedAttendances GANTI
                                                                    copyRejectedDataToReport(int $userId, string $date, WfhReport $target): void
app/Domains/Wfh/Repositories/EloquentWfhRepository.php           → implementasi copy (activities+links, attendances+foto via
                                                                    PrivateMediaPath::resolveAny); findAttendanceByUserAndDate
                                                                    → scope laporan aktif; findDraftForUserDate tetap draft-only
app/Domains/Wfh/Http/Controllers/ReportController.php            → store: copy prefill + pemetaan 23505 (draft/pending/approved)
app/Domains/Wfh/Http/Controllers/ReportAttendanceController.php  → guard duplikat sesi per laporan aktif
app/Domains/Wfh/Services/WfhReportStateMachine.php               → submit(): guard lintas-laporan (tanggal terkunci)

tests/Feature/Wfh/RejectedReportCorrectionTest.php               → NEW (rename+perluas RejectedReportRecoveryTest):
                                                                    arsip utuh, copy lengkap, tidak dobel, foto tersalin
tests/Feature/Wfh/UniqueActiveDraftTest.php                      → perluas: draft/pending/approved mengunci; rejected tidak
tests/Feature/Wfh/VerificationTokenStabilityTest.php             → DELETE
tests/Feature/QrVerificationTest.php, tests/Unit/QrCodeServiceTest.php → DELETE
tests/Feature/SecurityRegressionTest.php                         → buang kasus token QR (regresi lain tetap)

resources/js/
  pages/verification/ (VerifyPage + test)                        → DELETE
  api/verification.ts (+ test)                                   → DELETE
  api/types.ts                                                   → hapus blok "QR Verification"
  routes/index.tsx                                               → hapus route /verify/:token + lazy VerifyPage
  pages/wfh/WfhReportDetailPage.tsx (+ test)                     → tombol "Buat Laporan Perbaikan" (rejected, owner)
  pages/wfh/WfhReportsPage.tsx (+ test)                          → kolom "Aksi" + header kolom
  components/wfh/report-row.tsx (+ test)                         → prop opt-in `actions?` (dropdown), default tanpa
  store/wfhSlice.ts                                              → tanpa perubahan kontrak (thunk existing dipakai)

postman/specs/openapi.yaml                                       → hapus tag/path Verification + 302; bump minor (v6.9.0)
CHANGELOG.md / CAPABILITY-MAP*.md / SPEC-qr-spa-redirect.md      → entri Removed/Changed + status modul

docs/superpowers/specs/2026-11-28-wfh-ux-remediation-design.md   → intent (approved)
docs/superpowers/plans/2026-11-28-wfh-ux-remediation.md          → langkah TDD per task
SPEC.md                                                          → file ini
```

## Code Style

Backend — copy sebagai satu operasi repo yang dipanggil di dalam transaksi
store; komentar menjelaskan keputusan arsip, bukan mekanik:

```php
// EloquentWfhRepository — copy, never move: a rejected report is archive.
public function copyRejectedDataToReport(int $userId, string $date, WfhReport $target): void
{
    $source = WfhReport::query()
        ->where('user_id', $userId)->where('report_date', $date)
        ->where('status', 'rejected')
        ->with(['activities.links', 'attendances'])
        ->latest('id')->first();
    if (! $source) {
        return;
    }
    // ... insert activities+links (sort_order & url dipertahankan),
    //     attendances (date & check_in_at asli; foto disalin ke private disk)
}

// ReportController::store — pemetaan race yang membedakan tiga keadaan
} catch (QueryException $e) {
    if ($e->getCode() === '23505') {
        if ($existing = $this->wfhRepository->findDraftForUserDate($user->id, $date)) {
            return ApiResponse::ok(new WfhReportResource($existing->load([...])), 'Laporan WFH sudah ada.');
        }
        return ApiResponse::fail('Masih ada laporan untuk tanggal tersebut (menunggu keputusan atau sudah final).', 422);
    }
    throw $e;
}
```

Frontend — aksi gate permission dan status, bukan role; aksi tak diizinkan
tidak dirender:

```tsx
// report-row.tsx — menu Aksi (opt-in; Monitoring tidak mengirim prop)
{actions && (
  <td className="py-2 pr-4 text-right">
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Aksi"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && <Item onSelect={onEdit} icon={Pencil}>Edit</Item>}
        {canDelete && <Item onSelect={onDelete} icon={Trash2}>Hapus</Item>}
        {canDownloadPdf && <Item onSelect={onDownload} icon={Download}>Unduh PDF</Item>}
      </DropdownMenuContent>
    </DropdownMenu>
  </td>
)}
```

Konvensi:

- PHP: `PascalCase` kelas, `camelCase` method; workflow state hanya lewat
  `forceFill` (SEC-07); satu method satu tanggung jawab; komentar Inggris,
  pesan pengguna Indonesia.
- TS: komponen `PascalCase`, tipe domain di `api/types.ts`, tanpa `any` baru.
- UI copy Indonesia; label status hanya dari `WfhStatusBadge`.
- Foto privat selalu `fetchAttendanceObjectUrl` (bearer) — tidak pernah
  `<img src>` langsung atau `/storage`.
- Envelope error konsisten `ApiResponse::fail(pesan, kode)`; tidak pernah
  membocorkan detail internal (kode SQL, trace).

## Testing Strategy

| Level | Framework | Lokasi | Menguji |
|---|---|---|---|
| Backend feature | PHPUnit | `tests/Feature/Wfh/RejectedReportCorrectionTest.php` | copy lengkap (kegiatan+link+absensi+foto), arsip rejected utuh pasca-copy, re-create tidak menduplikasi, sesi konflik ditolak tanpa file yatim, `check_in_at` asli |
| Backend feature | PHPUnit | `tests/Feature/Wfh/UniqueActiveDraftTest.php` | draft/pending/approved mengunci (23505); rejected membuka; dua pending mustahil via guard submit |
| Backend feature | PHPUnit | `tests/Feature/Wfh/ReportStoreUpdateTest.php` | get-or-create; 422 pesan pending/approved; `update()` tanggal terkunci → 422 bukan 500 |
| Backend regression | PHPUnit | `WfhReportPdfDataTest`, `WfhReportPdfTemplateTest`, `ChangeManagementPdfDataTest`, `ChangeFormPdfTemplateTest` | tidak ada `qrSvg`/`.qr-box` di view-data maupun HTML ter-render; tanda tangan & kop tak berubah |
| Backend feature | PHPUnit | `DuplicateRecoveryTest` | race 23505 tetap pulih (draft) / 422 (terkunci), tanpa file yatim |
| Migration | PHPUnit | `tests/Feature/Wfh/SchemaRelationshipTest.php` (+ kasus baru) | unique `(report_id, session)` live-rows; index laporan mencakup 3 status; orphan terhapus; collision fail-fast |
| Frontend unit | Vitest + jsdom | `api/wfh.test.ts`, `store/wfhSlice.test.ts` | `createWfhReport` dipakai shortcut; `deleteWfhReport` menghapus baris list; 422 terkonsumsi jadi pesan |
| Frontend komponen | Vitest + jsdom | `components/wfh/report-row.test.tsx` | menu Aksi hanya dengan prop; item ter-gate status+permission; tanpa prop → tidak ada kolom |
| Frontend halaman | Vitest + jsdom | `WfhReportsPage.test.tsx`, `WfhReportDetailPage.test.tsx` | kolom Aksi di list personal; klik baris tetap navigasi; tombol perbaikan hanya rejected+owner → create+navigate; Monitoring tanpa kolom |
| Manual/E2E | browser | staf + kepala bidang | alur koreksi penuh (reject → tombol → draft terprefill → submit); dropdown aksi; PDF tanpa QR |

Aturan:

- Test-first per task: RED → jalankan (pastikan gagal dengan alasan benar) →
  GREEN → commit. Test lama yang mengunci kontrak lama (relink/move, token QR,
  S9 tanpa aksi baris) diperbarui/dihapus di task yang sama, tidak di-pin ulang.
- Tanpa target coverage angka; ukurannya Success Criteria per modul.
- `make ci` sekali di task verifikasi terakhir.

## Boundaries

**Always:**

- Jalankan test yang relevan sebelum setiap commit, lalu `npm run typecheck`.
- Copy, never move: operasi data apa pun pada laporan rejected tidak boleh
  mengubah/menghapus baris miliknya (verifikasi test eksplisit per jalur).
- Pertahankan aturan satu laporan non-rejected per (user, tanggal) di level
  database (index), bukan hanya di aplikasi.
- Catat perubahan kontrak di `postman/specs/openapi.yaml` pada commit yang
  sama dengan perubahan controller-nya (termasuk penghapusan `/api/verify`).
- Foto disalin lewat `PrivateMediaPath::resolveAny` (foto legacy bisa di disk
  public); file hilang tetap menyalin baris (UI sudah punya placeholder).
- Aksi tak diizinkan disembunyikan (bukan disabled); server tetap penentu
  akhir (403/422 tetap tersaji).
- Pesan domain Indonesia untuk semua jalur 422; tanpa 500 dari 23505.

**Ask first:**

- Mengubah `WfhReportPdfData` di luar penghapusan QR (konten PDF harus tidak
  berubah selain hilangnya QR).
- Menambah dependensi baru apa pun (plan ini net-minus satu dependency).
- Menyentuh flow approve/reject laporan tim atau segregation of duties.
- Mengubah komponen `WfhReportRow` di luar prop opt-in (Monitoring bergantung
  padanya).
- Re-seed data demo bila migration fail-fast menemukan collision.

**Never:**

- Menghapus/mengosongkan data laporan rejected dalam bentuk apa pun
  (termasuk "sementara" saat migrasi).
- Memindahkan baris absensi antar laporan (`relinkRejectedAttendances`
  dihapus, bukan disimpan).
- Mengizinkan dua laporan non-rejected untuk (user, tanggal) yang sama —
  juga tidak lewat jalur race/PUT.
- Menyajikan foto absensi via URL publik atau melemahkan guard
  `wfh.monitoring.view` + bidang.
- Menghapus test yang gagal tanpa persetujuan manusia (test QR dihapus karena
  fiturnya dihapus — itu cakupan task, bukan pelarian dari merah).
- Menyimpan kopi kedua label status/sesi; satu peta dipakai bersama.
- Meng-commit secret atau menyentuh `vendor/`.

## Open Questions

1. **Bentuk visual dropdown Aksi** (posisi ikon, urutan item, pemisah) — plan
   menetapkan urutan Detail → Edit → Hapus → Unduh PDF dengan ikon lucide
   standar; penyesuaian kosmetik saat review UI tidak mengubah kontrak.
2. **Status code persis untuk tanggal terkunci** — plan memakai 422 dengan
   pesan domain (konsisten pola guard existing); bila review menghendaki 409,
   itu perubahan satu baris + openapi pada task yang sama.
3. **Label tombol perbaikan** — "Buat Laporan Perbaikan" (default); variasi
   copy lokal diperbolehkan tanpa mengubah perilaku.

## Success Criteria

### `wfh-qr-cutoff`

- `rg -i "qr|verification_token|verifyQrToken"` di `app/`, `resources/`,
  `routes/`, `tests/`, `postman/` hanya menyisakan kebutuhan non-QR
  (`verify-otp`, reset password, `QrVerificationController` tidak ada lagi).
- Migration turun-naik bersih; `composer validate` + `composer.lock` tanpa
  `bacon/bacon-qr-code`; `php artisan test --compact` hijau penuh.
- PDF laporan personal & paket perubahan ter-render tanpa QR dan tanpa
  perubahan visual lain (test template mengunci elemen yang tersisa).

### `wfh-correction-prefill`

- Test arsip: setelah `POST /wfh/reports` koreksi, laporan rejected masih
  memuat N kegiatan + link + M absensi yang sama (id tak berubah).
- Test prefill: draft baru memuat salinan lengkap; pembuatan ulang tidak
  menduplikasi (get-or-create); foto tersalin ke private disk dan baris lama
  + baru menunjuk file masing-masing.
- Test kunci: `draft`+`pending`+`approved` masing-masing memblokir (23505 /
  422 pesan benar); `rejected` membuka; `submit()` menolak draft pada tanggal
  yang sudah terkunci; `PUT` tanggal terkunci → 422.
- `UniqueActiveDraftTest` + `RejectedReportCorrectionTest` + full suite hijau;
  Pint bersih.

### `wfh-report-actions`

- Vitest: dropdown hanya dengan prop `actions`; item ter-gate; klik baris
  tetap navigasi; tombol perbaikan hanya rejected + owner; Monitoring
  merender tanpa kolom Aksi.
- `npm run typecheck` + `npm run build` hijau; smoke browser alur koreksi
  end-to-end di device nyata.
