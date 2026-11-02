# SPEC-verification

> Module id: `verification` — dari `CAPABILITY-MAP-frontend.md` (Phase 0, approved 2026-10-31).
> Intent: `docs/intent/frontend-fresh-build.md` · Contract: `postman/specs/openapi.yaml`
> (tag `Verification`, 1 op: `verifyQrToken` = operasi ke-59 dari 59).
> Depends on: — (modul terakhir; leaf tanpa auth, tanpa dependensi data primitif modul lain).

## Objective

Membawa **halaman publik verifikasi dokumen QR** ke SPA: siapa pun yang membuka URL
`/verify/{token}` (mis. dituliskan di bawah QR pada laporan tercetak) melihat status
verifikasi dokumen **tanpa login** — tipe dokumen, nomor, tanggal laporan (bila WFH
Report), status "terverifikasi", dan pesan server.

Success = `verifyQrToken` terkonsumsi dari UI sesuai `openapi.yaml`; 404 (token
tidak ditemukan / tidak valid) dan 429 (throttle 60/menit, `routes/api.php:35`)
terrender sebagai pesan yang jelas; backend tak berubah.

### Kontrak endpoint (openapi:4992-5020 + QrVerificationController.php)

`GET /api/verify/{token}` — `security: []` (publik). Token `^[a-f0-9]{64}$`.

| Skenario server | Status | Body |
|---|---|---|
| WFH Report approved + 2 tanda tangan (controller:20-34) | 200 | `{success, data: {doc_type: "WFH Report", doc_number: "WFH-{id}", report_date, status: "terverifikasi", message}}` |
| Change Initiation approved + initiator_signed + reviewed (controller:36-49) | 200 | sama, **tanpa `report_date`**, `doc_type: "Change Initiation"`, `doc_number` dari DB |
| Format token bukan 64-hex (controller:16-18) | 404 | `{success: false, message: "Token verifikasi tidak valid."}` |
| Token valid-format tapi tak ditemukan/dokumen tak memenuhi syarat (controller:51) | 404 | `{success: false, message: "Token verifikasi tidak ditemukan."}` |
| Lebih dari 60 req/menit per IP (`throttle:60,1`) | 429 | pesan throttle Laravel (English) — dirender apa adanya |

## Resolved Decisions (user, 2026-11-02)

1. **#1 — Path halaman `/verify/{token}`.** Route SPA di luar guard, sejajar
   `/login`/`/forgot-password`; token di param rute, di-`encodeURIComponent` saat
   memanggil API.
2. **#2 — Tanpa form input token manual.** Token hanya dari URL (hasil QR/link).
   Halaman sekecil mungkin: result-card, tanpa input.
3. **#3 — QR mismatch dicatat sebagai risiko** (lihat §Risks): QR tercetak meng-encode
   `config('app.url') + "/api/verify/{token}"` (`QrCodeService.php:37`) — path API,
   bukan path SPA; perbaikan arah QR adalah keputusan backend/deploy, di luar modul ini.

## Scope

**In-scope (1 op):**

| Path | Op | Verb | Response |
|---|---|---|---|
| `/verify/{token}` | `verifyQrToken` | GET | 200 envelope `QrVerificationResponse` `{success, data: {doc_type, doc_number, report_date?, status, message}}`; 404/429 `ErrorResponse` |

**Out of scope:** semua endpoint lain (58 op — modul tertutup atau Phase 1); pembuatan
QR (backend); entri sidebar (halaman publik, bukan fitur sesi login); form input token
manual (Resolved #2); perubahan backend apa pun termasuk arah URL QR (Resolved #3).

**Halaman publik di luar guard** — pola `ForgotPasswordPage`: card centered penuh layar,
tanpa `ProtectedRoute`/`SessionBootstrap`/`AppShell`, tanpa entri `nav-registry.ts`.

## Tech Stack

| Concern | Choice |
|---|---|
| HTTP | `api` + `requireData` (`client.ts`) untuk `verifyQrToken`; tidak butuh `postForm` |
| Types | `api/types.ts` tambahan manual dari `openapi.yaml` (strict, no `any`): `QrVerification` |
| State | Lokal komponen (`useState` + fetch on-mount) — 1 GET publik per kunjungan, bukan domain sesi; **tanpa slice Redux** |
| UI | `components/ui` Card/Button + ikon `lucide-react` (`ShieldCheck`, `Loader2`, `FileCheck2`, `FileWarning`) |
| Form | Tidak ada (Resolved #2) |

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
    verification.ts         → 1 fungsi: verifyQrToken(token) — GET /verify/{token}
                              via `api`/`requireData`, encodeURIComponent(token)
    verification.test.ts    → URL persis, encode, pemetaan envelope, 404 message
    types.ts                → + QrVerification {doc_type: "WFH Report" | "Change Initiation";
                              doc_number: string; report_date?: string | null;
                              status: string; message: string}
  pages/verification/
    VerifyPage.tsx          → halaman publik: on-mount fetch verifyQrToken(token dari
                              useParams()) → card hasil: doc_type, doc_number,
                              report_date (hanya WFH Report), status, message;
                              loading (Loader2), error 404/429 dirender dari ApiError;
                              token bentuk salah dicek klien (^[a-f0-9]{64}$) → pesan
                              sama seperti 404 server, tanpa panggilan API sia-sia
    VerifyPage.test.tsx
  routes/index.tsx          → + 1 route publik { path: "/verify/:token" } di luar
                              guard children (sejajar /forgot-password…
                              /reset-password)
```

Tidak ada file lain yang disentuh. `store/index.ts` TIDAK bertambah (tanpa slice);
`nav-registry.ts` TIDAK disentuh.

## Code Style

Konvensi Phase 1 + modul-modul terdahulu: `api.*` resolve `Unwrapped<T>`;
`requireData` untuk endpoint berkontrak `data`; pesan UI bahasa Indonesia; pesan
server dirender apa pun statusnya.

```ts
// api/verification.ts — endpoint publik (openapi security: []): tanpa auth,
// jalur error-nya 404/429, bukan 403.
export async function verifyQrToken(token: string): Promise<QrVerification> {
  const res = await api.get<QrVerification>(
    `/verify/${encodeURIComponent(token)}`,
  );
  return requireData(res.data, "verifyQrToken");
}
```

```tsx
// pages/verification/VerifyPage.tsx — token salah bentuk dicek klien dulu:
// pesan sama dengan server ("Token verifikasi tidak valid."), tanpa request.
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

// on-mount: fetch sekali; ApiError (404/429) ditangkap → message dirender
// di card, role="alert", TIDAK hilang (tidak ada refetch yang menggeser
// error — regresi a602c46 tidak relevan di sini karena tak ada mutasi,
// tetapi render error tetap wajib).
```

- **Client-side pattern check** bukan gate keamanan — hanya UX (hemat satu request
  untuk token jelas rusak); server tetap satu-satunya otoritas.
- Tanpa `useAppDispatch`/slice: satu fetch publik, state lokal cukup (pola
  pasca-admin: thunks tanpa pemanggil adalah dead-code).

## Testing Strategy

- Vitest + RTL, file `*.test.ts(x)` di samping modul.
- Unit wajib:
  - `verification.test.ts` — URL `/verify/{token}` persis dengan
    `encodeURIComponent`; resolve envelope → `QrVerification` (dengan dan tanpa
    `report_date` — kedua `doc_type`); reject 404 menyebarkan message server
    ("Token verifikasi tidak ditemukan.").
  - `VerifyPage.test.tsx` — render loading lalu hasil (doc_type, doc_number,
    report_date hanya tampil bila ada, status, message); token salah bentuk →
    pesan "Token verifikasi tidak valid." **tanpa** panggilan API (assert dipanggil
    0×); 404 → pesan server tersaji role alert; 429 → pesan throttle tersaji;
    halaman merender TANPA AppShell/Sidebar (publik — fetch tetap jalan tanpa
    token bearer di localStorage).
- Tidak ada test echo/wiring; tiap test mengunci perilaku kontrak.
- E2E manual (real browser, tanpa login):
  1. Ambil `verification_token` WFH report approved dari DB (tinker/seeder) → buka
     `/verify/{token}` → card "WFH Report · WFH-{id} · tanggal · terverifikasi".
  2. Token acak 64-hex → 404 "Token verifikasi tidak ditemukan." tersaji.
  3. Token rusak (`abc`) → pesan "tidak valid" tanpa request jaringan.
  4. Buka URL sambil login sebagai staf — halaman tetap bentuk publik (tanpa
     sidebar/shell).
  Terdokumentasi di commit message.

## Boundaries

**Always:**
- Samakan path (`/verify/{token}`), bentuk respons, dan pesan 404 dengan
  `openapi.yaml` + `QrVerificationController.php` sebelum menulis kode.
- `encodeURIComponent(token)` pada path.
- Pesan server (404/429) dirender apa adunya di card, `role="alert"`.
- Halaman tetap publik: di luar guard, tanpa syarat token bearer.

**Ask first:**
- Menyentuh `routes/index.tsx` di luar menambah 1 route publik, `client.ts`,
  `nav-registry.ts`, `store/index.ts`, atau file modul tertutup.
- Menambah dependency baru (mis. library QR generator di frontend — tidak diminta).

**Never:**
- Meng-gate atau menyembunyikan halaman berdasar login/role — endpoint `security: []`.
- Membuat form input token (Resolved #2), tombol submit, atau navigasi ke halaman ini
  dari sidebar.
- Mengirim header Authorization secara eksplisit atau menuntut sesi.
- Mengubah backend (QrCodeService/QrVerificationController/routes) termasuk arah URL
  QR (Resolved #3).
- Meng-hardcode nilai `doc_type`/`doc_number` sebagai satu-satunya kemungkinan —
  render generik dari field kontrak; server bisa menambah tipe dokumen tanpa
  perubahan UI.

## Acceptance Criteria (re-runnable)

1. **`npx tsc --noEmit` exit 0**, **`npm run build` exit 0**, **`npm run test` hijau**;
   test Phase 1 + lima modul terdahulu **pass unmodified** (0 baris `-` pada diff
   test lama; `store/index.ts` TIDAK berubah).
2. **Unconsumed-scan = 0**: operationId `verifyQrToken` terkonsumsi di
   `api/verification.ts`; `grep -c operationId openapi.yaml` tetap 59 dan seluruhnya
   kini terkonsumsi lintas modul (modul terakhir).
3. **Permission-scan**: file modul tidak memuat string permission seeder (halaman
   publik, tanpa gate) — scan hasil kosong.
4. **Behavior terkunci test**: token salah bentuk → tidak ada panggilan API + pesan
   "tidak valid"; 404 & 429 message server tersaji; `report_date` hanya dirender
   bila ada; halaman publik merender tanpa AppShell.
5. **E2E manual 4 alur publik terdokumentasi** di commit message (lihat Testing
   Strategy).

## Risks

| Risiko | Mitigasi |
|---|---|
| **QR tercetak mengarah ke `/api/verify/{token}` (JSON mentah saat discan)** — `QrCodeService.php:37` men-encode `config('app.url') + /api/verify/…`, dan catch-all `routes/web.php` sengaja menolak `api/` | Di luar rentang frontend: perbaikan = backend redirect atau ubah `generateVerificationUrl` ke path SPA; butuh ketersediaan URL publik di config. Dicatat (Resolved #3) untuk dibawa ke keputusan backend/deploy; modul ini tetap menyediakan `/verify/{token}` |
| Halaman verifikasi bisa jadi oracle enumerasi token | Token 256-bit unguessable + throttle `60,1` server; client pattern-check justru mengurangi trafik sia-sia |
| 429 pesan English ("Too Many Attempts.") menabrak bahasa UI | Konvensi modul: pesan server dirender apa adanya; throttle jarang tersentuh pemegang QR satu dokumen |

## Open Questions

1. Tidak ada yang menghalangi build. Catatan terbuka non-blocking: bila backend suatu
   saat mengubah `generateVerificationUrl` ke path SPA tertentu, nama param rute ini
   siap menampung (`/verify/:token`) tanpa perubahan kontrak UI lainnya.