# SPEC-wfh-reports

> Module id: `wfh-reports` — from `CAPABILITY-MAP-frontend.md` (approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml`.
> Depends on: — (pioneers reusable primitives for all downstream frontend modules).

## Objective

Membawa domain **Laporan WFH personal** ke SPA: staf membuat laporan harian dengan
kegiatan (beserta tautan) dan absensi foto per sesi, lalu menjalankan alur status
`draft → pending → approved / rejected → draft (revisi)`, mengambil PDF, dan menyaring
daftar per tanggal/bulan. Success = 17 operation domain WFH Reports + WFH Settings
terkonsumsi dari UI dengan kontrak `openapi.yaml`, backend tak berubah.

Semua permission gate adalah **data kontrak** — backend satu-satunya sumber kebenaran.
Frontend hanya menampilkan/sembunyikan aksi; **tidak pernah** mengganti validasi
otorisasi server.

## Scope

**In-scope endpoints (17 ops, tag `WFH Reports` + `WFH Settings`):**

| Path | Op | Verb | Response data shape |
|---|---|---|---|
| `/wfh/reports` | list | GET | `WfhReportResource[]` + `meta` (lewat `api.get`, `meta` ada di `Unwrapped.meta`); **tanpa** relation `attendances` |
| `/wfh/reports` | create | POST | `WfhReportResource` — multipart (report_date + status draft/submit + optional activities + optional attendances per session) |
| `/wfh/reports/{report}` | get | GET | `WfhReportResource` (dengan `attendances`) |
| `/wfh/reports/{report}` | update | PUT | `WfhReportResource` — **metadata only** `{report_date}` |
| `/wfh/reports/{report}` | delete | DELETE | `SuccessResponse` (tanpa `data`) |
| `/wfh/reports/{report}/submit` | submit | POST | `WfhReportResource` |
| `/wfh/reports/{report}/approve` | approve | POST | `WfhReportResource` |
| `/wfh/reports/{report}/reject` | reject | POST | `WfhReportResource` (`{reason}`) |
| `/wfh/reports/{report}/revise` | revise | POST | `WfhReportResource` |
| `/wfh/reports/{report}/activities` | add | POST | `ReportActivityResponse` (`{id,activity,start_time,end_time,sort_order,links}`; links **tanpa** `sort_order`) |
| `/wfh/reports/{report}/activities/{activity}` | update | PUT | `ReportActivityResponse` (links id-diff) |
| `/wfh/reports/{report}/activities/{activity}` | delete | DELETE | `SuccessResponse` |
| `/wfh/reports/{report}/activities/reorder` | reorder | PATCH | `SuccessResponse` (`{ids}`) |
| `/wfh/reports/{report}/attendances` | add | POST | `AttendanceResponse` — multipart `{session, photo}` |
| `/wfh/reports/{report}/attendances/{attendance}` | delete | DELETE | `SuccessResponse` |
| `/wfh/reports/{report}/pdf` | export | GET | `application/pdf` binary (**non-envelope**, non-SPD) |
| `/wfh/session-config` | config | GET | `{sessions: Session[], allowed_days: number[]}` (no permission gate) |

**Out of scope (belongs to sibling modules):** `wfh-team-reports`, `wfh-monitoring`
(`/admin/wfh/*`), `change-package`, `admin`, `verification`.

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` instance in `api/client.ts` — envelope unwrap + `ApiError` already exist |
| Types | `api/types.ts` manual transcription from `openapi.yaml` schemas (strict, no `any`) |
| State | Redux Toolkit slice per-domain, typed hooks; API module functions remain the wiring |
| UI | `@animate-ui/react` + `motion`, shadcn conventions (`components/ui` reusable) |
| Multipart | `api` needs a PUT/PATCH form path (see Open Questions #1); `postForm` exists |
| Date | `date-fns` is **not** in deps (avoid new dep; see Boundaries). `Intl`/ISO strings only |

**No new dependency** in this module.

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
    wfh.ts               → 17 fungsi domain, semua via `api`, typed
    types.ts             → + WfhReport, WfhReportActivity, WfhReportLink,
                           WfhAttendance, WfhSessionConfig, CreateWfhReportInput,
                           RejectReportRequest, ActivityInput, ActivityUpdateInput,
                           AttendanceUploadInput, ReorderInput, WfhReportStatus
  store/
    wfhSlice.ts          → status fetch per domain + cache report/edit state (typed thunks)
    wfhSlice.test.ts     → reducer + thunk unit test
  components/
    wfh/
      status-badge.tsx   → peta status→label & variant (draft/pending/approved/rejected)
      pagination.tsx     → kontrol halaman (current/last/total) generic
      activities-editor.tsx → tambah/ubah/hapus/reorder kegiatan + tautan
      attendance-upload.tsx  → upload foto per sesi, preview, hapus
      report-form.tsx    → buat/edit laporan (tanggal, kegiatan, absensi)
      pdf-download.tsx   → unduh PDF ber-bearer (fetch → Blob → objectURL)
  pages/wfh/
    WfhReportsPage.tsx   → daftar + filter date/month + paginate → detail
    WfhReportDetailPage.tsx → detail status/kegiatan/absensi + aksi transisi + PDF
  routes/index.tsx       → tambah /wfh, /wfh/:reportId dalam AppShell protected
```

Primitives hidup di `components/wfh/*` di fase ini; saat modul berikutnya memakainya
lagi, naikkan ke `components/ui`/`components/shared` (modul itu yang memindahkan,
bukan modul ini).

## Code Style

Konvensi Phase 1 dipertahankan: `api.*` resolve `Unwrapped<T>`, error via `ApiError.kind`;
komponen menerima data mentah (satu titik unwrap); `requireData` untuk endpoint yang
kontraknya menjamin `data`; Redux typed hooks; pesan UI bahasa Indonesia; ikon `lucide-react`;
komponen `.tsx`, util `.ts`, PascalCase / `useXxx`.

```ts
// api/wfh.ts — daftar (data + meta terpisah), create multipart, PDF non-envelope
export async function listWfhReports(q: ListWfhReportsQuery):
  Promise<{ reports: WfhReport[]; meta: PaginationMeta }> {
  const res = await api.get<WfhReport[]>("/wfh/reports", { params: q });
  // meta di Unwrapped.meta (unwrap otomatis); data null pada envelope tanpa data
  return { reports: res.data ?? [], meta: res.meta as PaginationMeta };
}

export async function exportWfhReportPdf(reportId: number): Promise<Blob> {
  // application/pdf + non-SPD: tidak lewat unwrap (inline type bukan JSON envelope)
  return httpClient.get(`/wfh/reports/${reportId}/pdf`, { responseType: "blob" });
}

// create: multipart dengan kegiatan tersarang + foto per sesi
export async function createWfhReport(input: CreateWfhReportInput):
  Promise<WfhReport> {
  const form = new FormData();
  form.append("report_date", input.report_date);
  if (input.status) form.append("status", input.status);
  for (const a of input.activities ?? []) form.append("activities[]", a);
  for (const [session, photo] of Object.entries(input.attendances ?? {}))
    form.append(`attendances[${session}]`, photo);
  const res = await api.postForm<WfhReport>("/wfh/reports", form);
  return requireData(res.data, "wfh/reports");
}
```

**Status** adalah union literal, bukan `string`: `type WfhReportStatus = "draft" | "pending" |
"approved" | "rejected"`. Peta `status → label` bahasa Indonesia terpusat di
`status-badge.tsx` (dipakai juga monitoring/team-reports nanti).

**Editability** mengikuti kontrak: boleh edit kegiatan/absensi/reorder **hanya** saat
`draft` atau `rejected`; aksi transisi/PDF gate per status dan permission
(`wfh.report.submit/approve/reject/update/delete/activity.delete/attendance.delete/export_pdf`).
Aksi yang tak diizinkan bar-status/permisi disembunyikan (bukan `disabled` yang bisa
dibuka konsol) — validasi backend tetap satu-satunya pengaman.

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib: `wfhSlice` (reducer + thunk), `status-badge` (peta label), filter
  date/month → params, unwrap list (data+meta), form `→ FormData` (kegiatan tersarang
  & foto per sesi), editability gate (aksi tampil/hilang per status).
- **Tidak** ada test untuk echo/wiring sepele; tiap test mengunci perilaku kontrak:
  payload, visibility aksi, mapping respons → state.
- E2E verifikasi manual dengan `DemoUsersSeeder` (role staf memakai `wfh.report.create`;
  kepala tim/bidang memakai approve/reject).
- Existing Phase 1 tests **pass unmodified** (stated criterion) — module ini hanya
  menambah, tidak mengubah `client.ts`/`authSlice`/shell.

## Boundaries

**Always:**
- Samakan path payload & bentuk respons dengan `openapi.yaml` sebelum menulis kode.
- Satu titik unwrap (`api`) + satu definisi `requireData` (tidak duplikasi).
- `meta` dari respons list diambil dari `Unwrapped.meta`, bukan di-reparse.
- PDF & foto preview dipanggil ber-otorisasi (fetch + bearer), jangan `<img src>` telanjang.
- Nama permission dialog dari seeder: `wfh.report.*`, `wfh.attendance.create` — tidak menebak.

**Ask first:**
- Menambah dependency baru (mis. `date-fns`) — default pakai `Intl`/string ISO.
- Mengubah `api/client.ts` (titik tunggal) — modul ini harus konsumen, bukan pengubah.
- Menambah route top-level baru di `routes/index.tsx` melampaui `/wfh` + `/wfh/:id`.

**Never:**
- Hardcode role name (selalu `can()`); ganti validasi otorisasi server dengan gate UI.
- Ubah/envelope respons binary PDF (`responseType: blob`, tidak via unwrap).
- Menyentuh file backend/Laravel; memanggil endpoint di luar kontrak.
- Membangun `attendances` edit dengan cara selain POST/DELETE sub-resource per sesi.
- Menyimpan `attendances`/`activities` tersarang lewat `PUT` (kontrak v6 metadata-only).

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0** dan **`npm run build` exit 0**; `npm run test` hijau.
2. **Unconsumed-scan = 0**: dari 59 `operationId` di `openapi.yaml`, yang dimodul ini
   **terkonsumsi fungsi `api/wfh.ts`** harus berjumlah **17** (wfh-reports) —
   `grep -c "operationId"` sebagai baseline, scan pemetaan path→fungsi di
   `api/wfh.ts` melaporkan 0 gap.
3. **Gateway** `wfh.report.*` + `wfh.attendance.create` yang dipakai di komponen/label
   = subset persis dari seeder (`database/seeders/RolePermissionSeeder.php`); scan
   `grep -o "'wfh[^']*'" | sort -u` → tak ada nama liar.
4. **Existing Phase 1 tests pass unmodified**: `npm run test` sebelum dan sesudah modul
   menambahkan test tanpa menyentuh assertion Phase 1.
5. **E2E manual role staf + kepala tim/bidang** di browser (list → create → submit →
   approve/reject → revisi → PDF) terverifikasi dan terdokumentasi di commit message.

## Risks

| Risiko | Mitigasi |
|---|---|
| Kontrak v6 menyempit (PUT metadata-only, sub-resource row-by-row) mudah salah paham | Tipe & form mengikuti tabel scope; test form→FormData mengunci bentuk payload |
| PDF & foto perlu bearer (bukan `<img>`/anchre) — regresi Phase 1 (0d51f6f6) | Satu helper `pdf-download`/fetch-ber-otorisasi; foto preview via fetch→Blob url |
| Multipart nested (`activities[]`, `attendances[pagi]`) non-standar | Uji `FormData` membuktikan key bentuknya; pakai pod `api.postForm`, tambah jalur PUT/PATCH form bila perlu (Open Question #1) |
| `activity` sub-resource membalikkan `links` tanpa `sort_order` (asymmetric) | Tipe `WfhReportActivityLink` boleh `sort_order?`; test mapping membuktikan |

## Resolved Questions (approved 2026-10-31)

1. **Perluas `api` di `client.ts`: YA.** Helper ditambah `del`, `patch`, `putForm`,
   dan `params` di `get` — satu perubahan titik tunggal, dipakai ulang modul
   frontend berikutnya. Modul ini konsumen, bukan pemanggil `httpClient` untuk
   kasus DELETE/PATCH/query.
2. **PDF via `httpClient` langsung: YA.** Fungsi `exportWfhReportPdf` memakai
   `httpClient` dengan `responseType: "blob"` (di luar helper unwrap); tidak ada
   helper `api.download()` baru.
