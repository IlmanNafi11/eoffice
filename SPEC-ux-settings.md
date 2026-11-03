# SPEC-ux-settings

> Module id: `ux-settings` — dari `CAPABILITY-MAP-ux-fixes.md`
> (Phase 0, approved 2026-11-03). Intent: `docs/intent/ux-settings-wfh-rbac.md`.
> Contract: `postman/specs/openapi.yaml` tag `Settings` (2 op — `listSettings`,
> `updateSetting`) + `routes/api.php` settings group + `SettingController`
> + `UpdateSettingRequest`. Depends on: — (primitif `ui-form-kit`:
> `Checkbox`, `Popover`, `Button`, `Calendar`-pola; pola adapter
> string-`MonthInput` untuk `TimeInput` baru).

## Objective

Halaman Pengaturan (`/admin/settings`) berhenti jadi tampilan JSON
mentah. Hari ini: semua nilai array/objek dirender `JSON.stringify`
read-only (meski `PUT /admin/settings/{key}` backend sudah terbukti
menerima array — `EnvelopeContractTest`), label = key programatik, jam
notifikasi = text bebas. Setelah modul:

1. **`wfh_allowed_days`** — 7 checkbox hari (Senin–Minggu, ISO 1–7),
   editable; simpan mengirim array integer penuh (subset dari [1..7]).
   Konsumen backend (`SendWfhReminders`, `ReportAttendanceController`,
   `AttendanceController::sessionConfig`) tidak berubah — key dan bentuk
   array tetap.
2. **`wfh_sessions`** — 3 checkbox tetap (pagi/siang/sore), uncheck =
   sesi nonaktif; TIDAK ada penambahan sesi bebas (intent terkunci).
   Simpan mengirim subset nama sesi.
3. **`wfh_notify_start_time`** — TimeInput komposisi (Popover + input
   jam/menit bertahap), berbasis shadcn base — BUKAN kontrol native;
   primitif animate-ui time picker tidak ada (terverifikasi di
   `node_modules/@animate-ui/react`). Backend menambah validasi format
   `HH:mm` 24-jam di `UpdateSettingRequest` (key-specific rule, pola
   `passwordRule()` yang sudah ada).
4. **Label manusiawi** — kamus frontend `resources/js/lib/settings-meta.ts`:
   key → `{label, description?, control}`. Label Indonesia: mis.
   "Hari Kerja WFH", "Sesi Absensi WFH", "Jam Mulai Notifikasi WFH",
   "Password Default Admin", "Password Default User". Key tak dikenal →
   fallback label dari key + input teks — **tidak pernah disembunyikan**.
5. `password_default_*` tetap masked (`type=password`, tombol reveal +
   dialog konfirmasi existing tak berubah).

Success: admin mengubah kebijakan hari/sesi/jam sepenuhnya dari UI tanpa
sentuh code/env; bentuk data yang tersimpan tetap kompatibel dengan semua
konsumen `Setting::get()` yang ada.

## Tech Stack

- Frontend: React 19 + TS + Redux Toolkit; `@animate-ui/react` +
  `radix-ui` base (Popover, Checkbox) — tanpa dependency baru.
- Backend: Laravel; satu file tersentuh (`UpdateSettingRequest`).

## Commands

```
Frontend:
  Test:        npm test
  Typecheck:   npx tsc --noEmit
  Build:       npm run build
Backend:
  Test:        docker compose exec app php artisan test tests/Feature/Http/EnvelopeContractTest.php
  Settings:    docker compose exec app php artisan test --filter=Setting
```

## Project Structure

```
resources/js/lib/settings-meta.ts               → BARU: kamus key → label/control + helper ISO↔Senin..Minggu
resources/js/components/ui/time-input.tsx       → BARU: adapter jam "HH:mm" (pola DateInput/MonthInput: state string)
resources/js/components/ui/time-input.test.tsx  → test adapter
resources/js/pages/admin/SettingsPage.tsx       → SettingRow pake meta: label + kontrol per control-type
resources/js/pages/admin/SettingsPage.test.tsx  → test kontrol khusus + fallback
resources/js/api/admin.ts                       → updateSetting dilebarkan: value string | number | boolean | string[] (backend sudah terima array)
app/Http/Requests/UpdateSettingRequest.php      → rule format per key (HH:mm untuk wfh_notify_start_time)
tests/Feature/Http/SettingsValidationTest.php   → BARU: validasi jam, array hari, array sesi
docs/…/CHANGELOG.md                             → entri
```

`adminSlice.ts` tidak berubah (thunk `updateSettingThunk` sudah
memperbarui cache map dengan `value` apa pun bentuknya).

## Code Style

Kamus meta adalah kontrak UI — typed, tanpa string ajaib tersebar:

```ts
// settings-meta.ts — satu sumber label + kontrol.
export type SettingControl =
  | { kind: "day-checkbox" }      // wfh_allowed_days — 7 hari ISO 1..7
  | { kind: "session-checkbox" }  // wfh_sessions — pagi/siang/sore fixed
  | { kind: "time" }              // wfh_notify_start_time — HH:mm
  | { kind: "password" }          // password_default_* — masked + konfirmasi
  | { kind: "text" };             // fallback key tak dikenal

export interface SettingMeta {
  label: string;
  description?: string;
  control: SettingControl;
}

export const SETTING_META: Record<string, SettingMeta> = {
  wfh_allowed_days: {
    label: "Hari Kerja WFH",
    description: "Hari di mana absensi dan laporan WFH diizinkan.",
    control: { kind: "day-checkbox" },
  },
  // …
};

export function settingMeta(key: string): SettingMeta {
  return SETTING_META[key] ?? { label: key, control: { kind: "text" } };
}
```

Kontrol structured menyimpan draft di state halaman (array typed), bukan
string JSON; `Simpan` per key tetap (pola existing), mengirim nilai
ter-decode lewat `updateSetting`.

## Testing Strategy

- Vitest + RTL, file di samping modul.
- Unit wajib:
  - `time-input.test.tsx` — kontrak string `HH:mm`/`""` (pola
    `month-input.test.tsx`): placeholder, pilih jam, hapus.
  - `SettingsPage.test.tsx` diperbarui — label manusiawi dirender (bukan
    key mentah); `wfh_allowed_days` = 7 checkbox, uncheck Sabtu/Minggu
    lalu Simpan mengirim `[1,2,3,4,5]`; `wfh_sessions` = 3 checkbox
    fixed, uncheck satu sesi mengirim subset; time picker tersaji dan
    tak ada `<input type="time">` native; fallback key tak dikenal =
    input teks berlabel key; `password_default_*` tetap masked +
    dialog konfirmasi.
  - `admin.test.ts` — `updateSetting` dengan array (bentuk baru value).
- Test existing yang mengunci perilaku LAMA dan bertentangan dengan modul
  ini WAJIB diubah bersama commit (regresi pin lama dibuang, bukan
  dipertahankan): `SettingsPage.test.tsx` ("structured read-only",
  draft scalar text) dan test `types.test.ts` yang mengunci bentuk input.
- PHPUnit: `SettingsValidationTest` — `wfh_notify_start_time` non-format
  (mis. "25:00", "abc") → 422; format valid + array hari/sesi → 200 dan
  tersimpan sebagai array; `EnvelopeContractTest` pass unmodified.
- E2E manual: admin ubah hari WFH (uncheck Jumat) → staf mencoba absen
  hari Jumat → 422 pesan server; kembalikan. Terdokumentasi commit.

## Boundaries

**Always:**
- Nama key, nama permission, dan bentuk data yang tersimpan tidak berubah
  (array integer ISO 1–7; array nama sesi subset; string `HH:mm`).
- Key tak dikenal selalu tampil (fallback). Kamus dibaca lewat
  `settingMeta(key)`, tidak pernah akses `SETTING_META[key]` langsung
  tanpa fallback.
- Validasi nilai berformat ada di server (`UpdateSettingRequest`), bukan
  cuma di UI.
- Update `openapi.yaml` deskripsi setting bila bentuk value terdokumentasi
  berubah (array kini writable).

**Ask first:**
- Menambah dependency baru untuk time picker (target: nol).
- Menambah key baru ke `SettingsSeeder`.

**Never:**
- Kontrol native (`<input type="time">`, `<select>` hari) di halaman ini.
- Menambah sesi bebas untuk `wfh_sessions` atau mengubah union
  `WfhSession` di `types.ts`.
- Menghapus/mengganti nama key setting mana pun.
- Menyembunyikan setting dari daftar karena tidak ada di kamus.

## Success Criteria (re-runnable)

1. `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm test` hijau.
2. Docker PHPUnit: setting validation hijau; `EnvelopeContractTest`
   (termasuk PUT `wfh_allowed_days` array) pass unmodified.
3. Halaman Pengaturan menampilkan label Indonesia + kontrol khusus untuk
   seluruh key seeded; tidak ada string JSON `[1,2,3,4,5]` sebagai nilai
   editable-read-only tersisa.
4. Perubahan hari/sesi/jam lewat UI memengaruhi perilaku nyata (E2E:
   absen di hari non-WFH tertolak 422 dengan pesan server).
5. Grep audit: `type="time"` dan kontrol native = 0 di `SettingsPage`.

## Open Questions

1. Deskripsi singkat per setting (1 kalimat) saya draf sendiri berbahasa
   Indonesia; koreksi redaksi saat review spec ini bila ada keberatan.
