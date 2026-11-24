# SPEC: Perbaikan Lintas Modul (WFH PDF/UX, Team Reports, Users, Changes)

> Module ids: `wfh-pdf`, `wfh-nav-team`, `rbac-labels`, `change-attachments`
> (dari `CAPABILITY-MAP-cross-module-fixes.md`, Phase 0 approved 2026-11-24).
> Intent & keputusan: `docs/superpowers/specs/2026-11-24-cross-module-fixes-design.md`.
> Rencana: `docs/superpowers/plans/2026-11-24-cross-module-fixes.md` (9 tasks).
> OpenAPI: `postman/specs/openapi.yaml` (kontrak existing + 1 operasi DELETE baru).

## Objective

Memperbaiki 10 temuan QA yang diajukan user pada 2026-11-24, lintas 5 area aplikasi eoffice.
Penerima manfaat: staf (pembuat laporan WFH), kepala bidang (penandatangan/approver),
kepala tim (pembuat laporan tim), dan admin (monitoring + manajemen user + paket perubahan).

**Masalah yang diselesaikan (dari laporan user):**

1. PDF laporan WFH tim: logo doc & judul tidak sejajar horizontal; tanggal tidak tepat di atas
   label "Atasan Langsung" (padahal PDF individu sudah benar → dijadikan rujukan).
2. Saat admin mengunduh PDF tim dari papan harian, signature "Atasan Langsung" merujuk ke admin,
   padahal selalu kepala bidang. Kolom "Yang Membuat Laporan" harus berisi pembuat laporan.
3. Tombol back pada detail WFH individu salah arah bila detail dibuka dari menu monitoring.
4. `/team-reports`: form "Buat Laporan Tim" masih berupa section card; harus jadi tombol + dialog
   (dropdown Tim, Tanggal laporan, Batal, Buat).
5. `/admin/users/new`: label role tampil programatik (`kepala_bidang`) → harus `Kepala Bidang`;
   humanisasi juga berlaku di tabel users dan halaman roles.
6. `/changes/new`: field "Tanggal dibutuhkan" hanya selebar setengah kolom → full-width.
7. Lampiran paket perubahan: multi-attachment saat create & update, preview thumbnail sejak awal
   (klik → gambar membesar), hapus/ganti attachment yang sudah terunggah.
8. Input attachment muncul di halaman detail `/changes/:id` → hanya di form create/update.
9. Preview baru ada di form update, tidak di create → create harus mendukung preview juga.
10. Label "Hasil implementasi" ambigu (mengisi "Hasil Tanggapan Perubahan" di PDF) → "Tanggapan
    Perubahan"; PDF Implementasi perlu label "Tanda Tangan" center di atas 3 image signature.

**Success = 10 temuan di atas tertutup, dengan 4 keputusan user terkunci:**
- "Yang Membuat Laporan" PDF tim = `created_by` laporan, bukan sesi pengunduh.
- Tanpa `team_report_id` (papan harian hanya kirim tanggal): backend cari laporan per tim+tanggal;
  ada → pembuat dari laporan itu; tidak ada → `—`, PDF tetap terunduh.
- Humanisasi label role di semua lokasi.
- Hapus/ganti attachment hanya saat paket berstatus `draft`.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Laravel, PHP 8.4, dompdf (barryvdh), Sanctum, spatie/laravel-permission, PostgreSQL |
| Frontend | React 19, TypeScript, Vite 8, Redux Toolkit, Radix UI (`@/components/ui/dialog`), animate-ui (Select/Checkbox), `react-photo-view` |
| Test backend | PHPUnit (`vendor/bin/phpunit`), `RefreshDatabase`, `Storage::fake` |
| Test frontend | vitest 5 + jsdom + @testing-library/react |

## Commands

```bash
# Backend
vendor/bin/phpunit                                    # seluruh suite PHP
vendor/bin/phpunit tests/Feature/Wfh/                 # slice PDF WFH
vendor/bin/phpunit tests/Feature/ChangeManagement/    # slice attachment & PDF perubahan
php artisan test                                      # alternative runner

# Frontend
npm run dev                                           # Vite dev server
npm run build                                         # produksi
npm run test                                          # seluruh vitest
npm run test -- resources/js/pages/changes/           # slice changes
npm run test -- resources/js/pages/wfh/               # slice WFH
npm run typecheck                                     # tsc --noEmit

# Verifikasi PDF nyata (throwaway, hapus setelahnya)
php artisan tinker                                    # render view → PdfRendererService → file PDF
pdftoppm -png output.pdf output                       # bila tersedia, inspeksi visual
```

## Project Structure

```
app/Domains/Wfh/Http/Controllers/ReportPdfController.php     exportTeam: lookup laporan + guard
app/Domains/Wfh/Services/WfhReportPdfData.php                forTeam: assembly view-data PDF tim
app/Domains/ChangeManagement/Http/Controllers/
    ChangePackageController.php                              uploadAttachments + deleteAttachment baru
app/Domains/ChangeManagement/Repositories/
    EloquentChangeManagementRepository.php                   addAttachments + deleteAttachment baru
    ChangeManagementRepositoryInterface.php                  kontrak repository
app/Support/Signature/SignatureGuard.php                     guard penandatangan (dipakai ulang)
routes/api.php                                               route DELETE attachment baru
resources/views/pdf/wfh-report-admin.blade.php               PDF tim (kop + tanggal + maker)
resources/views/pdf/change-implementation.blade.php          PDF implementasi (label Tanda Tangan)
resources/js/pages/wfh/
    MonitoringPage.tsx, WfhReportDetailPage.tsx, TeamReportsPage.tsx
resources/js/pages/admin/
    UserFormPage.tsx, UsersPage.tsx, RolesPage.tsx
resources/js/pages/changes/
    ChangePackageFormPage.tsx, ChangePackageDetailPage.tsx
resources/js/components/changes/
    attachment-list.tsx, pending-attachment-list.tsx (baru)
resources/js/lib/roles-meta.ts                               kamus ROLE_LABELS (baru)
resources/js/api/change-package.ts, store/changePackageSlice.ts
tests/Feature/Wfh/, tests/Feature/ChangeManagement/          test backend
resources/js/**/*.test.tsx, resources/js/**/*.test.ts        test frontend
postman/specs/openapi.yaml                                   kontrak API (1 op baru)
docs/superpowers/specs/, docs/superpowers/plans/             design doc & rencana (sudah ada)
CAPABILITY-MAP-cross-module-fixes.md                         peta modul (root)
```

## Code Style

- Kamus label eksplisit, bukan title-case otomatis (pola `WFH_STATUS_LABELS`,
  `PERMISSION_META`):

```ts
// resources/js/lib/roles-meta.ts
import type { AdminRoleName } from "@/api/types";

export const ROLE_LABELS: Record<AdminRoleName, string> = {
  admin: "Admin",
  kepala_bidang: "Kepala Bidang",
  kepala_tim: "Kepala Tim",
  staf: "Staf",
};
```

- UI dropdown/field memakai `Field` + `FieldLabel` + komponen `@/components/ui/*`;
  dialog controlled `<Dialog open onOpenChange>` + `<DialogHeader>` + `<DialogFooter>`
  dengan `Button variant="outline">Batal</Button>` dan aksi utama `pending={...}`.
- `aria-label` pada checkbox role TETAP memakai value mentah (`kepala_bidang`) —
  hanya teks tampilan yang human-friendly.
- Copy UI Bahasa Indonesia; pesan error server ditampilkan apa adanya (sudah lewat seam `toUiError`).
- Server adalah otoritas: setiap guard UI diulang di controller (status draft, ownership, cap 10).
- PDF dompdf: kop table-based + `vertical-align: middle`; dilarang flex di `.kop-surat`.
- Thunk Redux mengikuti pola `mutateAndRefetch` modul masing-masing; penamaan `...Thunk`.

## Testing Strategy

| Level | Framework | Fokus |
|---|---|---|
| Unit view-data | PHPUnit | `forTeam` menghasilkan makerName/NIP dari `created_by`, `—` bila tanpa laporan; signature dari disk privat |
| Feature HTTP | PHPUnit | `GET /admin/wfh/teams/{id}/pdf` (200 dengan/ tanpa `team_report_id`, 422 guard nama pembuat); `DELETE /changes/{id}/attachments/{attachment}` (204 / 403 / 404 / 422) |
| Template PDF | PHPUnit render blade | kop table, baris tanggal di atas kolom kanan, 3× label "Tanda Tangan"; verifikasi visual sekali via render nyata |
| Komponen UI | vitest/jsdom | dialog create laporan tim, back fallback, label role, preview pending + hapus, absence of upload input di detail |
| Integrasi slice | vitest + PHPUnit | upload batch 10 → hapus 1 → upload 1 lolos; guard status/ownership |
| E2E manual | browser | 5 alur smoke sesuai task final rencana |

Test existing yang mengunci perilaku lama (maker = admin, label role mentah, form section,
input upload di detail) DIPERBARUI — tidak dihapus atau di-pin ulang.

## Boundaries

- **Always:**
  - Baca design doc + capability map sebelum mengubah kode.
  - TDD: tulis test gagal → implementasi → test hijau per task.
  - Jalankan test slice + `npm run typecheck` sebelum commit; update test lama yang kini keliru.
  - Enforce server-side setiap guard klien; hapus file attachment dari disk privat **dan** publik.
- **Ask first:**
  - Perubahan skema DB/migrasi baru (rencana ini tidak memerlukannya).
  - Menambah dependency npm/composer baru (`react-photo-view` sudah terpasang).
  - Mengubah perilaku approval WFH, kontrak endpoint selain DELETE attachment, atau storage disk.
- **Never:**
  - Mengubah PDF individu (`wfh-report.blade.php`) — rujukan yang sudah benar.
  - Menyimpan/menyajikan signature atau lampiran via URL publik `/storage`.
  - Menghapus attachment setelah status bukan `draft`.
  - Melewati gate approval design doc / review plan sebelum implementasi.

## Success Criteria

1. PDF tim: `<table class="kop-surat">` + `vertical-align: middle`; tanggal di baris tersendiri
   di atas kolom "Atasan Langsung"; dua label tanda tangan satu baris yang sama (assert regex template).
2. PDF tim dengan laporan: `makerName` = `strtoupper(creator.name)`, `makerNip` = creator.nip,
   signature maker dari `SignaturePath::resolve` milik creator; admin pengunduh tidak muncul.
3. PDF tim tanpa laporan: `makerName = '-'`, `signatureMakerPath = null`, HTTP 200 tetap.
4. Guard 422 menyebut nama pembuat laporan bila ia belum pasang signature — bukan admin.
5. Back detail WFH: `href="/monitoring"` bila state `{from:"/monitoring"}`; `href="/wfh"` bila
   state kosong (refresh/direct URL).
6. `/team-reports`: tidak ada section card form; tombol "Buat laporan" membuka dialog; Buat
   memanggil `createWfhTeamReport` lalu menutup dialog; Batal tidak memanggilnya.
7. Label role: "Admin", "Kepala Bidang", "Kepala Tim", "Staf" tampil di form user, tabel users,
   halaman roles; `aria-label` checkbox tetap value mentah.
8. `/changes/new`: field Tanggal dibutuhkan full-width; label "Tanggapan Perubahan" menggantikan
   "Hasil implementasi"; payload `implementation_result` tidak berubah.
9. Lampiran: pilih 2 file sekaligus saat create → 2 thumbnail + lightbox sebelum draft disimpan;
   hapus pending berfungsi; edit draft bisa hapus attachment existing (DELETE 204) lalu unggah
   pengganti; total Cap 10 tetap berlaku; `/changes/:id` tidak punya input upload sama sekali.
10. PDF Implementasi: tepat 3 label "Tanda Tangan" center di atas image signature; render nyata
    2 halaman tidak berubah.
11. Suite penuh `vendor/bin/phpunit`, `npm run test`, `npm run typecheck`, `npm run build` hijau.

## Open Questions

Tidak ada. Keempat keputusan yang sebelumnya terbuka sudah dikunci user pada 2026-11-24
(pembuat laporan, lookup tim+tanggal, cakupan label role, delete draft-only).
