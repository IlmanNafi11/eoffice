# Spec: pdf-signature (eoffice)

> Module id: `pdf-signature` — indeks: `CAPABILITY-MAP-feedback-ux.md` (approved 2026-11-21).
> Depends on: — (murni Blade + satu pemanggil decode blob dari `ui-feedback` Task 2, dipakai read-only).
> Source of intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (tasks 6, 8).

## Objective

Dua perbaikan pada jalur PDF:

1. **Posisi tanda tangan** — gambar signature di template DOMPDF tidak lagi menimpa label
   ("Yang Membuat Laporan" / "Atasan Langsung"): hapus trik `position:absolute; top:-55px` dan
   render `<img>` di dalam `.signature-box` dengan flow normal, terpusat, mengikuti pola yang
   sudah benar di `change-implementation.blade.php` (commit `4a11fd3`).
2. **Pesan kegagalan PDF personal** — ketika ekspor ditolak (mis. signature belum diatur, 422
   "... belum mengatur tanda tangan ..."), pesan server sampai ke UI via toast + inline, bukan
   "Gagal mengunduh PDF. Coba lagi." generik.

**User:** staf pembuat laporan; kepala tim; admin.

**Keputusan yang sudah dikunci (jangan dibuka lagi):** guard signature TIDAK diubah — PDF yang
men-embed signature asli menolak ekspor tanpa signature ("UX saja"); status guard, kepemilikan,
permission tetap.

**Success (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | `top:-55px` tidak ada di ketiga template; `.signature-box img` tanpa `position: absolute` | PHPUnit: `assertStringNotContainsString('top:-55px', $html)` per template + grep `resources/views/pdf` = 0 hit |
| S2 | `<img>` signature adalah anak langsung `.signature-box` (markup tidak berubah struktural) | PHPUnit: regex `signature-box[^>]*>\s*<img src="` pada template personal |
| S3 | `.signature-role` tidak lagi memberi ruang 50px untuk gambar melayang (`margin-bottom` normal, 8px) | PHPUnit: CSS assertion per template |
| S4 | Render nyata tetap menghasilkan PDF valid | `docker exec … tinker`: `PdfRendererService::render("pdf.wfh-report", forReport(...))` → `%PDF-` (pola sudah terbukti 2026-11-21) |
| S5 | `exportWfhReportPdf` pada 4xx blob melempar error dengan pesan server ("... belum mengatur tanda tangan ..."), bukan teks axios | Vitest `wfh.test.ts` |
| S6 | `WfhReportDetailPage` gagal download → `toast.error` berisi pesan server + inline `<p>` dari `PdfDownloadButton` tetap dirender | Vitest `WfhReportDetailPage.test.tsx` (pola `MonitoringPage.test.tsx:291-299`) |
| S7 | Test struktur lama tidak dihapus: tanggal di sel kanan (`test_signature_date_sits_directly_above_supervisor_column`), tanpa klausa legal, embed per-row change-implementation | PHPUnit existing tetap lulus |
| S8 | Kedua suite hijau | `php artisan test --compact` + `npx vitest run` |

## Tech Stack

- Blade template self-contained di `resources/views/pdf/` (tanpa layout inheritance).
- DOMPDF via `PdfRendererService` (kontrak tidak diubah); signature PNG via path lokal
  (`SignaturePath::resolve`) — pola existing yang sudah bekerja.
- Vitest untuk sisi frontend (S5–S6).
- **Tidak ada dependency baru.**

## Commands

```bash
# Backend — terarah
php artisan test --compact tests/Feature/Wfh/WfhReportPdfTemplateTest.php
php artisan test --compact tests/Feature/ChangeManagement/ChangeFormPdfTemplateTest.php
php artisan test --compact tests/Feature/Wfh/PdfExportGuardsTest.php

# Verifikasi render nyata (bukti S4)
docker exec eoffice-app-run-5517ec2f6c0f php artisan tinker --execute='
$r = \App\Domains\Wfh\Models\WfhReport::find(1);
$data = app(\App\Domains\Wfh\Services\WfhReportPdfData::class)->forReport(app(\App\Domains\Wfh\Repositories\EloquentWfhRepository::class)->loadReportWithRelations($r));
$pdf = app(\App\Support\Pdf\PdfRendererService::class)->render("pdf.wfh-report", $data);
echo "bytes=".strlen($pdf)." head=".substr($pdf,0,5)."\n";'

# Frontend
npx vitest run resources/js/api/wfh.test.ts resources/js/pages/wfh/WfhReportDetailPage.test.tsx
```

## Project Structure

```
resources/views/pdf/
  wfh-report.blade.php         → MODIFIKASI CSS :129-152 (signature-area/role/box/img/name)
  wfh-report-admin.blade.php   → MODIFIKASI CSS :79-82 (CSS sama, duplikat)
  change-initiation.blade.php  → MODIFIKASI CSS :34-37 (CSS sama, duplikat)
  change-implementation.blade.php → TIDAK disentuh (sudah benar; jadi referensi pola)
tests/Feature/Wfh/
  WfhReportPdfTemplateTest.php → diperluas: S1–S3
tests/Feature/ChangeManagement/
  ChangeFormPdfTemplateTest.php → diperluas bila ada asersi CSS lama
resources/js/api/
  wfh.ts                       → MODIFIKASI :156-159 exportWfhReportPdf (decode blob — Task 6 plan)
resources/js/pages/wfh/
  WfhReportDetailPage.tsx      → MODIFIKASI :300-307 (getError + toast)
```

## Code Style

CSS baru (ketiga template identik; nilai dari plan Task 8):

```css
.signature-role {
    font-weight: bold;
    margin-bottom: 8px;          /* sebelumnya 50px — ruang gambar melayang dihapus */
}
.signature-box {
    height: 70px;
    margin: 0 auto 5px;
    width: 200px;
    display: flex;
    align-items: flex-end;       /* gambar duduk di atas garis nama */
    justify-content: center;
}
.signature-box img {
    max-height: 65px;
    max-width: 100%;
    width: auto;
}
```

Markup Blade **tidak berubah** — `<img>` tetap anak `.signature-box`; yang berubah hanya CSS.

**Dilarang:**

```css
/* ❌ trik melayang yang menimpa label */
.signature-box { position: relative; }
.signature-box img { position: absolute; top: -55px; }
```

```tsx
// ❌ menelan pesan server
catch { setError("Gagal mengunduh PDF. Coba lagi."); }
// ✅ pesan domain sampai ke UI
getError={(e) => toUiError(e).message}
```

## Testing Strategy

- **Struktural, bukan piksel** — DOMPDF punya keterbatasan CSS; asersi pada HTML render
  (`view(...)->render()`): tidak ada `top:-55px`, tidak ada `position: absolute` pada
  `.signature-box img`, `<img>` anak `.signature-box`, `margin-bottom: 8px` pada role.
- Render nyata sebagai bukti S4 (bukan pengganti test): PDF bytes > 0 dan header `%PDF-`.
- Frontend: decode blob 422 → pesan server; toast + inline tetap (S5–S6).
- Test guard yang ada (`PdfExportGuardsTest`) **tidak** disentuh — guard tidak berubah.
- TDD: test S1–S3 gagal dulu (masih ada `top:-55px`), lalu CSS diganti, lalu hijau.

## Boundaries

**Always do**

- Terapkan CSS baru identik di ketiga template (duplikasi CSS adalah konvensi template
  self-contained — jangan bikin shared stylesheet).
- Jalankan verifikasi render nyata setelah mengubah CSS (S4).
- Pertahankan gating ekspor existing (status, kepemilikan, permission, signature guard).

**Ask first**

- Mengubah dimensi box/ukuran gambar (70px/65px/200px) — nilai ini dituning untuk DOMPDF.
- Mengubah nama file unduhan atau menambah halaman/kop baru.

**Never do**

- Mengubah guard `SignatureGuard::missing` atau melemahkan test `PdfExportGuardsTest`.
- Menyematkan signature via URL publik / memindahkan file signature ke disk publik.
- Mengganti DOMPDF atau menambah library PDF.
- Menghapus asersi struktur test lama (tanggal di sel kanan, tanpa klausa legal).

## Success Criteria

S1–S8 terpenuhi; grep `top:-55px` di `resources/views/pdf` = 0 hit; render nyata menghasilkan
PDF valid; pesan 422 signature sampai ke toast di halaman detail.

## Open Questions

Tidak ada. Nilai CSS (70/65/200/8px) diambil dari plan Task 8 dan ditandai "ask first" bila
perlu penyesuaian visual.
