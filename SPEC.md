# SPEC: PDF Image Performance (attendance photos + signature trim)

> Modul: `pdf-image-performance`. Rujukan yang disetujui:
> `docs/superpowers/specs/2026-11-28-pdf-image-performance-design.md` (design,
> approved 2026-11-28) dan
> `docs/superpowers/plans/2026-11-28-pdf-image-performance.md` (rencana TDD,
> 6 task). Bukti pengukuran ada di `PERF-LEDGER.md`.
>
> Catatan penamaan: initiative sebelumnya di root (`wfh-ux-remediation`) sudah
> CLOSED dan dipindah ke `SPEC-wfh-ux-remediation.md` bila diperlukan; root
> `SPEC.md` kini dipakai untuk initiative aktif ini.
>
> Phase 0: **tidak ada capability map multi-modul.** Kedua perubahan
> (foto & tanda tangan) berbagi satu helper dan satu jalur verifikasi, bisa
> dikirim sebagai satu unit yang diuji. Satu spec untuk satu modul ini.

## Objective

Dua biaya terukur pada pembuatan PDF laporan WFH masih tersisa:

1. **Foto presensi beresolusi penuh.** Foto JPEG 2400×1800 ≈ 527 kB
   didekompresi dompdf menjadi ~16 MB bitmap **per sel foto** (template
   `wfh-report-admin.blade.php:117` hanya merender 60×60 px). Untuk 30 staf
   × 3 sesi, tekanan dekompresi mencapai ~1,4 GB per export.
2. **Trim tanda tangan memindai tiap piksel.**
   `ImageSignatureService::trimWhitespace` memanggil `imagecolorat` 4 juta
   kali pada upload 2000×2000 → **153,7 ms** (terukur).

Target pengguna: staf yang mengunggah presensi/tanda tangan (upload tetap
cepat), kepala bidang/admin yang mengunduh PDF tim (render tidak OOM), dan
pemelihara sistem (biaya tidak regress tanpa disadari).

**Prinsip owner:** hasil cetak harus **tetap bagus dan jelas**. Jangan pernah
memaksa caller mengirim JPEG — format sumber (jpeg/png/webp) harus
dipertahankan. Sistem masih development, tidak ada data berharga, sehingga
konversi sekali untuk data lama diperbolehkan.

**Success = semua kondisi ini benar:**

1. Setiap foto baru (dua jalur upload) tersimpan dengan sisi terpanjang
   ≤ 600 px, dalam format sumber yang sama, ekstensi & MIME konsisten.
2. Path di `wfh_attendances.photo_path` tidak berubah bentuknya; semua
   assertion `TeamReportPdfTest` (`:358`, `:416`, `:553`) tetap hijau tanpa
   diubah.
3. `php artisan media:resize-attendance` mengecilkan foto lama secara
   idempotent, hanya menulis ke disk `local` dan hanya untuk path dengan
   prefix `attendances/`, melewati baris tanpa byte serta baris dengan
   header pixel-bomb tanpa menggagalkan baris berikutnya, dan melaporkan
   jumlah `akan diubah`/`diubah`, `dilewati`, `gagal` secara jujur.
4. Trim tanda tangan **tetap memindai tiap piksel** (percobaan grid scan
   4 px dibatalkan pada ship review #26 karena kehilangan goresan off-grid
   pada 299/300 fixture); target waktu < 60 ms tidak lagi dijadikan kriteria
   penerimaan karena mengorbankan kebenaran crop.
5. Full PHP suite hijau, Pint bersih, `PERF-LEDGER.md` berisi angka
   sebelum/sesudah untuk kedua optimasi.

## Tech Stack

- PHP `^8.4` (host), Laravel `^12.69`, GD (`imagecreatefromjpeg/png/webp`,
  `imagescale`), `intervention/image` (sudah ada, dipakai
  `ImageSignatureService`).
- Storage: disk `local` (privat) + `public` hanya sebagai sumber legacy;
  `PrivateMediaPath::resolveAny()` sudah ada.
- Postgres untuk `wfh_attendances.photo_path`; **tanpa migrasi skema**.
- PHPUnit + `RefreshDatabase` + `Storage::fake('local')`; tanpa dependency
  baru.

## Commands

Dari root repo:

```bash
# Task 1 — helper resize
php artisan test --filter=AttendancePhotoResizeTest

# Task 2 — endpoint absensi
php artisan test --filter=ReportAttendanceSubResourceTest

# Task 3 — jalur create-report
php artisan test --filter=<test class yang dipilih di plan>

# Task 4 — trim tanda tangan
php artisan test --filter=ImageSignatureServiceTest

# Task 5 — command migrasi foto lama
php artisan test --filter=ResizeAttendancePhotosTest
php artisan media:resize-attendance --dry-run
php artisan media:resize-attendance

# Gate penuh (Task 6)
php artisan test --compact
vendor/bin/pint --test
```

## Project Structure

| Path | Peran |
|---|---|
| `app/Support/Media/AttendancePhotoResize.php` | Helper baru: decode aman, cap 600 px, re-encode **sesuai format sumber** (alpha PNG dijaga), path wajib berprefix `attendances/`, tulis ke `local` |
| `app/Support/Pdf/PdfImage.php` | Menambah aksesor publik `maxDecodedPixels()` (konstanta existing, bukan duplikat) |
| `app/Rules/DecodedImageBudget.php` | Rule validasi bersama: menolak pixel-bomb dengan 422 sebelum helper dipanggil |
| `app/Domains/Wfh/Http/Requests/StoreReportRequest.php` + `AppendAttendanceRequest.php` | Memakai rule tersebut pada kedua jalur upload |
| `app/Domains/Wfh/Http/Controllers/ReportAttendanceController.php` | Jalur upload absensi → pakai helper |
| `app/Domains/Wfh/Http/Controllers/ReportController.php` | Jalur upload saat create-report → pakai helper (keduanya wajib) |
| `app/Support/Signature/ImageSignatureService.php` | Trim full-resolution dipertahankan; grid scan 4 px dibatalkan (ship #26) |
| `app/Console/Commands/ResizeAttendancePhotos.php` | Command sekali jalan: scope `attendances/`, chunked, isolasi error, laporan jujur |
| `tests/Unit/Support/AttendancePhotoResizeTest.php` | Test helper: format jpeg/png/webp, alpha PNG, corrupt/no-op, guard 16M px |
| `tests/Unit/ImageSignatureServiceTest.php` | Test trim: titik off-grid (RED di grid scan, GREEN di full scan) |
| `tests/Feature/Console/ResizeAttendancePhotosTest.php` | Test command: resize, scope, pixel-bomb isolation, dry-run, idempotent |
| `PERF-LEDGER.md` | Angka sebelum/sesudah, termasuk eksperimen yang tidak diterapkan |

## Code Style

Ikuti gaya Laravel existing: deklarasi `strict` tidak dipakai di repo ini;
namespace `App\...`, `final` opsional, method static untuk helper murni,
pesan error domain berbahasa Indonesia di exception yang dilempar helper.

Contoh bentuk helper yang disetujui (signature, bukan implementasi):

```php
final class AttendancePhotoResize
{
    public static function store(
        UploadedFile $photo,
        string $directory,
        string $filename,
    ): string {
        // guard → decode → scale ≤600 px → encode format sumber → Storage::put
    }
}
```

`ImageSignatureService::trimWhitespace(Resource $gd): void` tetap private
dan tidak mengubah API publik `normalize(string, int): string`.

## Testing Strategy

- **Framework:** PHPUnit, `RefreshDatabase`, `Storage::fake('local')`.
- **Level:**
  - Unit: helper resize (semua format + guard), trim (waktu + goresan tipis).
  - Feature: dua jalur upload + command migrasi + kontrak PDF yang tidak
    berubah (`TeamReportPdfTest` dijalankan utuh, bukan diubah).
- **Urutan per task:** tulis test RED → jalankan → implement minimal →
  jalankan GREEN → commit. Satu task = satu cycle + satu commit.
- **Coverage yang diwajibkan:** format jpeg/png/webp, header palsu di atas
  16M px, photo lama tanpa byte, goresan 1 px di luar grid 4 px.
- Gate akhir: `php artisan test --compact` + `vendor/bin/pint --test`.

## Boundaries

**Always:**

- Jalankan test yang relevan sebelum setiap commit; Pint sebelum gate akhir.
- Pertahankan format sumber; jangan konversi paksa ke JPEG.
- Guard dimensi **sebelum** GD mengalokasikan bitmap; 422 dengan pesan
  Indonesia, bukan silently menyimpan ukuran asli.
- Pakai helper yang sama di kedua jalur upload; path DB tidak berubah bentuk.
- Perbarui `PERF-LEDGER.md` pada commit verifikasi akhir.

**Ask first:**

- Migrasi skema/DDL (tidak diperlukan untuk initiative ini).
- Menambah dependency composer/npm (tidak diperlukan).
- Mengubah kontrak API, bentuk payload `WfhReportPdfData`, atau assertion
  `TeamReportPdfTest` — ini bukan pelarian dari test merah.
- Mengubah threshold 240, padding 5 px, atau batas ≤300×100 pada tanda
  tangan (aksen visual disetujui oleh owner).
- Menjalankan command resize di environment dengan data produksi.

**Never:**

- Memaksa JPEG untuk semua upload atau membuang alpha PNG/WebP.
- Menulis ke disk `public` dari command resize (public = sumber read-only).
- Menghapus/mengubah test yang gagal agar optimasi tampak hijau.
- Meng-commit secret, `.env`, `vendor/`, atau build artifact.
- Mengklaim angka performa yang belum diukur dengan perintah di atas.

## Success Criteria

Lihat "Success =" pada Objective. Ringkasannya: ≤600 px di dua jalur upload,
format sumber terjaga termasuk alpha PNG, kontrak PDF tidak berubah, trim
full-resolution dengan goresan off-grid utuh (target < 60 ms dibatalkan
karena mengorbankan kebenaran), pixel bomb ditolak 422, command aman dan
jujur, suite penuh + Pint hijau, ledger terisi.

## Open Questions

Tidak ada. Keputusan owner: format sumber dipertahankan tanpa paksaan JPEG;
command migrasi terpisah setelah `media:migrate-private`; grid scan 4 px
dibatalkan pada ship review #26 karena menghilangkan goresan off-grid —
trim kembali ke pemindaian tiap piksel.
