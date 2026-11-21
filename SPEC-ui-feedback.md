# Spec: ui-feedback (eoffice)

> Module id: `ui-feedback` — indeks: `CAPABILITY-MAP-feedback-ux.md` (approved 2026-11-21).
> Source of intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (tasks 1–4, 7, 10).

## Objective

Satu standar feedback untuk setiap aksi mutasi di SPA: tombol menyajikan spinner selama
in-flight, hasil disampaikan via toast (sukses memakai kalimat server), kegagalan disampaikan
via toast + banner inline yang sudah ada, dan **layer UI tidak pernah mengetahui detail error
transport** — halaman hanya melihat `UiError {kind, message, fields?}`.

**User:** seluruh pengguna SPA (staf, kepala tim, admin). **Konsumen kontrak:** semua halaman
yang memicu mutasi + semua slice Redux.

**Success (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | `<Toaster/>` ter-mount tepat satu kali di `app.tsx`; setiap toast muncul di `document.body` | Vitest `button.test.tsx` + test halaman (`screen.getByText` menemukan teks toast) |
| S2 | `Button pending` → `disabled`, `aria-busy="true"`, spinner `<Loader2 data-slot="spinner">` dirender; `pending=false` → tidak ada keduanya | Vitest `button.test.tsx` (2 kasus) |
| S3 | `toUiError` memetakan `ApiError` → kind benar (422 validation, 401 auth, 403 forbidden, 404 notFound, 409 conflict, 429 rateLimited, ≥500 server, network) dan teks axios (`Request failed…`, `Network Error`) diganti copy per kind | Vitest `ui-errors.test.ts` (8 kasus) |
| S4 | Pesan domain server terkurasi diteruskan apa adanya ("Hanya paket pending yang dapat disetujui."); error non-`ApiError` → `unknown` tanpa detail | Vitest `ui-errors.test.ts` |
| S5 | Respons blob 4xx (PDF) menghasilkan pesan server, bukan teks axios; `decodeBlobEnvelope` dipakai `wfh-monitoring.ts` + `change-package.ts` (duplikasi `blobMessage` hilang) | Vitest `client.test.ts` + `wfh-monitoring.test.ts` + `change-package.test.ts` |
| S6 | Kunci field internal (`files.0`, `photo`, `signature`) dipetakan ke label Indonesia via `FIELD_LABELS`; kunci tak dikenal tidak diteruskan mentah | Vitest `ui-errors.test.ts` + `client.test.ts` |
| S7 | Fungsi mutasi yang dikonsumsi UI mengembalikan `message` envelope (mis. `updateSetting` → `{key, value, message}`) | Vitest `admin.test.ts` + test api terkait |
| S8 | Tombol aksi di Roles/Users/UserForm/ChangePackage (termasuk "Buat paket")/TeamReports/WfhReports/Profile/Header menyajikan spinner saat thunk in-flight; sukses → `toast.success(pesan server)`; gagal → `toast.error` + banner inline tetap | Vitest per halaman (pola: mock thunk never-resolves → `aria-busy`; toast teks server; banner tetap) |
| S9 | Halaman auth (5) hanya spinner + inline per-field — tanpa toast | Vitest auth pages (tidak ada panggilan toast; `aria-busy` ada) |
| S10 | `ApiError` tidak diimpor di luar `resources/js/api/` | Grep gate: `grep -rn "ApiError" resources/js/pages resources/js/components | grep -v test` = 0 hit kode |
| S11 | `messageOf` di 4 slice (wfh, changePackage, admin, auth) memakai `toUiError(error).message` | Vitest slice tests |
| S12 | Kedua suite hijau | `npx vitest run` + `php artisan test --compact` |

## Tech Stack

- React 19 + Redux Toolkit + TypeScript strict; `sonner@^2.0.8` + `components/ui/sonner.tsx` (sudah ada, belum di-mount).
- Vitest 5 + jsdom + Testing Library; setup `resources/js/test/setup.ts`.
- **Tidak ada dependency baru.**

## Commands

```bash
# Frontend — suite penuh
npx vitest run

# Frontend — terarah
npx vitest run resources/js/lib/ui-errors.test.ts
npx vitest run resources/js/api/client.test.ts
npx vitest run resources/js/pages/admin/SettingsPage.test.tsx
npm run typecheck
npm run build

# Backend (hanya jika modul menyentuh backend — ui-feedback: tidak)
php artisan test --compact

# Lint
vendor/bin/pint --test
```

## Project Structure

```
resources/js/
  lib/
    ui-errors.ts              → BARU: UiError {kind,message,fields?}, UI_ERROR_COPY, toUiError, fieldMessage
    ui-errors.test.ts         → BARU
  api/
    client.ts                 → MODIFIKASI: toApiError async + decodeBlobEnvelope + FIELD_LABELS;
                                ApiError TIDAK diekspor keluar folder api/ (grep gate S10)
    client.test.ts            → diperluas (blob 422, network copy)
    admin.ts / profile.ts / wfh.ts / change-package.ts → mutasi mengembalikan message envelope
  components/
    ui/button.tsx             → MODIFIKASI: prop pending (Loader2 + aria-busy + disabled)
    ui/button.test.tsx        → BARU
  app.tsx                     → MODIFIKASI: <Toaster position="top-right" richColors /> di dalam Provider
  store/
    wfhSlice.ts / changePackageSlice.ts / adminSlice.ts / authSlice.ts
                              → messageOf → toUiError(error).message
  pages/
    admin/RolesPage.tsx, UsersPage.tsx, UserFormPage.tsx
    changes/ChangePackageFormPage.tsx, ChangePackageDetailPage.tsx
    wfh/TeamReportsPage.tsx, WfhReportsPage.tsx
    profile/ProfilePage.tsx   → spinner manual → prop pending; sukses via toast (hapus inline role="status" sukses)
    auth/*.tsx (5)            → spinner manual → prop pending; TANPA toast
  components/layout/Header.tsx → logout: prop pending
```

## Code Style

Konvensi repo: TypeScript strict, komponen fungsi, komentar teknis bahasa Inggris, pesan
pengguna bahasa Indonesia. Toast dipanggil dari handler halaman (bukan dari slice/middleware).

**Seam error — satu-satunya cara halaman melihat error:**

```ts
// resources/js/lib/ui-errors.ts
export type UiErrorKind =
  | "validation" | "auth" | "forbidden" | "notFound" | "conflict"
  | "rateLimited" | "server" | "network" | "unknown";

export interface UiError {
  kind: UiErrorKind;
  message: string;                    // umum, representatif, aman ditampilkan
  fields?: Record<string, string>;    // label field UI → petunjuk singkat
}

export function toUiError(error: unknown): UiError { /* ApiError → kind/status mapping */ }
export function fieldMessage(ui: UiError, field: string): string | null { /* ui.fields?.[field] ?? null */ }
```

**Di halaman — pola wajib:**

```tsx
try {
  const res = await dispatch(updateSettingThunk({ key, value })).unwrap();
  toast.success(res.message);                       // kalimat server
} catch (err) {
  toast.error(toUiError(err).message);              // banner inline tetap dirender
}
```

**Dilarang:**

```tsx
// ❌ detail transport bocor ke UI
import { ApiError } from "@/api/client";            // di luar folder api/
if (err instanceof ApiError) setMessage(err.message);
toast.error(String(err));                           // stack/message mentah
// ❌ teks axios
toast.error("Request failed with status code 422");
```

**Button pending:**

```tsx
<Button pending={savingKey === key} onClick={() => onSave(key, draft.value)}>
  <Save aria-hidden="true" className="size-4" /> Simpan
</Button>
```

## Testing Strategy

- Framework: Vitest 5 + jsdom; toast sonner dirender asli ke `document.body` (tidak di-mock).
- Lokasi: test di samping file (`*.test.ts(x)`), setup global `resources/js/test/setup.ts`.
- Level:
  - **Unit** — `toUiError`/`fieldMessage` (Task 1, 8 kasus); `decodeBlobEnvelope` via `client.test.ts`.
  - **Komponen** — `Button pending` (2 kasus).
  - **Halaman** — satu test representatif per pola: spinner in-flight (mock never-resolves →
    `aria-busy`), toast sukses (teks server), toast gagal + banner inline tetap. Auth: spinner saja.
  - **Slice** — `rejectWithValue` menghasilkan pesan copy untuk error teknis.
- Pola TDD wajib: test gagal dulu → implementasi → hijau (per task di plan).
- Tidak ada test untuk wiring sepele (impor/re-ekspor); grep gate S10 menggantikan test struktur.
- Verifikasi toast: asersi teks muncul di `screen`, bukan implementasi sonner.

## Boundaries

**Always do**

- Panggil `toast.*` dari handler halaman; pesan sukses dari `message` envelope server.
- Bungkus kegagalan dengan `toUiError` sebelum menyentuh UI; banner inline error tetap ada.
- Pertahankan kontrak `rejectWithValue(string)` semua slice.
- Update test yang men-pin perilaku lama (bentuk return, label) — jangan di-pin ulang.
- Jalankan `npx vitest run` area tersentuh sebelum menyatakan task selesai.

**Ask first**

- Menambah dependency apa pun (termasuk library toast alternatif).
- Mengubah bentuk `UiError` setelah modul konsumen mulai memakainya (breaking kontrak internal).
- Menambah halaman baru ke daftar toast di luar daftar S8/S9.
- Menyentuh `resources/js/pages/changes/ChangePackageFormPage.tsx` di luar prop `pending`/toast —
  ada perubahan lokal lain di file itu.

**Never do**

- Mengimpor `ApiError`/axios di luar `resources/js/api/`.
- Menampilkan teks axios, status code, stack trace, atau body mentah ke UI.
- Men-toast pada halaman auth (login/logout) atau pada fetch/read biasa.
- Menghapus banner inline error untuk menggantinya dengan toast (konvensi a602c46).
- Men-toast dari middleware Redux/slice (keputusan A2 ditolak).
- Mengubah envelope backend `{success, data, message, meta}`.

## Success Criteria

Seluruh baris tabel **Success (testable)** S1–S12 terpenuhi dengan bukti perintah yang
tercantum; `npx vitest run` dan `php artisan test --compact` hijau; grep gate S10 kosong.

## Open Questions

Tidak ada. Semua keputusan (E1+pintu E2, konvensi toast/inline, auth tanpa toast, A1/B1)
disetujui di dokumen desain dan dirangkum `CAPABILITY-MAP-feedback-ux.md`.
