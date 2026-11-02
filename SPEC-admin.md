# SPEC-admin

> Module id: `admin` — dari `CAPABILITY-MAP-frontend.md` (Phase 0, approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml`
> (tag `User Management` 6 op + `RBAC Management` 3 op + `Organization` 1 op + `Settings` 2 op = **12 op**).
> Depends on: — (mewarisi primitif dari modul tertutup `wfh-reports`: `pagination`; pola form/lampiran
> dari `change-package`). `listTeams` **dipinjam** dari `api/wfh-team.ts` (sudah ada, tidak diduplikasi).

## Objective

Membawa domain **RBAC admin** ke SPA: tiga menu ("Manajemen User", "Peran & Permission",
"Pengaturan") yang menyajikan:

1. **Manajemen User** (`/admin/users`) — tabel users paginated (`listUsers`), buat user
   (`createUser`), edit user (`getUserById` + `updateUser`), hapus user (`deleteUser`),
   dan import spreadsheet (`importUsers` — XLSX/XLS/CSV ≤10 MB, panel hasil
   `{imported, skipped, errors[]}`).
2. **Peran & Permission** (`/admin/roles`) — grid role × permission checkbox
   (`listRoles` + `listPermissions`) dengan sync penuh per role via
   `updateRolePermissions`; pesan 422 lockout ("Role 'admin' tidak boleh kehilangan
   permission kritis: …") selalu dirender.
3. **Pengaturan** (`/admin/settings`) — daftar setting map `{key: value}`
   (`listSettings`), edit nilai per key (`updateSetting`).

Success = 12 `operationId` terkonsumsi dari UI sesuai `openapi.yaml`, backend tak berubah.
Semua gate UI adalah **data kontrak** (`can(user, …)` nama persis seeder); server tetap
satu-satunya otoritas — seeder saat ini memberi seluruh permission admin hanya ke role
`admin`, tetapi UI **tidak pernah** meng-gate by role.

### Peta permission × endpoint (kontrak routes/api.php:56-87 + seeder, bukan logika UI)

| Permission (seeder) | Endpoint yang di-gate | admin | kepala bidang | kepala tim | staf |
|---|---|---|---|---|---|
| `user.manage` | `listUsers`, `getUserById` | ✓ | ✗ 403 | ✗ | ✗ |
| `user.create` | `createUser` | ✓ | ✗ | ✗ | ✗ |
| `user.update` | `updateUser` | ✓ | ✗ | ✗ | ✗ |
| `user.delete` | `deleteUser` | ✓ | ✗ | ✗ | ✗ |
| `user.import` | `importUsers` | ✓ | ✗ | ✗ | ✗ |
| `role.manage` | `listRoles`, `updateRolePermissions` | ✓ | ✗ | ✗ | ✗ |
| `permission.manage` | `listPermissions` | ✓ | ✗ | ✗ | ✗ |
| `setting.manage` | `listSettings`, `updateSetting` | ✓ | ✗ | ✗ | ✗ |
| — (auth saja) | `listTeams` (dipinjam) | ✓ | ✓ | ✓ | ✓ |

Non-admin yang mengetik URL `/admin/*` langsung: menu hilang (registry), halaman tetap
me-render kerangka; 403 "This action is unauthorized." dari server tersaji Indonesia.

## Scope

**In-scope endpoints (12 ops):**

| Path | Op | Verb | Response |
|---|---|---|---|
| `/admin/users` | `listUsers` | GET | **envelope `ApiResponse::paginated`** `UserListResponse` `{success, data: UserResource[], meta: PaginationMeta}` (pelajaran `a78e547`: list = envelope paginated, bukan paginator raw); query `per_page?` (default 15, `ClampsPerPage`), `page` implicit paginator |
| `/admin/users` | `createUser` | POST | 201 envelope `UserResource`; body `StoreUserRequest` — wajib `{name, nip, email, roles[]}`; opsional `{team_id?, rank?, position?, phone?, password?, permissions?}`; **password kosong → server injek default dari Settings per role + `must_change_password=true`** (Info: openapi:470-474) |
| `/admin/users/{user}` | `getUserById` | GET | envelope `UserResource`; 404 "User tidak ditemukan." vs 403 dipisah server |
| `/admin/users/{user}` | `updateUser` | PUT | envelope `UserResource`; body `UpdateUserRequest` — semua opsional (`sometimes`); **`permissions[]` sync penuh** (replace semua direct permission); 422 duplikat nip/email |
| `/admin/users/{user}` | `deleteUser` | DELETE | envelope `SuccessResponse` "User berhasil dihapus."; confirm dialog client |
| `/admin/users/import` | `importUsers` | POST | multipart `file` — mimes `xlsx,xls,csv`, `max:10240` (controller:129); 200 `{success, message, data: {imported, skipped, errors: string[]}}`; 422 "Import gagal. Silakan periksa format file." |
| `/admin/roles` | `listRoles` | GET | envelope `{success, data: RoleResource[]}` `{id, name, permissions: string[]}` |
| `/admin/roles/{id}/permissions` | `updateRolePermissions` | PUT | envelope `RoleResource`; body `{permissions: string[]}` **sync penuh**; 422 lockout role terproteksi (openapi:3179-3183) atau "The selected permissions.N is invalid."; 404 "Role tidak ditemukan." |
| `/admin/permissions` | `listPermissions` | GET | envelope `{success, data: PermissionResource[]}` `{id, name}` |
| `/teams` | `listTeams` — **DIPINJAM** `api/wfh-team.ts` | GET | sudah ada; `field_id?` filter tidak dipakai modul ini (dropdown pilih tim perlu semua tim) |
| `/admin/settings` | `listSettings` | GET | envelope `{success, data: {key: value, …}}` — map flat, nilai ter-decode (string/number/boolean/array) via `Setting::prime()` |
| `/admin/settings/{key}` | `updateSetting` | PUT | envelope `data: {key, value}`; body `UpdateSettingRequest` `{value}`; key tak ada → **404** "Setting 'unknown_key' tidak ditemukan." (SettingController:30-33; contoh openapi meletakkan 422 — pesan server dirender apa pun statusnya) |

Route middleware ground truth: `routes/api.php:56-87` — guard **per-aksi** (bukan satu
`user.manage` untuk semua), tabel di atas mencerminkannya persis.

**Out of scope:** endpoint personal/team/monitoring `wfh*` (tertutup), `changes` (tertutup),
`verification` (modul terakhir), manajemen roles/bidang/teams CRUD (tidak ada di kontrak —
`listTeams` read-only), edit `Setting` buat key baru (kontrak update-only).

**Dipinjam:** `listTeams` dari `api/wfh-team.ts` (dropdown tim di form user — admin butuh
semua tim, tanpa filter `field_id`).

## Resolved Decisions (user, 2026-11-02)

1. **#1 — Halaman roles + nav entry baru.** Menu "Peran & Permission" (`/admin/roles`,
   gated `role.manage`) ditambahkan ke `nav-registry.ts`; grid role × permission.
2. **#2 — Editor nilai setting generik.** Input teks untuk scalar; nilai structured
   (array/objek) dirender read-only `JSON.stringify`. Kirim selalu string; server decode
   JSON bila encodable. Tanpa asumsi makna key.
3. **#3 — Direct permissions di form user.** Multi-select `permissions[]` dari
   `listPermissions` pada form create & edit (sync penuh saat update, sesuai kontrak).

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` (`client.ts` + `requireData`) untuk 11 op JSON; `api.postForm`/FormData untuk import |
| Types | `api/types.ts` tambahan manual dari `openapi.yaml` (strict, no `any`): `AdminUser`, `AdminRole`, `AdminPermission`, `ImportResult`, `SettingsMap`, … |
| State | slice baru `adminSlice.ts`: users list `{meta}` + cache roles/permissions/settings (fetch sekali per sesi) |
| UI | `components/ui` + primitif `pagination` dari `wfh-reports` |
| Form | Controlled React state lokal (pola modul WFH/change-package); validasi client hanya required + format email; 422 server dirender per field/pesan |
| Icon | `lucide-react` |

**No new dependency** di modul ini.

## Commands

```bash
npm run build            # tsc -b && vite build  (type + bundle gate)
npm run test             # vitest run
npx tsc --noEmit         # type check alone
npx vitest run <file>    # focused test
npm run dev              # vite dev (backend lokal untuk E2E)
```

## Project Structure

```
resources/js/
  api/
    admin.ts                → 11 fungsi domain: listUsers, createUser, getUserById,
                              updateUser, deleteUser, importUsers (FormData file),
                              listRoles, updateRolePermissions, listPermissions,
                              listSettings, updateSetting — via `api`/`requireData`
    admin.test.ts           → query params persis, pemetaan envelope paginated listUsers,
                              payload create/update, FormData file import, map settings
    types.ts                → + AdminUser (UserResource bentuk admin), AdminRole,
                              AdminPermission, ImportResult, SettingsMap, input types
  store/
    adminSlice.ts           → users list state {meta}, cache roles + permissions +
                              settings {status, items} (fetch sekali per sesi)
    adminSlice.test.ts
  pages/admin/
    UsersPage.tsx           → tabel users paginated (nama, nip, email, tim, role,
                              aktif) + pagination; tombol "Buat User" (gate
                              `user.create`), "Import" (gate `user.import`) +
                              panel hasil import; hapus per baris (gate `user.delete`,
                              confirm); klik baris → edit
    UsersPage.test.tsx
    UserFormPage.tsx        → create + edit satu file (mode dari param rute; edit
                              prefill via getUserById): NIP, nama, email, tim
                              (dropdown listTeams), pangkat, jabatan, telepon,
                              role checkbox (4 nama kontrak), password (kosong =
                              default server, hint tersaji), direct permissions
                              multi-select dari cache listPermissions (Resolved #3),
                              toggle is_active (edit saja)
    UserFormPage.test.tsx
    RolesPage.tsx           → grid role (baris) × permission (kolom) checkbox;
                              kolom dari cache listPermissions bila pemegang
                              `permission.manage`, fallback derive distinct dari
                              listRoles (pemegang role.manage saja); tombol "Simpan"
                              per role → updateRolePermissions sync penuh; pesan 422
                              lockout dirender; baris tanpa perubahan tak mengirim
    RolesPage.test.tsx
    SettingsPage.tsx        → daftar setting key + nilai (scalar → input teks;
                              structured → JSON read-only) (Resolved #2); tombol
                              "Simpan" per key → updateSetting; 404 key dirender
    SettingsPage.test.tsx
  routes/index.tsx          → + /admin/users, /admin/users/new, /admin/users/:userId/edit,
                              /admin/roles, /admin/settings (AppShell protected)
  lib/nav-registry.ts       → + entri {id:"roles", label:"Peran & Permission",
                              path:"/admin/roles", requiredPermission:"role.manage"};
                              entri `users` & `settings` SUDAH ADA (tidak disentuh)
```

Nav order: `roles` diletakkan sebelum `settings` (mengelompokkan admin). Entri lain di
registry tidak disentuh.

## Code Style

Konvensi Phase 1 + modul WFH/change-package lanjutan: `api.*` resolve `Unwrapped<T>`;
`requireData` untuk endpoint berkontrak `data`; pesan UI bahasa Indonesia; gate UI =
`can(user, …)` nama persis seeder + data resource — **bukan** nama role.

```ts
// api/admin.ts — list: envelope paginated dipetakan → {users, meta} (pola a78e547).
export async function listUsers(
  query: ListUsersQuery = {},
): Promise<{ users: AdminUser[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;

  const res = await api.get<AdminUser[]>("/admin/users", Object.keys(params).length > 0 ? { params } : {});
  const meta = res.meta;
  return {
    users: res.data ?? [],
    meta: { current_page: meta?.current_page ?? 1, last_page: meta?.last_page ?? 1, per_page: meta?.per_page, total: meta?.total ?? 0 },
  };
}

/** PUT /admin/roles/{id}/permissions — sync penuh; 422 lockout dirender apa adanya. */
export async function updateRolePermissions(roleId: number, permissions: string[]): Promise<AdminRole> {
  const res = await api.put<AdminRole>(`/admin/roles/${roleId}/permissions`, { permissions });
  return requireData(res.data, "updateRolePermissions");
}

/** POST /admin/users/import — multipart file; hasil {imported, skipped, errors[]}. */
export async function importUsers(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.postForm<ImportResult>("/admin/users/import", form);
  return requireData(res.data, "importUsers");
}

/** PUT /admin/settings/{key} — value selalu string; server decode JSON bila encodable. */
export async function updateSetting(key: string, value: string): Promise<{ key: string; value: unknown }> {
  const res = await api.put<{ key: string; value: unknown }>(`/admin/settings/${encodeURIComponent(key)}`, { value });
  return requireData(res.data, "updateSetting");
}
```

- **`per_page` default 15 tidak dikirim**; pagination mempertahankan state halaman.
- **`encodeURIComponent(key)`** pada path setting — key berisi underscore aman, praktik
  konsisten untuk karakter tak terduga.
- **`permissions[]` edit = sync penuh**: form memuat multi-select terisi dari
  `user.permissions` (gabungan role+direct, bentuk UserResource) — UI menandai terpilih
  dari daftar *direct* yang sama sumbernya;.user kosongkan semua → kirim `[]` (replace
  jadi kosong), bukan omit. Admin sadar direct akan tertimpa.
- **Grid roles**: hanya role yang berubah yang dikirim; tombol per-baris, bukan satu tombol
  global — sync penuh per role lebih aman dari diff antar-baris.
- **Pesanan server dirender apa pun statusnya** (404 setting, 422 lockout/invalid
  permission) via `getError` pola `pdf-download`/`a602c46` — error tak boleh lenyap saat
  refetch.

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib:
  - `admin.test.ts` — query params `page`/`per_page` hanya bila terisi; pemetaan envelope
    paginated `listUsers`; payload `createUser`/`updateUser` persis skema (nip string,
    `roles[]`, omit `password` bila kosong, `permissions[]` terkirim saat diubah incl.
    `[]`); `importUsers` FormData `file` + pemetaan `{imported, skipped, errors[]}`;
    `updateRolePermissions` body sync penuh; `updateSetting` `{value}` string +
    `encodeURIComponent`; map `listSettings` decode.
  - `adminSlice.test.ts` — reducer + thunk (list pagination mempertahankan filter,
    cache roles/permissions/settings sekali per sesi, invalidasi setelah sync/verify).
  - `UsersPage.test.tsx` — render list + pagination; gate tombol: tanpa `user.create`
    tanpa "Buat User", tanpa `user.import` tanpa "Import", tanpa `user.delete` tanpa
    hapus (permission sintetik, bukan role); panel hasil import tersaji.
  - `UserFormPage.test.tsx` — validasi required (name, nip, email, ≥0 roles; roles wajib
    sesuai skema `required: […, roles]`); dropdown tim dari listTeams; direct permissions
    multi-select dari listPermissions; hint password default; toggle is_active edit-only;
    pesan 422 duplikat email/nip per field.
  - `RolesPage.test.tsx` — grid render role × permission; fallback kolom tanpa
    `permission.manage`; simpan per role; 422 lockout admin tersaji; tidak mengirim
    role yang tak berubah.
  - `SettingsPage.test.tsx` — scalar editable (teks), structured read-only JSON; simpan
    per key; 404 key tersaji.
- Tidak ada test echo/wiring; tiap test mengunci perilaku kontrak.
- E2E manual (real browser, `DemoUsersSeeder`): admin → buat user staf tanpa password
  (login user baru, `must_change_password` tersaji), edit role user, import CSV valid +
  CSV duplikat (skipped/errors tersaji), uncheck permission kritis admin → 422 lockout
  tersaji, ubah `password_default_user` → login user baru pakai password baru; staf →
  ketiga menu admin hilang + 403 tersaji Indonesia bila URL diketik.
  Terdokumentasi di commit message.

## Boundaries

**Always:**
- Samakan path, query, payload, dan bentuk respons dengan `openapi.yaml` +
  `routes/api.php` + FormRequest sebelum menulis kode.
- `listUsers` dipetakan sebagai envelope paginated (bukan paginator raw).
- `can()` dengan nama persis seeder (`user.*`, `role.manage`, `permission.manage`,
  `setting.manage`).
- Sync penuh dikirim eksplisit (`updateRolePermissions`, `updateUser.permissions`) —
  tidak pernah asumsi partial-sync.
- Key setting via `encodeURIComponent`; value dikirim string.
- Pesan server (403/404/422) selalu dirender; error tidak lenyap saat refetch (regresi
  `a602c46`).

**Ask first:**
- Menyentuh `api/client.ts`, `api/wfh-team.ts`, `nav-registry.ts` di lapau menambah entri
  `roles`, `routes/index.tsx` di luar menambah 5 rute `/admin/*`, atau file modul
  tertutup apa pun.
- Menambah dependency baru.
- Mengirim `field_id` pada `listTeams` (modul ini butuh semua tim — null).

**Never:**
- Hardcode nama role untuk gate UI — walaupun seeder saat ini memberi semua permission
  admin hanya ke `admin`; jika admin suatu hari mendelegasikan `user.manage` via halaman
  roles, UI harus mengikuti tanpa perubahan kode.
- Mengganti guard server dengan asumsi UI (mis. menyembunyikan hapus-NIP-sendiri —
  tidak ada guard semacam itu di kontrak; server otoritas).
- Mengirim field state (`must_change_password`, `created_at`, `team` nested, dsb.)
  yang tidak ada di Store/UpdateUserRequest.
- Meng-unwrap response multipart import sebagai yang lain selain
  `{imported, skipped, errors[]}`.
- Memanggil updateSetting untuk key yang tidak ada di hasil listSettings.
- Menyentuh file backend/Laravel; endpoint di luar 12 op kontrak.

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0**, **`npm run build` exit 0**, **`npm run test` hijau**;
   test Phase 1 + empat modul terdahulu **pass unmodified**.
2. **Unconsumed-scan = 0**: 12 `operationId` admin/organization/settings
   (`listUsers`, `createUser`, `getUserById`, `updateUser`, `deleteUser`, `importUsers`,
   `listRoles`, `updateRolePermissions`, `listPermissions`, `listTeams` [pinjaman],
   `listSettings`, `updateSetting`) masing-masing terkonsumsi di `api/admin.ts` atau
   terverifikasi sudah terkonsumsi `api/wfh-team.ts`; modul lain tak tersentuh (hanya
   `types.ts`, `routes/index.tsx`, `nav-registry.ts` + file baru).
3. **Permission-scan**: string permission di file modul ⊆ nama seeder
   (`user.manage/create/update/delete/import`, `role.manage`, `permission.manage`,
   `setting.manage`).
4. **REQuery terkunci test**: non-admin (staf) → ketiga menu admin hilang; grid roles
   tanpa `permission.manage` memakai kolom derived dari listRoles; `updateUser` dengan
   permissions `[]` mengirim array kosong (replace), bukan omit.
5. **E2E manual 4 alur admin terdokumentasi** di commit message (lihat Testing Strategy).

## Risks

| Risiko | Mitigasi |
|---|---|
| `permissions` UserResource = gabungan role+direct; UI tak bisa membedakan direct saat prefill edit | Kontrak tidak mengekspos pemisahan; UI menandai checkbox dari `permissions`, admin sadar sync menimpa direct. Dicatat sebagai catatan terbuka (Open Questions #1) |
| 422 lockout admin membuat admin kehilangan akses | Server mencegah (role terproteksi tak bisakehilangan 3 permission kritis); UI menampilkan pesan 422; UI tidak pernah mengirim payload yang mengosongkan admin tanpa konfirmasi dialog |
| Import file besar/buruk 422 generik | Panel hasil + pesan server dirender; validasi ekstensi client sebelum kirim (`.xlsx,.xls,.csv`) |
| `updateSetting` mengunci diri (mis. salah ubah `password_default_admin`) | Risk API, bukan UI; UI menampilkan konfirmasi untuk key berawalan `password_default_*` |

## Open Questions

1. **Prefill direct permissions**: kontrak `UserResource.permissions` gabungan role+direct
   tanpa penanda. UI prefill dari gabungan (saat ini admin-only — direct jarang dipakai).
   Jika frontend butuh pemisahan presisi, itu perubahan kontrak backend (di luar scope).
   Keputusan bawaan: gabungan, catat di UI hint.
2. Kolom grid roles bisa lebar (±35 permission). Jika layar sempit, kolom digroup per
   prefix (`wfh.*`, `change.*`, …) — keputusan implementasi saat build, bukan kontrak.
