# Capability Map: Feedback UX & Fixes (eoffice)

> Phase 0, disetujui 2026-11-21. Sumber intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved 2026-11-21).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (tasks 1–11).
> Spec per modul di root repo dengan module id yang sama (`SPEC-<module-id>.md`).

| Module id | Responsibility | Depends on | Backend change |
|---|---|---|---|
| `ui-feedback` | Fondasi feedback seragam: seam `UiError` tertutup di `api/client.ts` + `lib/ui-errors.ts` (tabel copy per kind, label field), `<Toaster/>` di-mount sekali, `Button` prop `pending`, API mutasi mengembalikan `message` envelope, `messageOf` semua slice → `toUiError`, spinner+toast seragam di Roles/Users/UserForm/ChangePackage/TeamReports/WfhReports/Profile/Header, auth pages spinner tanpa toast, `ApiError` tidak keluar dari `resources/js/api/` | — | Tidak ada |
| `settings-layout` | `/admin/settings`: card per setting dalam grid 2 kolom responsif (card password admin & user bersebelahan, card ganjil terakhir melebar), tombol Simpan per-setting dengan `pending` + toast sukses/gagal + reset dirty | `ui-feedback` | Tidak ada |
| `upload-errors` | Pre-check client (ukuran/tipe/jumlah) sebelum request di 3 flow upload (signature profil, foto absensi WFH, lampiran change package); pesan `mimes` Indonesia di `AppendAttendanceRequest` & `UploadChangePackageAttachmentsRequest`; error upload via toast + inline, bukan "Data yang diberikan tidak valid." telanjang | `ui-feedback` | Kecil: `messages()` di 2 FormRequest (data validation, bukan DDL) |
| `pdf-signature` | Tanda tangan PDF berada di dalam `.signature-box` (hapus trik `position:absolute; top:-55px`) di `wfh-report`, `wfh-report-admin`, `change-initiation`; pesan 422 PDF personal ("... belum mengatur tanda tangan ...") sampai ke UI via decode blob + toast | — (decode blob bagian `ui-feedback`, dipakai read-only) | Tidak ada |

**Build order:**

```
ui-feedback ──→ settings-layout
ui-feedback ──→ upload-errors
pdf-signature (paralel; decode blob Task 2 ui-feedback dipakai saat tersedia)
```

Alasan: `ui-feedback` memuat tiga kontrak yang dipakai modul lain (`UiError`, `Button pending`, `message` envelope) — mengerjakannya lebih dulu mencegah tiga modul menebak bentuk. `settings-layout` dan `upload-errors` saling independen setelah fondasi. `pdf-signature` murni Blade + satu pemanggil decode; tidak menyentuh frontend layout.

**Non-goal lintas modul:** fitur avatar profil (tidak ada di backend — greenfield, bukan perbaikan), guard signature PDF (keputusan user: "UX saja"), perbaikan OOM DOMPDF (temuan terpisah), perubahan envelope API.

## Konvensi yang berlaku (dari spec lama, tetap hidup)

- `ui-form-kit` (CAPABILITY-MAP-frontend.md, tertutup) menyediakan primitif; `sonner@^2.0.8` + `components/ui/sonner.tsx` sudah ada — **tidak ada dependency baru**.
- Teks pesan domain 4xx dari `ApiResponse::fail`/`ApiException` adalah kontrak terkurasi (`SPEC-error-contract.md`) — boleh tampil apa adanya; yang dilarang adalah teks transport (axios, status code, body mentah, kunci field internal).
- `ApiError` hidup di `resources/js/api/` sebagai tipe internal; konsumen di luar folder itu memakai `UiError`.
