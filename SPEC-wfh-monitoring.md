# SPEC-wfh-monitoring

> Module id: `wfh-monitoring` — dari `CAPABILITY-MAP-frontend.md` (Phase 0, approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml`
> (tag `WFH Monitoring` 2 ops + 1 op tag `WFH Reports`).
> Depends on: — (mewarisi primitif dari modul tertutup `wfh-reports` dan op pinjaman
> `listTeams` dari `wfh-team-reports`).

## Objective

Membawa domain **Monitoring WFH** ke SPA: satu halaman `/monitoring` (menu "Monitoring
WFH" **sudah ada** di `nav-registry.ts`, gate `wfh.monitoring.view`) yang menyajikan:

1. **Papan monitoring harian** — siapa yang *belum absen* dan yang *belum buat laporan*
   untuk satu tanggal (default hari ini), ter-scope otomatis per peran di server:
   admin → semua user, kepala bidang → satu bidang, kepala tim → tim sendiri.
2. **Daftar semua laporan** (semua pemilik `wfh.monitoring.view`: admin / kepala bidang /
   kepala tim, scope ditentukan server) — tabel paginated laporan WFH personal dengan
   filter status / tim / tanggal.
3. **Ekspor PDF rekap tim** (`exportTeamWfhPdf`) — tombol **per grup tim di Papan
   Harian**, memakai tanggal aktif board + `team.id` yang sudah ada di baris
   `MonitoringUser.team` (bukan panel/checkbox/dropdown terpisah).

Success = 3 `operationId` terkonsumsi dari UI sesuai `openapi.yaml`, backend tak berubah.
Semua permission gate adalah **data kontrak** — frontend hanya menampilkan/menyembunyikan;
tidak pernah mengganti otorisasi server.

Cakupan server per peran (info kontrak, bukan logika UI):

| Peran | `wfh.monitoring.view` | Scope board monitoring | List semua laporan | PDF tim |
|---|---|---|---|---|
| admin | ✓ | semua user (`team_id=null, field_id=null`) | semua (tanpa 422) | ✓ semua bidang |
| kepala bidang | ✓ | satu bidang (`field_id` terisi) | bidangnya (422 bila tanpa bidang) | ✓ tim di bidangnya |
| kepala tim | ✓ | tim sendiri (`team_id` terisi) | timnya | ✓ timnya sendiri (timnya satu bidang dengan dirinya) |
| staf | ✗ (menu tersembunyi) | 403 | 403 | punya `export_pdf` tapi tanpa `monitoring.view` → tak terjangkau dari UI ini |

## Scope

**In-scope endpoints (3 ops):**

| Path | Op | Verb | Response |
|---|---|---|---|
| `/admin/wfh/monitoring` | `getWfhMonitoring` | GET | envelope `{success, data: WfhMonitoringData}` — `WfhMonitoringData = {date, team_id, field_id, not_checked_in: MonitoringUser[], no_report: MonitoringUser[]}`; query `date?` (default hari ini), `team_id?` (harus satu bidang dengan aktor — lintas bidang = 403) |
| `/admin/wfh/reports` | `adminListWfhReports` | GET | **envelope `ApiResponse::paginated`** `WfhReportListResponse` = `{success, data: WfhReport[], meta: PaginationMeta}` (bentuk sama dengan list team-reports — pelajaran `a78e547`); query `per_page?` (default 15, max 100), `status?` (draft/pending/approved/rejected), `team_id?`, `date_from?`+`date_to?` (menang), `date?` (menang atas `month`), `month?` (`YYYY-MM`); **422 "User tidak terhubung dengan bidang manapun."** bila aktor tanpa bidang |
| `/admin/wfh/teams/{team}/pdf` | `exportTeamWfhPdf` | GET | **binary `application/pdf`, non-envelope** — via `httpClient` `responseType:"blob"` (pola `exportWfhReportPdf`); query `date?`, `team_report_id?` (opsional, mengontrol tanda tangan KB di PDF); 403 tim di luar bidang / tanpa `wfh.report.export_pdf`; 422 penandatangan belum atur tanda tangan |

Route middleware ground truth (`routes/api.php` L135-145): `monitoring` & `admin/wfh/reports`
= `permission:wfh.monitoring.view`; PDF tim = `permission:wfh.report.export_pdf`.
Catatan openapi: `exportTeamWfhPdf` ditag `WFH Reports` (bukan `WFH Monitoring`) — tetap
in-scope modul ini sesuai peta kapabilitas.

**Out of scope:** seluruh endpoint personal `wfh-reports` (tetap dipakai via tipe
`WfhReport`), team-report CRUD (`wfh-team-reports`, tertutup), `verification`.

**Dipinjam (lanjutan keputusan 2026-11-01):** `listTeams` (`GET /teams`, tag
`Organization`) dipakai lagi dari `api/wfh-team.ts` untuk dropdown filter `team_id`
di tab "Semua Laporan" — bukan duplikasi baru. Modul `admin` nanti mewarisi.

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` (`client.ts` + `requireData`) untuk 2 op JSON; `httpClient` blob untuk PDF |
| Types | `api/types.ts` tambahan manual dari `openapi.yaml` (strict, no `any`) |
| State | slice baru `wfhMonitoringSlice.ts` (board + list admin) — tidak menumpang `wfhSlice`/`wfhTeamSlice` |
| UI | `components/ui` + primitif `components/wfh/*` yang sudah ada |
| Tanggal | input `<input type="date">`, string `YYYY-MM-DD` diteruskan mentah; default "hari ini" dari `new Date()` lokal — tanpa dependensi baru |

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
    wfh-monitoring.ts       → 3 fungsi domain: getWfhMonitoring, adminListWfhReports,
                              exportTeamWfhPdf (blob) — via `api`/`httpClient`
    wfh-monitoring.test.ts  → query params persis, pemetaan envelope paginated,
                              blob PDF bypass unwrap
    types.ts                → + MonitoringUser, WfhMonitoringData (dgn field_id/team_id
                              nullable), ListAdminReportsQuery
  store/
    wfhMonitoringSlice.ts   → board state {date, team_id, data}, list state
                              {status, teams filter, per_page, meta} + thunks
    wfhMonitoringSlice.test.ts
  pages/wfh/
    MonitoringPage.tsx      → tab "Papan Harian" | "Semua Laporan"; board dikelompokkan
                              per tim + tombol "Unduh PDF" per grup tim (gate export_pdf)
    MonitoringPage.test.tsx
  components/wfh/
    report-row.tsx          → EKSTRAKSI baris laporan dari WfhReportsPage (row + badge +
                              klik-detail) supaya list admin & list personal tak fork;
                              WfhReportsPage diganti memakainya, test lama wajib tetap hijau
  routes/index.tsx          → + /monitoring (AppShell protected); nav entry `monitoring`
                              SUDAH ada di lib/nav-registry.ts (tidak disentuh)
```

Primitif dipakai ulang (konsumen, tidak dipindah): `status-badge` (union
`WfhReportStatus` sama), `pagination` (meta envelope → `PaginationMeta`),
`pdf-download` (`getBlob` callback — komponen tak tahu path).

## Code Style

Konvensi Phase 1 + modul WFH lanjutan: `api.*` resolve `Unwrapped<T>`; `requireData`
untuk endpoint berkontrak `data`; pesan UI bahasa Indonesia; ikon `lucide-react`;
gate UI = `can(user, …)` nama persis seeder — **bukan** nama role.

```ts
// api/wfh-monitoring.ts — board: query opsional, scope ditentukan server.
export async function getWfhMonitoring(
  query: { date?: string; team_id?: number } = {},
): Promise<WfhMonitoringData> {
  const res = await api.get<WfhMonitoringData>("/admin/wfh/monitoring", { params: query });
  return requireData(res.data, "admin/wfh/monitoring");
}

/** GET /admin/wfh/reports — envelope `ApiResponse::paginated` dipetakan → {reports, meta}. */
export async function adminListWfhReports(query: ListAdminReportsQuery = {}): Promise<{
  reports: WfhReport[];
  meta: PaginationMeta;
}> {
  const res = await api.get<WfhReport[]>("/admin/wfh/reports", { params: query });
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

/** GET /admin/wfh/teams/{team}/pdf — binary non-envelope, lewat httpClient langsung. */
export async function exportTeamWfhPdf(
  teamId: number,
  query: { date?: string; team_report_id?: number } = {},
): Promise<Blob> {
  const res = await httpClient.get<Blob>(`/admin/wfh/teams/${teamId}/pdf`, {
    params: query,
    responseType: "blob",
  });
  return res.data;
}
```

- **Filter list bersifat lokal** sampai "Terapkan" (pola `WfhReportsPage`); `per_page`
  default 15 **tidak dikirim**; `date_from`/`date_to` dipasangkan — jika salah satu
  kosong keduanya tidak dikirim (biarkan presedensi backend jalan).
- **PDF tim = aksi per grup tim di Papan Harian** (bukan panel/checkbox/dropdown): board
  dikelompokkan per `MonitoringUser.team`; tiap grup menampilkan tombol "Unduh PDF" hanya
  bila user ber-`wfh.report.export_pdf` DAN `team.id` ada. Tanggal memakai tanggal aktif
  board; `team_report_id` tidak diisi otomatis (lihat Assumption #4).
- **Pesan error harus sampai pengguna** (pelajaran `a602c46`): 403 lintas bidang,
  403 tanpa `monitoring.view`, 422 "User tidak terhubung dengan bidang manapun." dan
  422 "…belum mengatur tanda tangan…" dirender dari state halaman + regresi-testid
  agar tak lenyap saat refetch pasca-aksi.

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib:
  - `wfh-monitoring.test.ts` — query params `date`/`team_id` hanya bila terisi;
    pemetaan envelope `{success, data[], meta}` → `{reports, meta}` (pelajaran
    `a78e547` — bentuk list admin TERDETEKSI ENVELOPE dari awal, bukan paginator raw);
    blob PDF bypass unwrap; `team_report_id` opsional diteruskan.
  - `wfhMonitoringSlice.test.ts` — reducer + thunk (board per tanggal, list per filter,
    pagination mempertahankan filter aktif).
  - `MonitoringPage.test.tsx` — tab render (semua pemilik `monitoring.view` melihat
    "Semua Laporan"); gate `monitoring.view` (staf tak lihat apa pun); gate `export_pdf`
    diuji dengan **user sintetik** pemegang `monitoring.view` TANPA `wfh.report.export_pdf`
    (bukan role seeder — ketiganya punya keduanya) → tombol PDF per grup tersembunyi;
    board dikelompokkan per tim + scope tercermin (`team_id`/`field_id` respons →
    konteks "Tim saya"/"Bidang", user tanpa `team.id` tak memunculkan tombol PDF);
    **regresi visibilitas pesan error pasca-refetch**.
  - `report-row.tsx` ekstraksi = test lama `WfhReportsPage` **pass unmodified**.
- Tidak ada test echo/wiring; tiap test mengunci perilaku kontrak.
- E2E manual (real browser, `DemoUsersSeeder`): kepala tim → board tim sendiri + PDF
  timnya berhasil (punya `export_pdf`); kepala bidang → board bidang + list semua laporan
  + PDF per tim bidangnya berhasil, 403 tersaji Indonesia bila memfilter `team_id` lintas
  bidang di tab "Semua Laporan"; admin → scope semua; staf → menu hilang + 403.
  Terdokumentasi di commit message.

## Boundaries

**Always:**
- Samakan path, query, dan bentuk respons dengan `openapi.yaml` + `routes/api.php`
  sebelum menulis kode.
- PDF via `httpClient` blob (bypass unwrap); 2 op JSON via `api` + envelope.
- `can()` dengan nama persis seeder (`wfh.monitoring.view`, `wfh.report.export_pdf`).
- Label status via `WFH_STATUS_LABELS` satu sumber; format tanggal via `Intl`.

**Ask first:**
- Menyentuh `api/client.ts`, `nav-registry.ts`, `routes/index.tsx` di luar menambah
  `/monitoring`, atau file modul tertutup di luar ekstraksi `report-row.tsx` yang
  sudah disetujui di spec ini.
- Menambah dependency baru.

**Never:**
- Hardcode nama role untuk gate UI; mengganti validasi scope server (lintas bidang 403)
  dengan asumsi UI — contoh: JANGAN sembunyikan opsi tim lain tanpa data `listTeams`.
- Mengirim `field_id` atau scope apa pun dari client — scope murni keputusan server.
- Meng-unwrap blob PDF sebagai JSON atau menjalankan PDF lewat interceptor `api`.
- Menyentuh file backend/Laravel; endpoint di luar 3 op + `listTeams`.

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0**, **`npm run build` exit 0**, **`npm run test` hijau**;
   test Phase 1 + `wfh-reports` + `wfh-team-reports` **pass unmodified**.
2. **Unconsumed-scan = 0**: `getWfhMonitoring`, `adminListWfhReports`, `exportTeamWfhPdf`
   masing-masing terkonsumsi fungsi di `api/wfh-monitoring.ts`; `listTeams` dipakai ulang
   (impor, bukan duplikasi); modul lain tak tersentuh kecuali ekstraksi `report-row.tsx`.
3. **Permission-scan** `grep -o "'wfh\.[a-z_.]*'"` tambahan modul ini ⊆
   {`wfh.monitoring.view`, `wfh.report.export_pdf`} seeder.
4. **Presedensi filter** terkunci test: `date_from`/`date_to` dikirim berpasangan saja;
   `date` diteruskan bila ada; `month` hanya bila `date` kosong.
5. **E2E manual 3 peran** di browser sesuai daftar di atas, terdokumentasi di commit.

## Risks

| Risiko | Mitigasi |
|---|---|
| Salah baca bentuk list admin ( paginator raw vs envelope) — bug `a78e547` di modul sebelumnya | Test pemetaan envelope→`meta` sejak awal; kontrak openapi sudah jelas `WfhReportListResponse` envelope |
| 422 "User tidak terhubung dengan bidang manapun." untuk aktor tanpa bidang | Pesan server dirender apa adunya + regresi test visibilitas |
| PDF tim: 422 penandatangan belum set tanda tangan terasa seperti bug | Pesan server menyarankan tindakan ("Atur tanda tangan…"); dirender di dekat tombol |
| Ekstraksi `report-row.tsx` menyentuh modul tertutup `wfh-reports` | Murni refactor; semua test lama wajib hijau tanpa modifikasi; scope perubahan ≤ 2 file |
| Board default "hari ini" beda zona waktu server vs browser | Frontend hanya default tampilan; server tetap menerima `date` eksplisit — tampilkan tanggal efektif dari respons |

## Assumptions (minta koreksi bila salah)

1. **Satu halaman `/monitoring`** dengan dua tab (Papan Harian / Semua Laporan). Ekspor
   PDF bukan permukaan ketiga: ia aksi per grup tim di Papan Harian (Resolved #3).
2. Dropdown tim (filter tab "Semua Laporan") memakai **pinjaman `listTeams`** dari
   `api/wfh-team.ts` (tanpa filter `field_id` — client tidak tahu bidang aktor; server
   memvalidasi 403).
3. **Ekstraksi `report-row.tsx`** dari `WfhReportsPage` disetujui (menyentuh modul
   tertutup, test lama tak boleh berubah).
4. `team_report_id` pada PDF tim **tidak diisi otomatis** dari UI pada slice ini —
   parameter opsional dikirim bila konteksnya ada; E2E memverifikasi PDF tanpa flag.

## Resolved Questions (approved 2026-11-01)

1. **Bentuk list admin = envelope** — `WfhReportListResponse` di openapi `required:
   [success, data, meta]`, sejalan koreksi `a78e547` di `wfh-team-reports`. Tidak
   terbuka lagi.
2. **Tab "Semua Laporan"** — tampil untuk **semua pemilik `wfh.monitoring.view`**
   (admin, kepala bidang, kepala tim); scope list tetap keputusan server. Disetujui
   user 2026-11-01.
3. **Penempatan ekspor PDF tim** — **tombol per grup tim di Papan Harian** (bukan blok
   terpisah, dropdown baris, atau checkbox list). Board dikelompokkan per
   `MonitoringUser.team`; tanggal memakai tanggal aktif board; satu klik per tim —
   aksi di titik wawasan kepatuhan, tanpa permukaan ketiga. Disetujui user 2026-11-01
   setelah analisis opsi (dropdown baris: satuan kerja endpoint = tim × tanggal, bukan
   laporan personal; checkbox list: endpoint tak mendukung batching multi-tim).
