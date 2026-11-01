# SPEC-wfh-team-reports

> Module id: `wfh-team-reports` — from `CAPABILITY-MAP-frontend.md` (approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml` (tag `WFH Team Reports`).
> Depends on: — (reuses primitives from closed `wfh-reports`: `status-badge`, `pagination`, pola `api`/slice/halaman).

## Objective

Membawa domain **Laporan WFH Tim** ke SPA: satu halaman `/team-reports` yang menampilkan
daftar laporan tim (paginate), pembuatan laporan tim (admin), dan aksi persetujuan +
penolakan ber-alasan (kepala bidang). Success = 4 operation tag `WFH Team Reports`
terkonsumsi dari UI sesuai kontrak `openapi.yaml`, backend tak berubah.

Semua permission gate adalah **data kontrak** — backend satu-satunya sumber kebenaran.
Frontend hanya menampilkan/menyembunyikan aksi; **tidak pernah** mengganti validasi
otorisasi server. Cakupan server per peran (info kontrak, bukan logika UI):

| Peran (seeder) | Permission team-report | Efek di server |
|---|---|---|
| admin | `view`, `create`, `approve`, `reject` | lihat semua; buat; approve/reject (tetap dijaga field-scope — **tanpa break-glass**) |
| kepala bidang | `view`, `approve`, `reject` | lihat semua tim di bidangnya; approve/reject (field-scoped) |
| kepala tim | `view` | lihat laporan timnya sendiri |
| staf | — | tanpa akses (403; menu disembunyikan) |

## Scope

**In-scope endpoints (4 ops, tag `WFH Team Reports`):**

| Path | Op | Verb | Response |
|---|---|---|---|
| `/admin/wfh/team-reports` | list | GET | **Envelope `ApiResponse::paginated`** — `{success, data: WfhTeamReport[], meta: {current_page, last_page, per_page, total}}` (koreksi E2E 2026-11-01: kontroler TIDAK mengirim paginator raw; lihat catatan di bawah); query `per_page` (default 15, max 100) |
| `/admin/wfh/team-reports` | create | POST | envelope `{data: WfhTeamReport}` (201) — JSON `{team_id, report_date}`; server paksa `status=pending`, `created_by`=aktor. 422 duplikat `(team_id + report_date)` → "Laporan untuk tim dan tanggal ini sudah ada." |
| `/admin/wfh/team-reports/{id}/approve` | approve | POST | envelope `{data: WfhTeamReport}` — isi `supervisor_id`/`supervisor_signed_at` + generate `verification_token`. 422 bila bukan `pending` |
| `/admin/wfh/team-reports/{id}/reject` | reject | POST | envelope `{data: WfhTeamReport}` — body `{reason}` wajib; simpan `reject_reason`. 422 bila bukan `pending` |

**Tidak ada** op get/delete/update/submit/revise tim — detail cukup dari baris list;
kegiatan & absensi pribadi tetap milik `wfh-reports`.

**Out of scope (sibling modules):** `/admin/wfh/teams/{team}/pdf` + monitoring
(`wfh-monitoring`), verifikasi token QR (`verification`), dan seluruh endpoint
personal `wfh-reports`. Pengecualian tercatat: `GET /teams` (`listTeams`) **dipinjam
ke modul ini** dengan persetujuan user (lihat Resolved Questions #1).

**Borrowed op (keputusan user, 2026-11-01):** `GET /teams` (`listTeams`, tag
`Organization`, tanpa permission gate, `TeamResource[]` flat `{id, name, leader_id,
field_id}`) dipinjam untuk dropdown `team_id` di form create. Fungsi `listTeams`
di `api/wfh-team.ts`; modul `admin` mewarisi/fork dari sini nanti.

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` instance (`client.ts`) + `requireData` — sudah ada helper `get/post/put/patch/del/postForm/putForm` |
| Types | `api/types.ts` tambahan manual dari `openapi.yaml` (strict, no `any`) |
| State | slice baru `wfhTeamSlice.ts` (RTL thunks) — tidak menumpang `wfhSlice` milik laporan pribadi |
| UI | `@animate-ui/react` + `motion`, komponen `components/ui` dan primitif `components/wfh/*` yang sudah ada |
| Tanggal | tampil apa adunya (string ISO `date`/`date-time`), format via `Intl` — tanpa dependensi baru |

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
    wfh-team.ts          → 5 fungsi domain (list/create/approve/reject + listTeams), semua via `api`
    types.ts             → + WfhTeamReport, TeamNested, ReportUserNested, TeamResource,
                           ListTeamReportsQuery (paginator dipetakan ke PaginationMeta)
    wfh-team.test.ts     → bentuk payload + pemetaan envelope paginated
  store/
    wfhTeamSlice.ts      → list state (page), create/approve/reject thunks
    wfhTeamSlice.test.ts → reducer + thunk unit test
  pages/wfh/
    TeamReportsPage.tsx     → daftar + paginate + buat (admin) + approve/reject inline
    TeamReportsPage.test.tsx
  routes/index.tsx        → + /team-reports (AppShell protected); nav entry
                            `team-report` SUDAH ada di `lib/nav-registry.ts`
```

Primitif yang dipakai ulang (tetap di `components/wfh/`, tidak dipindah — modul ini
konsumen): `status-badge` (enum status sama persis `draft/pending/approved/rejected`),
`pagination` (meta envelope dipetakan → `PaginationMeta`).

## Code Style

Konvensi Phase 1 + modul `wfh-reports` dipertahankan: `api.*` resolve `Unwrapped<T>`,
error via `ApiError.kind`; `requireData` untuk endpoint yang kontraknya menjamin `data`;
pesan UI bahasa Indonesia; ikon `lucide-react`; PascalCase / `useXxx`.

```ts
// api/wfh-team.ts — daftar via envelope `ApiResponse::paginated` (koreksi E2E
// 2026-11-01: backend TIDAK mengirim paginator raw; `unwrap` melepas `success`,
// jadi res.data = array baris, res.meta = paginator).
export async function listWfhTeamReports(query: ListTeamReportsQuery = {}): Promise<{
  reports: WfhTeamReport[];
  meta: PaginationMeta;
}> {
  const res = await api.get<WfhTeamReport[]>("/admin/wfh/team-reports", { params: query });
  const meta = res.meta;
  return {
    reports: res.data ?? [],
    meta: {
      current_page: meta?.current_page ?? 1,
      last_page: meta?.last_page ?? 1,
      per_page: meta?.per_page,
      total: meta?.total ?? 0,
    },
  };
}

/** POST /admin/wfh/team-reports — server memaksa status=pending. */
export async function createWfhTeamReport(input: CreateTeamReportInput): Promise<WfhTeamReport> {
  const res = await api.post<WfhTeamReport>("/admin/wfh/team-reports", input);
  return requireData(res.data, "admin/wfh/team-reports");
}

/** POST …/reject — alasan wajib (kontrak `RejectTeamReportRequest`). */
export async function rejectWfhTeamReport(id: number, reason: string): Promise<WfhTeamReport> {
  const res = await api.post<WfhTeamReport>(`/admin/wfh/team-reports/${id}/reject`, { reason });
  return requireData(res.data, `admin/wfh/team-reports/${id}/reject`);
}
```

**Gate UI = permission, bukan nama role:** tombol aksi & form pakai `can(user, …)`
dengan nama persis dari seeder (`wfh.team_report.view/create/approve/reject`). Aksi yang
tidak diizinkan bar-status/permission disembunyikan (bukan `disabled` yang bisa dibuka
konsol). `approve`/`reject` hanya tampil untuk baris `pending`; `WfhTeamReport.status`
memakai union `WfhReportStatus` yang sudah ada.

**Pesan error harus sampai pengguna:** belajar dari bug `a602c46` di modul
`wfh-reports` — pesan 403/422 (mis. "Laporan tidak berada dalam bidang Anda.") dirender
dari state halaman dan diregresi-testid agar tidak lenyap saat refetch pasca-mutasi.

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib: `wfhTeamSlice` (reducer + thunk), pemetaan paginator-raw → `meta`,
  `create` payload JSON `{team_id, report_date}`, `reject` payload `{reason}`,
  gate aksi per permission × status (`pending` saja untuk approve/reject), label
  `status-badge` untuk status tim.
- **Tidak** ada test echo/wiring sepele; tiap test mengunci perilaku kontrak.
- Regresi khusus: pesan error mutasi tetap tampil setelah refetch daftar.
- Existing tests Phase 1 + modul `wfh-reports` **pass unmodified** — modul ini hanya
  menambah (`client.ts`/`authSlice`/shell tidak berubah).
- E2E verifikasi manual dengan `DemoUsersSeeder`: admin buat → kepala bidang
  approve & reject ber-alasan → kepala tim view-only → staf menu tersembunyi.

## Boundaries

**Always:**
- Samakan path & bentuk respons dengan `openapi.yaml` sebelum menulis kode.
- Semua 5 op lewat envelope: list = `ApiResponse::paginated` (`{success, data[], meta}`,
  `meta` = paginator) dipetakan ke `{reports, meta}`; create/approve/reject +
  `listTeams` = envelope `{data}` lewat `requireData`.
- `can()` dengan nama persis seeder; permission dialog = sub-himpunan
  `RolePermissionSeeder.php`.
- Label status via `WFH_STATUS_LABELS` (satu sumber), bukan peta duplikat.

**Ask first:**
- Menyentuh `api/client.ts`, `nav-registry.ts`, atau menambah route kecuali
  `/team-reports`.
- Memindahkan primitif `components/wfh/*` ke `components/shared` (pemindah = modul
  berikut yang memakainya lagi, sesuai catatan di `status-badge.tsx`).

**Never:**
- Hardcode nama role untuk gate UI; mengganti validasi otorisasi server dengan gate UI.
- Menampilkan tombol approve/reject untuk status selain `pending`.
- Mengirim `status` apa pun di payload create (server memaksa `pending`).
- Menyentuh file backend/Laravel; memanggil endpoint di luar kontrak; dependency baru.

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0**, **`npm run build` exit 0**, **`npm run test` hijau**.
2. **Unconsumed-scan = 0**: 4 `operationId` tag `WFH Team Reports`
   (`listWfhTeamReports`, `createWfhTeamReport`, `approveWfhTeamReport`,
   `rejectWfhTeamReport`) + `listTeams` masing-masing terkonsumsi fungsi di
   `api/wfh-team.ts`; modul lain tidak tersentuh.
3. **Permission-scan** `grep -o "'wfh\.team_report\.[^']*'"` di `resources/js` ⊆
   {`view`, `create`, `approve`, `reject`} seeder — tak ada nama liar.
4. **Existing tests pass unmodified** (Phase 1 + `wfh-reports`).
5. **E2E manual 3 peran** di browser (admin create→duplicate-422; kepala bidang
   approve + reject-ber-alasan; kepala tim view-only; staf menu hilang + 403 tersaji
   berbahasa Indonesia), terdokumentasi di commit message.

## Risks

| Risiko | Mitigasi |
|---|---|
| Bentuk list **salah terdokumentasi** sebagai paginator raw (pertirain: kontroler mengirim envelope `ApiResponse::paginated`) | Test pemetaan envelope→`meta` mengunci bentuknya; E2E 2026-11-01 menemukan + memperbaiki bug ini (`a78e547`) |
| 403 field-scope (approve/reject lintas bidang, tanpa break-glass) mudah terasa "bug aplikasi" | Pesan server dirender apa adunya; regresi test visibilitas pesan pasca-refetch |
| Duplikat `(team_id, report_date)` 422 | Validasi client ringan + tampilkan pesan server "…sudah ada." |
| Dual-gate reject (middleware vs controller — deskripsi 403 openapi masih menyebut `approve` di level route) | Kontrak final = `routes/api.php` (`permission:wfh.team_report.reject`); UI gate pakai `.reject`, konfirmasi ground truth saat implementasi |

## Resolved Questions (approved 2026-11-01)

1. **Dropdown `team_id` form create: PINJAM `listTeams` SEKARANG.** `GET /teams`
   (envelope `TeamResource[]`, query opsional `field_id`, tanpa permission gate)
   dikonsumsi via 1 fungsi + test di `api/wfh-team.ts`. Modul `admin` nanti
   mewarisi/memindahkan — bukan duplikasi baru saat itu.

## Open Questions

1. *(Minor, jawab saat implementasi)* Deskripsi 403 reject di `openapi.yaml` masih
   menyebut route middleware `approve` — versi final `routes/api.php` memakai
   `wfh.team_report.reject` (v5.0.0 memisahkannya). Dianggap pembaruan deskripsi
   openapi tertinggal; tidak mengubah UI (gate `.reject`).
