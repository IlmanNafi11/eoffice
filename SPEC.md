# Spec: Feedback UX & Fixes (eoffice)

> Module ids and build order: `CAPABILITY-MAP-feedback-ux.md` (approved 2026-11-21).
> Per-module specs: `SPEC-ui-feedback.md`, `SPEC-settings-layout.md`, `SPEC-upload-errors.md`,
> `SPEC-pdf-signature.md`.
> Source of intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (tasks 1–11).

## Objective

Menutup seluruh temuan feedback UX dan dua bug fungsional yang dilaporkan pengguna, secara
sistematis dan menyeluruh:

1. **Settings hening** — simpan pengaturan tanpa feedback apa pun, dan layout satu kolom.
2. **PDF WFH** — tanda tangan menimpa label, dan unduhan gagal tanpa penjelasan pada laporan
   tanpa foto absensi.
3. **UI feedback** — tombol aksi tanpa spinner, mutasi tanpa toast, skeleton yang belum merata.
4. **Upload gambar** — error tampil sebagai "Data yang diberikan tidak valid." tanpa petunjuk.

**User:** seluruh pengguna SPA (staf, kepala tim, admin). **Konsumen kontrak internal:** semua
halaman mutasi + semua slice Redux.

**Success inisiatif (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| I1 | Setiap aksi mutasi menyajikan spinner selama in-flight dan hasil via toast (sukses: kalimat server; gagal: toast + banner inline) | Test per halaman modul `ui-feedback` (S8) + `settings-layout` (S3–S5) |
| I2 | Layer UI tidak mengetahui detail error transport — tidak ada impor `ApiError` di luar `resources/js/api/` | Grep gate `ui-feedback` S10 |
| I3 | Settings tersusun grid 2 kolom dengan card password admin & user bersebelahan | `settings-layout` S1–S2 |
| I4 | File upload yang jelas salah ditolak sebelum request; error server tampil representatif per-field | `upload-errors` S1–S9 |
| I5 | Signature PDF berada di dalam box (tidak menimpa label) di 3 template; pesan 422 signature tampil di UI | `pdf-signature` S1–S6 |
| I6 | Skeleton loading halaman tetap konsisten di semua list/detail (tidak ada halaman yang kehilangan skeleton) | Test skeleton existing tetap lulus + review manual |
| I7 | Kedua suite hijau | `npx vitest run` dan `php artisan test --compact` exit 0 |

## Tech Stack

- Laravel 12 (PHP ^8.2) + PostgreSQL; Blade + DOMPDF (`barryvdh/laravel-dompdf`) untuk PDF.
- React 19 + Redux Toolkit + TypeScript strict + Tailwind + Vite.
- `sonner@^2.0.8` + `components/ui/sonner.tsx` (sudah ada, belum di-mount) untuk toast.
- PHPUnit 11 (Feature) + Vitest 5/jsdom + Testing Library.
- **Tidak ada dependency baru** di frontend maupun backend.

## Commands

Host saat ini punya `php`, `composer`, `vendor/`, `docker`, dan `node_modules/`.

```bash
# Frontend
npx vitest run                                   # semua test
npx vitest run resources/js/lib/ui-errors.test.ts
npx vitest run resources/js/pages/admin/SettingsPage.test.tsx
npx vitest run resources/js/api/client.test.ts
npm run typecheck
npm run build

# Backend
php artisan test --compact                       # suite penuh (798 tests / 2524 assertions, 2026-11-21)
php artisan test --compact tests/Feature/Wfh/WfhReportPdfTemplateTest.php
php artisan test --compact tests/Feature/Wfh/ReportAttendanceSubResourceTest.php
php artisan test --compact tests/Feature/ChangeManagement

# Lint
vendor/bin/pint --test

# Cadangan bila host toolchain bermasalah (skill eoffice-php-test-via-docker)
docker run --rm --network eoffice-net -v "$PWD":/app -w /app \
  -e DB_CONNECTION=pgsql -e DB_HOST=eoffice-db -e DB_PORT=5432 \
  -e DB_DATABASE=kominfo_wfh -e DB_USERNAME=kominfo -e DB_PASSWORD=kominfo \
  eoffice-test vendor/bin/phpunit

# Verifikasi render PDF nyata
docker exec eoffice-app-run-5517ec2f6c0f php artisan tinker --execute='
$r = \App\Domains\Wfh\Models\WfhReport::find(1);
$data = app(\App\Domains\Wfh\Services\WfhReportPdfData::class)->forReport(app(\App\Domains\Wfh\Repositories\EloquentWfhRepository::class)->loadReportWithRelations($r));
$pdf = app(\App\Support\Pdf\PdfRendererService::class)->render("pdf.wfh-report", $data);
echo "bytes=".strlen($pdf)." head=".substr($pdf,0,5)."\n";'
```

## Project Structure

```
resources/js/
  lib/            → utilitas lintas halaman: ui-errors.ts (BARU), upload-validate.ts (BARU)
  api/            → satu-satunya tempat yang tahu axios/ApiError; client.ts satu titik unwrap + mapping error
  store/          → slice Redux; thunk reject dengan string hasil toUiError
  pages/          → halaman; memakai toast + Button pending, tidak melihat ApiError
  components/ui/  → primitif (button.tsx, sonner.tsx) — satu implementasi lintas aplikasi
resources/views/pdf/ → 4 template self-contained DOMPDF
tests/Feature/  → PHPUnit Feature (template, guard, validasi upload)
docs/superpowers/ → sumber desain & plan (di-gitignore, tidak di-commit)
```

Konvensi penempatan yang **wajib**: logika error lintas modul di `lib/`; akses jaringan hanya
di `api/`; template PDF tetap self-contained tanpa shared stylesheet.

## Code Style

Naming: komponen `PascalCase`, fungsi `camelCase`, tipe `PascalCase`; komentar teknis bahasa
Inggris, pesan pengguna bahasa Indonesia. Pesan sukses memakai kalimat server dari envelope.

```ts
// resources/js/lib/ui-errors.ts — kontrak presentasi tunggal
export interface UiError {
  kind: "validation" | "auth" | "forbidden" | "notFound" | "conflict" | "rateLimited" | "server" | "network" | "unknown";
  message: string;
  fields?: Record<string, string>;
}
```

```tsx
// halaman — pola wajib
try {
  const res = await dispatch(updateSettingThunk({ key, value })).unwrap();
  toast.success(res.message);
} catch (err) {
  toast.error(toUiError(err).message);   // banner inline tetap dirender
}
```

```php
// FormRequest — pesan pengguna Indonesia
'photo.mimes' => 'Format foto harus JPG, JPEG, atau PNG.',
```

**Dilarang:**

```tsx
import { ApiError } from "@/api/client";   // di luar resources/js/api/
toast.error(String(err));                  // detail mentah
toast.error("Request failed with status code 422");
```

## Testing Strategy

- Framework: Vitest 5 + jsdom (frontend); PHPUnit 11 Feature (backend).
- Lokasi: test di samping file (`*.test.ts(x)`); backend `tests/Feature/**`.
- Level:
  - **Unit** — `toUiError`, `fieldMessage`, `validateUploads`, `decodeBlobEnvelope`.
  - **Komponen** — `Button pending`; pre-check upload per flow.
  - **Halaman** — spinner in-flight (`aria-busy` dengan mock never-resolves), toast sukses teks
    server, toast gagal + banner inline tetap. Auth: spinner saja, tanpa toast.
  - **Slice** — `rejectWithValue` menghasilkan pesan hasil abstraksi.
  - **Backend** — kontrak render template (struktur, CSS), pesan validasi `mimes` Indonesia.
- TDD wajib per task: test gagal → implementasi → hijau (lihat plan).
- Coverage: tanpa target persentase; setiap perilaku yang dijanjikan spec punya assertion.
- Verifikasi visual bersifat struktural, bukan piksel (DOMPDF terbatas); render PDF nyata
  sebagai bukti tambahan, bukan pengganti test.
- Tidak ada test untuk wiring/impor sepele — grep gate untuk aturan struktur.

## Boundaries

**Always do**

- Jalankan test area yang tersentuh sebelum menyatakan task selesai; suite penuh sebelum closeout.
- Pertahankan banner inline error saat gagal (konvensi a602c46: error persisten).
- Gunakan `toUiError`/`UiError` di luar `api/`; pesan sukses dari envelope server.
- Pertahankan kontrak payload/response yang ada (settings per-key, envelope API).
- Terapkan CSS signature identik di ketiga template; verifikasi render nyata setelah mengubahnya.

**Ask first**

- Menambah dependency apa pun.
- Mengubah envelope backend `{success, data, message, meta}` atau menambah `code` stabil (E2).
- Mengubah batas validasi upload (client dan backend harus berubah bersama).
- Mengubah guard ekspor PDF (status/kepemilikan/permission/signature).
- Menyentuh `resources/js/pages/changes/ChangePackageFormPage.tsx` di luar prop `pending`/toast —
  ada perubahan lokal lain di file itu.

**Never do**

- Mengimpor `ApiError`/axios di luar `resources/js/api/`.
- Menampilkan teks axios, status code, stack trace, atau body mentah ke UI.
- Men-toast pada halaman auth atau pada fetch/read biasa (hanya mutasi).
- Menghapus/melemahkan test otorisasi ekspor, validasi upload, atau assertion untuk membuat test lulus.
- Menyimpan/menyajikan signature, foto absensi, atau lampiran di disk publik.
- Mengganti DOMPDF atau menambah library PDF/toast alternatif.
- Mengubah `vendor/` atau file generated.

## Success Criteria

I1–I7 terpenuhi dengan bukti perintah yang tercantum. Rincian per modul ada di
`SPEC-ui-feedback.md` (S1–S12), `SPEC-settings-layout.md` (S1–S7),
`SPEC-upload-errors.md` (S1–S10), `SPEC-pdf-signature.md` (S1–S8).

## Open Questions

Tidak ada. Keputusan yang mengikat: E1 + pintu E2 (abstraksi error), A1 (primitive feedback
bersama), B1 (card per setting, grid 2 kolom), toast + inline saat gagal, auth tanpa toast, dan
"UX saja" untuk guard signature PDF.
