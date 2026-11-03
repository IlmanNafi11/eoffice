# SPEC-rbac-ux

> Module id: `rbac-ux` — dari `CAPABILITY-MAP-ux-fixes.md`
> (Phase 0, approved 2026-11-03). Intent: `docs/intent/ux-settings-wfh-rbac.md`.
> Contract: `postman/specs/openapi.yaml` tag `RBAC Management` (3 op —
> `listRoles`, `updateRolePermissions`, `listPermissions`) + `routes/api.php`
> RBAC group. Depends on: — (primitif `ui-form-kit`: `Checkbox`; murni
> presentasi — tidak ada backend change).

## Objective

Halaman Peran & Permission (`/admin/roles`) berhenti merender nama
permission programatik (`change.implementation.create`) sebagai label
checkbox flat. Setelah modul:

1. **Label manusiawi + grouping per modul** — kamus frontend
   `resources/js/lib/permissions-meta.ts`: permission → `{section, label}`.
   Contoh `change.implementation.create` → section "Manajemen Perubahan",
   label "Buat Implementasi"; `wfh.report.approve` → "WFH", "Menyetujui
   Laporan". Kolom grid tetap section per **role** (admin / kepala
   bidang / kepala tim / staf) sesuai intent — grouping per modul ada
   DI DALAM tiap card role.
2. **Fallback** — permission tanpa entri kamus dirender di section
   "Lainnya" dengan nama mentah; **tidak pernah disembunyikan** (grid
   harus selalu mencerminkan daftar permission server; risiko RBAC rusak
   karena permission tak terlihat).
3. Perilaku sync penuh, dialog lockout kritis, dan gate `role.manage`
   existing **tidak berubah** — hanya penyajian label/urutan.

Success: admin membaca matrix RBAC dengan istilah bisnis berbahasa
Indonesia, tidak ada nama permission mentah sebagai label utama yang
terekspos (kecuali fallback "Lainnya"), dan daftar permission baru dari
server tetap otomatis muncul.

## Tech Stack

- Frontend: React 19 + TS + Redux Toolkit; `Checkbox` ui-form-kit existing.
- Backend: tidak berubah.

## Commands

```
Frontend:
  Test:        npm test
  Typecheck:   npx tsc --noEmit
  Build:       npm run build
```

## Project Structure

```
resources/js/lib/permissions-meta.ts   → BARU: kamus permission → {section, label} + grouping helper
resources/js/lib/permissions-meta.test.ts → test kamus + fallback + empty-safe
resources/js/pages/admin/RolesPage.tsx → konsumsi kamus: grouping per modul dalam tiap card role
resources/js/pages/admin/RolesPage.test.tsx → sesuaikan: label + grouping + fallback
docs/CHANGELOG.md                      → entri
```

`adminSlice.ts`/`api/admin.ts` tidak berubah (sumber kolom permission:
`listPermissions` bila pemegang `permission.manage`, else derived dari
`listRoles` — pola existing tetap).

## Code Style

```ts
// permissions-meta.ts — label + section; fallback aman untuk perm baru.
export interface PermissionMeta {
  section: string;
  label: string;
}

export const PERMISSION_META: Record<string, PermissionMeta> = {
  "user.manage": { section: "Manajemen Pengguna", label: "Kelola Pengguna" },
  // …
  "wfh.attendance.create": { section: "WFH", label: "Buat Absensi" },
  "wfh.report.create":    { section: "WFH", label: "Buat Laporan WFH" },
  "change.implementation.create": {
    section: "Manajemen Perubahan", label: "Buat Implementasi",
  },
};

export const UNKNOWN_SECTION = "Lainnya";

export function permissionMeta(name: string): PermissionMeta {
  return (
    PERMISSION_META[name] ?? { section: UNKNOWN_SECTION, label: name }
  );
}

export function groupPermissions(names: string[]): Array<{
  section: string;
  permissions: { name: string; label: string }[];
}> { /* urutan section stabil, perm urut di dalam */ }
```

Section yang diusulkan (ikan dari 39 permission seeder):
`Manajemen Pengguna` (`user.*`), `RBAC` (`role.manage`, `permission.manage`),
`WFH` (`wfh.*`), `Manajemen Perubahan` (`change.*`, `wfh.team_report.*`
di bawah WFH), `Pengaturan` (`setting.manage`). Nama section Indonesia.

## Testing Strategy

- Vitest + RTL.
- Unit wajib:
  - `permissions-meta.test.ts` — semua permission seeder punya entri atau
    mengarah ke `Lainnya`; `groupPermissions` mengembalikan section stabil
    + perm urut; input kosong → array kosong (empty-safe).
  - `RolesPage.test.tsx` diperbarui — label Indonesia dirender (bukan
    nama mentah) untuk permission yang dikenal; permission tak dikenal
    muncul di section "Lainnya" dan bisa di-check; sync penuh + lockout
    admin existing tetap hijau.
- Tidak ada test echo; perilaku kontrak (sync penuh, lockout) tetap
  terkunci.
- E2E manual: buka Peran & Permission sebagai admin → modul tampil
  terkelompok per section role, uncheck/simpan masih berfungsi.
  Terdokumentasi di commit message.

## Boundaries

**Always:**
- Kolom permission bersumber dari server (`listPermissions` / derived
  `listRoles`) — tidak pernah hardcode daftar permission di halaman.
- `can()` gate tetap (`role.manage`, `permission.manage`), behavior sync
  penuh + lockout tidak berubah.
- Permission tak dikenal tampil di "Lainnya".

**Ask first:**
- Mengganti/menambah section kamus ke modul baru yang menyimpang dari 5
  section di Code Style.

**Never:**
- Menyembunyikan permission tanpa label.
- Meng-gate atau menampilkan UI by role name.
- Mengubah bentuk payload `updateRolePermissions` (tetap sync penuh).
- Mengubah nama permission seeder atau backend (di luar scope — intent
  terkunci: nama permission tidak berubah).

## Success Criteria (re-runnable)

1. `npx tsc --noEmit` exit 0; `npm run build` exit 0; `npm test` hijau.
2. 39 permission seeder tercakup kamus atau otomatis ke "Lainnya"
   (test `permissions-meta.test.ts` mewakilkan penuh).
3. Grep UI: nama permission mentah sebagai label checkbox utama = 0
   (kecuali section "Lainnya" atau fallback).
4. E2E manual terdokumentasi: grouping + label + simpan masih bekerja.

## Open Questions

1. Nama section Indonesia bisa disesuaikan (mis. "Manajemen Perubahan" vs
   "Perubahan"/"Change") — draf saya di Code Style; konfirmasi saat
   review.