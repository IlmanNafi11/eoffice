# SPEC-change-package

> Module id: `change-package` — dari `CAPABILITY-MAP-frontend.md` (Phase 0, approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml`
> (tag `Change Package`, 12 op).
> Depends on: — (mewarisi primitif dari modul tertutup `wfh-reports`: `status-badge`,
> `pagination`, `pdf-download`). Tidak ada op pinjaman dari modul lain.

## Objective

Membawa domain **Change Management (paket perubahan)** ke SPA: menu "Changes"
(**sudah ada** di `nav-registry.ts` id `changes`, path `/changes`, gate
`change.initiation.view` — dimiliki keempat role) yang menyajikan:

1. **Daftar paket** (`GET /changes`) — tabel paginated + filter `status`;
   scope visibilitas ditentukan server: admin = semua, kepala tim/kepala bidang =
   paket ber-inisiator satu tim dengannya, staf = paketnya sendiri.
2. **Form paket 2-bagian** (initiation + implementation) — create draft, edit draft,
   lalu **submit** (payload lengkap dipersist server saat submit, bukan hanya transisi).
3. **Detail paket** — mesin status `draft → pending → approved|rejected` dengan aksi
   per permission: submit (inisiator, draft), approve/reject (kepala tim, pending,
   bukan paket sendiri), upload lampiran (inisiator, draft), unduh lampiran (semua
   pemilik `view` yang bisa melihat paket), ekspor 2 PDF (pemilik export_pdf).
4. **Referensi `change-types`** (`GET /change-types`, tanpa permission) untuk
   checkbox multi-pilih di form implementation.

Success = 12 `operationId` terkonsumsi dari UI sesuai `openapi.yaml`, backend tak
berubah. Semua gate UI adalah **data kontrak** (`can(user, …)` nama persis seeder +
kondisi ownership/status yang tampak dari resource); server tetap satu-satunya
otoritas — UI hanya menyembunyikan aksi yang pasti 403/422, pesan server selalu
dirender bila tetap terjadi.

### Peta peran × aksi (kontrak seeder + controller, bukan logika UI)

| Aksi | Permission route | Guard tambahan server | admin | kepala bidang | kepala tim | staf |
|---|---|---|---|---|---|---|
| Lihat list/detail | `change.initiation.view` | scope visibilitas repo | semua | satu tim | satu tim | miliknya |
| Create draft | `change.initiation.create` | — | ✓ (tanpa tombol — REQuery #2) | ✗ 403 | ✓ | ✓ |
| Update draft | `change.initiation.update` | inisiator + `draft` | ✓* | ✗ | ✓ | ✓ |
| Delete draft | `change.initiation.delete` | inisiator + `draft` | ✓* | ✓ | ✓ | ✓ |
| Submit | `change.initiation.submit` | inisiator + `draft` | ✓* | ✗ | ✓ | ✓ |
| Approve / Reject | `change.initiation.approve` / `.reject` | `pending` → scope → bukan inisiator (urutan 422→403→403, `ChangePackageDecision`) | ✓ | ✗ | ✓ | ✗ |
| Upload lampiran | `change.implementation.update` | inisiator + `draft`, ≤10 file | ✓ | ✗ 403 (tanpa perm) | ✓ | ✓ |
| Unduh lampiran | `change.initiation.view` | `packageVisibleTo` | ✓ | ✓ | ✓ | ✓ |
| PDF inisiasi | `change.initiation.export_pdf` | status `approved` + 2 tanda tangan terpasang, else 422 | ✓ | ✓ | ✗ 403 | ✗ |
| PDF implementasi | `change.implementation.export_pdf` | impl `completed` + tanda tangan terpasang (evaluator nullable di-skip), else 422 | ✓ | ✓ | ✗ 403 | ✗ |
| Change types | — (tanpa permission) | — | ✓ | ✓ | ✓ | ✓ |

\* admin memegang permission tapi (REQuery #2) tidak diberi tombol create/edit/submit;
dia tetap bisa delete draft milik siapa pun via UI bila pemegangpermission — hanya
inisiator yang lolos guard server, jadi tombol delete pun digate `inisiator == user`.

## Scope

**In-scope endpoints (12 ops):**

| Path | Op | Verb | Response |
|---|---|---|---|
| `/changes` | `listPackages` | GET | **envelope `ApiResponse::paginated`** `ChangePackageListResponse` = `{success, data: ChangePackageResource[], meta: PaginationMeta}` (bentuk sama dgn list monitoring — pelajaran `a78e547`); query `per_page?` (default 15, max 100), `status?` (`draft/pending/approved/rejected`), `field_id?` (filter bidang — TIDAK dipakai UI: aktor non-admin sudah di-scope server, admin tanpa daftar bidang; lihat Boundaries) |
| `/changes` | `createPackage` | POST | 201 envelope `ChangePackageResponse` `{success, message, data}`; body `ChangePackageDraftRequest` — `initiation` wajib `{field_id, description, reason}` + `needed_by_date?`, `implementation` opsional |
| `/changes/{id}` | `showPackage` | GET | envelope `ChangePackageResponse`; 404 vs 403 dipisah server ("Paket perubahan tidak ditemukan." / "Anda tidak memiliki akses ke paket ini.") |
| `/changes/{id}` | `updatePackage` | PUT | envelope `ChangePackageResponse`; guard inisiator + draft |
| `/changes/{id}` | `deletePackage` | DELETE | envelope `SuccessResponse`; guard inisiator + draft (soft-delete paket, lampiran hard-delete) |
| `/changes/{id}/submit` | `submitPackage` | POST | envelope; body `ChangePackageSubmitRequest` — `initiation` {field_id, description, reason, **needed_by_date**} + `implementation` **wajib** {priority, impact, change_type_ids≥1, test_plan, execution_date, release_date, implementation_result} + opsional {evaluator_id, production_impact, required_effort, cost_needed, cost_amount, resources}; server persist semua field lalu transisi `draft→pending` + set `initiator_signed_at` |
| `/changes/{id}/approve` | `approvePackage` | POST | envelope; body `DecidePackageRequest` **tanpa field** (lihat Resolved #4) |
| `/changes/{id}/reject` | `rejectPackage` | POST | envelope; body sama; transisi terminal |
| `/changes/{id}/attachments` | `uploadPackageAttachments` | POST | multipart `files[]` (≤10), 200 `{success, message, data: AttachmentResource[]}` (`{id, url, sort_order}`); guard inisiator + draft |
| `/changes/{id}/pdf/initiation` | `exportInitiationPdf` | GET | **binary `application/pdf`, non-envelope** via `httpClient` blob; 422 "PDF hanya dapat di-generate untuk paket yang sudah disetujui." / 422 "…belum mengatur tanda tangan…" |
| `/changes/{id}/pdf/implementation` | `exportImplementationPdf` | GET | binary, sama pola; 422 "…implementasi yang sudah selesai (diterima)." / 422 tanda tangan |
| `/change-types` | `ListChangeTypes` (op 5023) | GET | envelope `{success, data: ChangeType[]}` `{id, name}` — 8 jenis seed |

Route middleware ground truth: `routes/api.php:157-185` (permission per endpoint
seperti tabel di atas; `change-types` hanya `auth:sanctum` + `password.changed`).

**Out of scope:** endpoint personal `wfh-reports` (tertutup), team-report/monitoring
(tertutup), `admin` & `verification` (modul lain), alur `/changes/initiations/*` +
`/changes/implementations/*` lama (sudah dihapus dari kontrak v6.3.0).

**Dipinjam:** tidak ada. (REQuery #1: pinjaman `listUsers` terbukti mustahil —
`GET /admin/users` digate `permission:user.manage` yang hanya dimiliki admin, sedangkan
pembuat paket adalah kepala tim/staf → pasti 403. Evaluator dibiarkan `null`.)

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` (`client.ts` + `requireData`) untuk 10 op JSON; `httpClient` blob untuk 2 PDF; `api.postForm`/FormData untuk multipart lampiran |
| Types | `api/types.ts` tambahan manual dari `openapi.yaml` (strict, no `any`) |
| State | slice baru `changePackageSlice.ts` (list + detail + change-types) — tidak menumpang slice lain |
| UI | `components/ui` + primitif `components/wfh/*` yang sudah ada (`status-badge`, `pagination`, `pdf-download`) |
| Form | Controlled React state lokal (pola form modul WFH); validasi wajib client hanya required + pasangan tanggal; 422 server dirender per field/pesan |
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
    change-package.ts       → 12 fungsi domain: listPackages, createPackage,
                              showPackage, updatePackage, deletePackage, submitPackage,
                              approvePackage, rejectPackage, uploadPackageAttachments,
                              exportInitiationPdf (blob), exportImplementationPdf (blob),
                              listChangeTypes — via `api`/`httpClient`/FormData
    change-package.test.ts  → query params persis, pemetaan envelope paginated,
                              payload nested initiation/implementation, blob PDF bypass
                              unwrap + decode pesan 422 dari blob error, FormData files[]
    types.ts                → + ChangePackageStatus, ChangeImplementationStatus,
                              ChangePackage (initiation+implementation), Initiation,
                              Implementation, PackageAttachment, ChangeType,
                              PackageDraftInput, PackageSubmitInput, ListPackagesQuery
  store/
    changePackageSlice.ts   → list state {filter status, per_page, meta}, detail state,
                              changeTypes cache {status, items} (fetch sekali per sesi)
    changePackageSlice.test.ts
  pages/changes/
    ChangesPage.tsx         → tabel paginated + filter status (lokal sampai "Terapkan"),
                              tombol "Buat Paket" (gate create & punya tim/bidang — REQuery #2),
                              klik baris → detail; badge status; pagination
    ChangesPage.test.tsx
    ChangePackageFormPage.tsx → create + edit satu file (mode dari param rute): bagian
                              Inisiasi (bidang terkunci dari user.team.field, tanggal
                              dibutuhkan, deskripsi, alasan) + bagian Implementasi
                              (priority normal/emergency, impact Minor/Mayor, checkbox
                              change types dari cache, test plan, tanggal eksekusi ≤
                              tanggal rilis, hasil implementasi, biaya (cost_needed →
                              cost_amount wajib), dampak produksi, effort, resources);
                              tombol "Simpan Draft" + "Submit" (submit = POST submit
                              dengan payload lengkap, bukan PUT lalu submit terpisah)
    ChangePackageFormPage.test.tsx
    ChangePackageDetailPage.tsx → dua kartu (Inisiasi / Implementasi) + lampiran +
                              aksi state-machine yang digate `can()` + ownership/status:
                              Edit (inisiator+draft), Submit (inisiator+draft), Hapus
                              (inisiator+draft, confirm), Setujui/Tolak (approve/reject
                              + pending + bukan inisiator — tanpa dialog alasan),
                              Unggah Lampiran (inisiator+draft, ≤10 file), Unduh tiap
                              lampiran (url rut 'attachments.download' via blob),
                              2 tombol PDF (export_pdf + status cocok)
    ChangePackageDetailPage.test.tsx
  routes/index.tsx          → + /changes (list), /changes/new, /changes/:packageId,
                              /changes/:packageId/edit (AppShell protected); nav entry
                              `changes` SUDAH ada di lib/nav-registry.ts (tidak disentuh)
```

Primitif dipakai ulang (konsumen, tidak dipindah): `WfhStatusBadge` (union
`draft|pending|approved|rejected` identik), `pagination` (meta envelope),
`PdfDownloadButton` (`getBlob` + `getError` untuk pesan 422 tanda tangan).

## Code Style

Konvensi Phase 1 + modul WFH lanjutan: `api.*` resolve `Unwrapped<T>`; `requireData`
untuk endpoint berkontrak `data`; pesan UI bahasa Indonesia; gate UI = `can(user, …)`
nama persis seeder + kondisi data resource — **bukan** nama role.

```ts
// api/change-package.ts — list: envelope paginated dipetakan → {packages, meta}.
export async function listPackages(
  query: ListPackagesQuery = {},
): Promise<{ packages: ChangePackage[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;
  if (query.status) params.status = query.status;

  const res = await api.get<ChangePackage[]>("/changes", Object.keys(params).length > 0 ? { params } : {});
  const meta = res.meta;
  return {
    packages: res.data ?? [],
    meta: { current_page: meta?.current_page ?? 1, last_page: meta?.last_page ?? 1, per_page: meta?.per_page, total: meta?.total ?? 0 },
  };
}

/** POST /changes/{id}/submit — payload lengkap (server persist lalu transisi pending). */
export async function submitPackage(id: number, input: PackageSubmitInput): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>(`/changes/${id}/submit`, input);
  return requireData(res.data, "submitPackage");
}

/** POST …/approve — body kosong (+ REQuery #4: TANPA reason; backend mengabaikannya). */
export async function approvePackage(id: number): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>(`/changes/${id}/approve`, {});
  return requireData(res.data, "approvePackage");
}

/** GET …/pdf/initiation — binary non-envelope lewat httpClient langsung. */
export async function exportInitiationPdf(packageId: number): Promise<Blob> {
  const res = await httpClient.get<Blob>(`/changes/${packageId}/pdf/initiation`, { responseType: "blob" });
  return res.data;
}

/** POST …/attachments — multipart files[] (≤10); axios menyetel boundary otomatis. */
export async function uploadPackageAttachments(packageId: number, files: File[]): Promise<PackageAttachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files[]", file);
  const res = await api.postForm<PackageAttachment[]>(`/changes/${packageId}/attachments`, form);
  return requireData(res.data, "uploadPackageAttachments");
}
```

- **Filter status bersifat lokal** sampai "Terapkan" (pola `WfhReportsPage`);
  `per_page` default 15 **tidak dikirim**.
- **`field_id` create = `user.team.field.id`** (staf/kpt selalu bertim); bila kosong
  (admin) tombol "Buat Paket" tak dirender (REQuery #2). Field select tidak ada —
  tidak ada endpoint daftar bidang di kontrak.
- **Evaluator tidak ada di form** (REQuery #1 — dicatat eksplisit di Resolved).
- **Submit dari form edit terisi penuh**: form mengumpulkan seluruh
  `PackageSubmitInput` lalu POST `/submit` sekali; PUT draft hanya untuk "Simpan Draft".
- **Tombol PDF hanya bila status cocok** (`approved` / impl `completed`) — mencegah
  klik yang pasti 422; pesan 422 yang tetap terjadi (tanda tangan) dirender via
  `getError` + testid regresi (pelajaran `a602c46`: error tak boleh lenyap saat refetch).
- **`cost_amount` string desimal** (`"15000000.00"`) — input angka UI, kirim `String`;
  `cost_needed=false` → `cost_amount` tidak dikirim.
- **Urutan tanggal**: validasi client `release_date ≥ execution_date` (pesan server
  "Tanggal rilis harus setelah atau sama dengan tanggal eksekusi." sebagai cadangan).

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib:
  - `change-package.test.ts` — query params `status`/`page`/`per_page` hanya bila
    terisi; pemetaan envelope `{success, data[], meta}` → `{packages, meta}`;
    payload create/update/submit nested persis skema (termasuk `cost_amount` string,
    `change_type_ids`, omit evaluator); FormData `files[]`; 2 PDF blob bypass unwrap
    + decode pesan 422 dari blob error; `listChangeTypes` envelope.
  - `changePackageSlice.test.ts` — reducer + thunk (list per filter, pagination
    mempertahankan filter aktif, detail setelah aksi, cache change-types sekali).
  - `ChangesPage.test.tsx` — render list + badge + pagination; gate "Buat Paket"
    (`create` punya tim): admin (user.manage tanpa tim/jika tanpa field) tak lihat,
    staf/kpt lihat; gate `view` (tanpa itu tak ada menu — sudah registry).
  - `ChangePackageFormPage.test.tsx` — validasi required initiation (field, deskripsi,
    alasan); submit mengunci `needed_by_date` + 7 field implementation wajib;
    toggle biaya; urutan tanggal; create admin terlarang (redirect/pesan).
  - `ChangePackageDetailPage.test.tsx` — matriks tombol × (permission sintetik ×
    status × ownership): submit/edit/hapus/lampiran hanya inisiator+draft;
    setujui/tolak hanya pemegang approve/reject + pending + bukan inisiator
    (user sintetik inisiator+pemegang approve → tombol tersembunyi, bukan role);
    PDF per status; unduh lampiran via url `attachments.download` blob; **regresi
    visibilitas pesan error pasca-refetch**.
- Tidak ada test echo/wiring; tiap test mengunci perilaku kontrak.
- E2E manual (real browser, `DemoUsersSeeder`): staf → create draft → unggah lampiran
  → submit (422 validasi tersaji bila kurang) → lihat status pending; kepala tim →
  approve paket staf + self-package tanpa tombol setujui (bukan 403) + reject paket
  lain; kepala bidang → view + ekspor PDF inisiasi paket approved (422 tanda tangan
  tersaji bila signer belum atur) + tanpa tombol approve/upload; admin → scope semua,
  tanpa tombol create, PDF implementasi. 403 lintas scope tersaji Indonesia.
  Terdokumentasi di commit message.

## Boundaries

**Always:**
- Samakan path, query, payload, dan bentuk respons dengan `openapi.yaml` +
  `routes/api.php` + `ChangePackageRules` sebelum menulis kode.
- PDF & lampiran via `httpClient`/`api` blob (bypass unwrap); 10 op JSON via envelope.
- `can()` dengan nama persis seeder (`change.initiation.*`, `change.implementation.*`).
- Gate aksi status-dependent dengan status + ownership dari resource (server tetap
  otoritas; UI hanya menyembunyikan yang pasti ditolak).
- Label status via `WFH_STATUS_LABELS` satu sumber; format tanggal via `Intl`.

**Ask first:**
- Menyentuh `api/client.ts`, `nav-registry.ts`, `routes/index.tsx` di luar menambah
  4 rute `/changes*`, atau file modul tertutup apa pun (tidak ada ekstraksi di modul ini).
- Menambah dependency baru.
- Mengirim `field_id` pada list (filter bidang) — tidak ada sumber daftar bidang.

**Never:**
- Hardcode nama role untuk gate UI; mengganti guard server (self-approval 403,
  draft-only 422, scope tim 403) dengan asumsi UI.
- Mengirim field workflow-state (`status`, `reviewer_id`, `*_signed_at`,
  `verification_token`, dll.) — backend `prohibited` (state-tampering rules).
- Mengirim `reason` pada approve/reject — `DecideChangePackageRequest` tanpa rules;
  backend mengabaikannya (REQuery #4).
- Mengirim `evaluator_id` dari form — REQuery #1 (biarkan null, catatan terbuka).
- Meng-unwrap blob PDF/lampiran sebagai JSON atau menjalankannya lewat interceptor `api`.
- Menyentuh file backend/Laravel; endpoint di luar 12 op kontrak.

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0**, **`npm run build` exit 0**, **`npm run test` hijau**;
   test Phase 1 + tiga modul WFH **pass unmodified**.
2. **Unconsumed-scan = 0**: 12 `operationId`/endpoint tag `Change Package` masing-masing
   terkonsumsi fungsi di `api/change-package.ts` (`listPackages`, `createPackage`,
   `showPackage`, `updatePackage`, `deletePackage`, `submitPackage`, `approvePackage`,
   `rejectPackage`, `uploadPackageAttachments`, `exportInitiationPdf`,
   `exportImplementationPdf`, `listChangeTypes`); modul lain tak tersentuh (hanya
   `types.ts`, `routes/index.tsx` + file baru).
3. **Permission-scan** string `change\.[a-z_.]+` di file modul ⊆ nama seeder
   (`change.initiation.view/create/update/delete/submit/approve/reject/export_pdf`,
   `change.implementation.update/export_pdf`).
4. **REQuery terkunci test**: admin tanpa tim → tanpa tombol "Buat Paket"; form tanpa
   input evaluator; approve/reject tanpa dialog alasan; `field_id` create bersumber
   `user.team.field.id`.
5. **E2E manual 4 peran** di browser sesuai daftar di atas, terdokumentasi di commit.

## Risks

| Risiko | Mitigasi |
|---|---|
| Payload submit 2-bagian besar; 422 validasi (7 field wajib + evaluator same-field + tanggal) terasa seperti bug | Validasi required sebelum kirim; pesan server dirender per field/pesan global + testid regresi |
| `evaluator_id` pernah dibutuhkan alur kerja nyata (REQuery #1) | Catatan terbuka di Resolved; field sudah ada di tipe + payload builder — menambah picker = 1 perubahan lokal bila endpoint daftar user satu-bidang muncul di kontrak |
| Admin tak punya tim → create gagal 422 `field_id` | Tombol create digate kepemilikan `user.team.field.id`; admin punya jalur view/decide/PDF |
| Kepala bidang punya banyak permission lain tapi bukan approve/upload (tanpa `change.implementation.update`) | Matriks tombol per permission persis seeder, diuji user sintetik, bukan role |
| 422 tanda tangan di PDF (2 signer inisiasi / 3 implementasi, evaluator di-skip) | `getError` memetakan pesan server ("X belum mengatur tanda tangan…") + testid; tombol tetap tampil karena status predikat terpenuhi |
| Lampiran `url` privat (`attachments.download`) ber-bearer — bukan `/storage` statis | Unduh via blob `httpClient`; test memverifikasi URL bearer dipakai, bukan `<a href=storage>` |
| Bentuk list salah baca (paginator raw vs envelope) — bug `a78e547` | `ChangePackageListResponse` required `[success, data, meta]` di kontrak; test pemetaan envelope sejak awal |

## Resolved Questions (approved 2026-11-01)

1. **REQuery #1 — evaluator**: **form TIDAK mengirim `evaluator_id` (biarkan null)**.
   Pinjaman `listUsers` terbukti admin-only (`permission:user.manage`, hanya admin di
   seeder) → 403 pasti untuk kepala tim/staf pembuat paket; + catatan acknowledge
   dari user: keputusan ini kesempatan/utang kecil — bila alur kerja kelak mewajibkan
   evaluator, prasyaratnya adalah **endpoint kontrak baru "daftar user satu bidang"**
   untuk non-admin; saat itu picker ditambahkan di sini tanpa mengubah arsitektur
   (tipe & payload builder sudah menyediakan field).
2. **REQuery #2 — admin create**: admin **tidak** diberi tombol create/edit/submit
   (tanpa tim → tanpa `field_id` sumber; tidak ada endpoint daftar bidang). Admin
   view + decide + delete-inisiator-guard + 2 PDF. Disetujui user 2026-11-01.
3. **REQuery #3 — permukaan**: **list + detail + form terpisah** (pola modul WFH):
   `/changes` tabel, `/changes/new` + `/changes/:id/edit` form, `/changes/:id` detail.
   Disetujui user 2026-11-01.
4. **REQuery #4 — reason approve/reject**: **tanpa dialog alasan**. Ground truth:
   `DecidePackageRequest` openapi menampilkan `reason` opsional, tapi controller
   memakai `DecideChangePackageRequest` yang `rules(): []` dan
   `ChangePackageDecision::decide()` tidak menerima reason dari request — reason
   diabaikan server. UI tidak menyajikan input yang pasti dibuang.
