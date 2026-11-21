# Spec: upload-errors (eoffice)

> Module id: `upload-errors` — indeks: `CAPABILITY-MAP-feedback-ux.md` (approved 2026-11-21).
> Depends on: `ui-feedback` (kontrak `UiError`, `FIELD_LABELS`, toast).
> Source of intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (task 9).

## Objective

Error upload gambar disajikan representatif: validasi client-side menolak file yang jelas salah
(ukuran/tipe/jumlah) **sebelum request terkirim**, pesan per-field dari server yang sudah
berbahasa Indonesia sampai ke UI (bukan "Data yang diberikan tidak valid." telanjang), dan dua
FormRequest yang masih memakai pesan default Inggris untuk `mimes` diberi pesan Indonesia.

**User:** staf (upload foto absensi), semua pengguna (signature profil), inisiator perubahan
(lampiran paket).

**Success (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | `validateUploads(files, rule)` menolak ukuran > max dengan pesan `"Ukuran {label} maksimal {n}MB."` | Vitest `upload-validate.test.ts` |
| S2 | Menolak tipe di luar `mimeTypes` dengan pesan `"Format {label} harus JPG, JPEG, atau PNG."` | Vitest |
| S3 | Menolak jumlah > `maxCount` dengan pesan `"Maksimal {n} lampiran."` | Vitest |
| S4 | Lolos → `null` (request dikirim) | Vitest |
| S5 | Pre-check dipanggil di 3 flow: file salah tidak mengirim request (mock API tidak terpanggil) + toast error | Vitest per flow (attendance, signature, attachments) |
| S6 | `accept` attendance diperketat `image/jpeg,image/png` (bukan `image/*`) | Vitest `attendance-upload` |
| S7 | Kegagalan server 422 tampil sebagai pesan per-field via `UiError.fields`/toast, bukan generik telanjang | Vitest slice + halaman |
| S8 | `AppendAttendanceRequest` pesan `photo.mimes` = "Format foto harus JPG, JPEG, atau PNG." | PHPUnit `ReportAttendanceSubResourceTest` (upload .gif → `errors.photo.0` persis) |
| S9 | `UploadChangePackageAttachmentsRequest` punya `messages()`: `files.max`, `files.*.mimes`, `files.*.max`, `files.*.file` berbahasa Indonesia | PHPUnit test attachments |
| S10 | Kedua suite hijau | `npx vitest run` + `php artisan test --compact` |

## Tech Stack

React 19 + jsdom (pre-check murni `File.size`/`File.type`/ekstensi — tanpa magic-byte, jsdom
tidak punya decoder; server tetap final gate); Laravel FormRequest `messages()`.
**Tidak ada dependency baru.**

## Commands

```bash
# Frontend
npx vitest run resources/js/lib/upload-validate.test.ts
npx vitest run resources/js/components/wfh/ resources/js/pages/profile/ resources/js/pages/changes/

# Backend (Docker bila host toolchain bermasalah — host saat ini punya php+vendor)
php artisan test --compact tests/Feature/Wfh/ReportAttendanceSubResourceTest.php
php artisan test --compact tests/Feature/ChangeManagement
```

## Project Structure

```
resources/js/lib/
  upload-validate.ts        → BARU: UploadRule {maxBytes, mimeTypes, maxCount?, label},
                              validateUploads(files, rule): string | null,
                              SIGNATURE_RULE / ATTENDANCE_RULE / ATTACHMENT_RULE
  upload-validate.test.ts   → BARU
resources/js/components/wfh/
  attendance-upload.tsx     → MODIFIKASI: accept="image/jpeg,image/png", pre-check sebelum onUpload
resources/js/pages/profile/
  ProfilePage.tsx           → MODIFIKASI: pre-check SIGNATURE_RULE di handleFileChange
resources/js/pages/changes/
  ChangePackageDetailPage.tsx → MODIFIKASI: pre-check ATTACHMENT_RULE (termasuk maxCount 10)
app/Domains/Wfh/Http/Requests/
  AppendAttendanceRequest.php               → + 'photo.mimes' => 'Format foto harus JPG, JPEG, atau PNG.'
app/Domains/ChangeManagement/Http/Requests/
  UploadChangePackageAttachmentsRequest.php → + messages(): files.max / files.*.mimes / files.*.max / files.*.file
tests/Feature/Wfh/ReportAttendanceSubResourceTest.php → diperluas (S8)
```

## Code Style

Rule dinyatakan sebagai data; pesan disusun dari `rule.label` — tidak ada pesan hard-code
per pemanggil.

```ts
// resources/js/lib/upload-validate.ts
export interface UploadRule {
  maxBytes: number;
  mimeTypes: string[];
  maxCount?: number;
  label: string; // label Indonesia untuk pesan
}

export const SIGNATURE_RULE: UploadRule = {
  maxBytes: 2 * 1024 * 1024, mimeTypes: ["image/png", "image/jpeg"], label: "Tanda tangan",
};
export const ATTENDANCE_RULE: UploadRule = {
  maxBytes: 2 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png"], label: "Foto absensi",
};
export const ATTACHMENT_RULE: UploadRule = {
  maxBytes: 10 * 1024 * 1024, mimeTypes: ["image/jpeg", "image/png"], maxCount: 10, label: "Lampiran",
};

export function validateUploads(files: File[], rule: UploadRule): string | null {
  // count → size → type; null berarti lolos
}
```

```tsx
// integrasi — tolak sebelum request
const violation = validateUploads([file], ATTENDANCE_RULE);
if (violation) {
  toast.error(violation);
  return; // TIDAK memanggil onUpload
}
```

**Backend — pesan Indonesia:**

```php
'photo.mimes' => 'Format foto harus JPG, JPEG, atau PNG.',
'files.max' => 'Maksimal 10 lampiran.',
'files.*.mimes' => 'Format file harus JPG, JPEG, atau PNG.',
'files.*.max' => 'Ukuran file maksimal 10MB.',
'files.*.file' => 'File tidak valid.',
```

**Dilarang:**

```tsx
// ❌ mengandalkan accept sebagai validasi (hanya hint dialog)
<FileInput accept="image/*" />
// ❌ menelan kegagalan server jadi pesan generik
catch { setMessage("Data yang diberikan tidak valid."); }
```

## Testing Strategy

- Vitest + jsdom: `File` konstruktor jsdom mendukung `size`/`type`; ukuran dibuat via
  `new ArrayBuffer(n)`.
- Kasus wajib: size/type/count/lolos (S1–S4); integrasi per flow — file salah → toast + API mock
  TIDAK terpanggil (S5); `accept` attribute (S6).
- Backend: PHPUnit Feature — upload ekstensi salah → asersi `errors.photo.0` persis teks
  Indonesia; attachment > 10 file → `errors.files.0` pesan Indonesia.
- Server validation tetap final gate — pre-check client adalah UX, bukan pengganti keamanan.

## Boundaries

**Always do**

- Panggil `validateUploads` sebelum membentuk `FormData`/request.
- Pertahankan rule backend sebagai sumber kebenaran (client rule harus cocok: signature 2MB
  png/jpg/jpeg, attendance 2MB jpg/jpeg/png, attachment 10MB jpg/jpeg/png max 10).
- Tampilkan kegagalan server via `toUiError` + toast; banner inline tetap.

**Ask first**

- Mengubah batas ukuran/tipe/jumlah di client ATAU backend (harus berdua, satu commit).
- Menambah tipe file baru (mis. PDF attachment) — menyentuh kontrak backend.

**Never do**

- Mempercayai `File.type` sebagai keamanan (server tetap memvalidasi; client hanya UX).
- Membaca isi file untuk magic-byte di jsdom test (tidak didukung; tidak diperlukan).
- Menghapus/memelemahkan test validasi server yang ada.
- Mengubah aturan `PrivateMediaPath`/penyimpanan private disk.

## Success Criteria

S1–S10 terpenuhi; tidak ada jalur upload yang mengirim request untuk file yang sudah diketahui
salah di client.

## Open Questions

Tidak ada.
