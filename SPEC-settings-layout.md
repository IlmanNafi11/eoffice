# Spec: settings-layout (eoffice)

> Module id: `settings-layout` — indeks: `CAPABILITY-MAP-feedback-ux.md` (approved 2026-11-21).
> Depends on: `ui-feedback` (kontrak `UiError`, `Button pending`, `message` envelope).
> Source of intent: `docs/superpowers/specs/2026-11-21-feedback-ui-settings-wfh-pdf-design.md` (approved).
> Implementation plan: `docs/superpowers/plans/2026-11-21-feedback-ui-settings-wfh-pdf.md` (task 5).

## Objective

Halaman Pengaturan (`/admin/settings`) menyajikan setiap setting sebagai card dalam **grid 2
kolom responsif** (mobile 1 kolom), dengan card password default admin dan user bersebelahan,
dan setiap simpan memberi feedback: spinner saat in-flight, toast sukses berisi kalimat server,
toast gagal + banner inline, serta state dirty yang ter-reset setelah sukses.

**User:** admin pemegang permission `setting.manage`.

**Success (testable):**

| # | Kriteria | Cara verifikasi |
|---|---|---|
| S1 | Wrapper list memakai `grid gap-4 md:grid-cols-2` (`data-testid="settings-grid"`) | Vitest `SettingsPage.test.tsx`: container punya `md:grid-cols-2` |
| S2 | Urutan render mengikuti `SETTING_META`; `password_default_admin` muncul sebelum `password_default_user`; card ganjil terakhir `md:col-span-2` | Vitest: `compareDocumentPosition` + class card terakhir |
| S3 | Simpan sukses → `toast.success(message)` dengan teks dari `PUT /admin/settings/{key}` dan tombol Simpan kembali `disabled` (dirty reset) | Vitest: teks toast muncul; `aria-busy` hilang; tombol disabled |
| S4 | Simpan gagal → `toast.error(toUiError(err).message)` dan banner `data-testid="settings-error"` tetap dirender | Vitest |
| S5 | Tombol Simpan `aria-busy="true"` selama thunk in-flight | Vitest: mock `updateSetting` never-resolves |
| S6 | Kontrak payload per-setting tidak berubah (array tetap array, waktu `HH:mm`, password konfirmasi dialog) | Test lama `SettingsPage.test.tsx:211-342` tetap lulus |
| S7 | Suite frontend hijau | `npx vitest run` |

## Tech Stack

React 19 + Redux Toolkit + Tailwind; `Button` dari `ui-feedback`; `sonner` toast.
**Tidak ada dependency baru. Backend tidak berubah.**

## Commands

```bash
npx vitest run resources/js/pages/admin/SettingsPage.test.tsx
npx vitest run resources/js/store/adminSlice.test.ts resources/js/lib/settings-meta.test.ts
npx vitest run
npm run typecheck
```

## Project Structure

```
resources/js/pages/admin/
  SettingsPage.tsx       → MODIFIKASI: wrapper grid 2 kolom, SettingRow jadi card,
                           prop pending/onSaved, toast sukses/gagal, dirty reset via useEffect
  SettingsPage.test.tsx  → diperluas (S1–S5)
resources/js/store/
  adminSlice.ts          → MODIFIKASI: updateSettingThunk fulfilled membawa message;
                           messageOf → toUiError(error).message
```

## Code Style

Card per setting; grid di wrapper; state lokal `SettingRow` (draft/dirty) tetap di komponen row.

```tsx
<div data-testid="settings-grid" className="grid gap-4 md:grid-cols-2">
  {orderedKeys.map((key, i) => (
    <div key={key} className={i === orderedKeys.length - 1 && orderedKeys.length % 2 === 1 ? "md:col-span-2" : ""}>
      <SettingRow settingKey={key} value={settings[key]} pending={savingKey === key} onSave={requestSave} />
    </div>
  ))}
</div>
```

```tsx
// SettingRow — sinkron draft dengan nilai baru (reset dirty setelah sukses)
useEffect(() => {
  setDraft(initialDraft(meta, value));
  setDirty(false);
}, [value]);
```

**Dilarang:**

```tsx
// ❌ grid satu kolom / urutan object mentah
<div className="flex flex-col gap-4">
// ❌ sukses tanpa feedback
await dispatch(updateSettingThunk({ key, value })).unwrap();
```

## Testing Strategy

- Vitest + jsdom; toast dirender asli (`screen.getByText` mencari ke `document.body`).
- Kasus wajib: grid class, urutan DOM admin→user, toast sukses + dirty reset, toast gagal + banner
  tetap, `aria-busy` saat never-resolving mock.
- Test lama (label, payload, dialog konfirmasi password, gating permission) **tidak** dihapus;
  hanya disesuaikan bila bentuk return thunk berubah.

## Boundaries

**Always do**

- Pertahankan `data-testid="setting-row-{key}"`, `data-testid="settings-error"`, dan dialog
  konfirmasi password.
- Reset dirty hanya setelah thunk `fulfilled`.
- Pakai `toUiError` untuk pesan gagal; jangan membaca `ApiError` langsung.

**Ask first**

- Mengubah kontrak simpan per-key menjadi batch (keputusan B2 ditolak).
- Menambah/menghapus key setting atau mengubah `SETTING_META`.

**Never do**

- Mengubah `UpdateSettingRequest` atau endpoint settings (backend di luar scope modul ini).
- Menghapus banner inline error saat gagal.
- Memindahkan state draft ke Redux (tetap lokal di `SettingRow`).

## Success Criteria

S1–S7 terpenuhi; test lama settings tetap lulus tanpa dihapus.

## Open Questions

Tidak ada.
