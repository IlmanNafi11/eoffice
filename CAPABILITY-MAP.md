# Capability Map: API Hardening & Audit Closeout (eoffice)

> Source intent: `docs/intent/api-hardening-closeout.md` (confirmed 2026-10-28).
> Consumer: SPA repo ini (belum diimplementasi) → breaking change pada kontrak
> API diperbolehkan penuh. Tidak ada shim kompatibilitas mundur.

| Module id | Responsibility | Depends on | Status |
|---|---|---|---|
| dead-code | Hapus semua simbol mati terkonfirmasi (A1–A11): interface CRUD tak terpakai, `Roles::` mati, `Setting::flushCache`, `BroadcastServiceProvider`+`channels.php`, relasi inverse, `SpikeController`+views spike, middleware alias mati, `welcome.blade.php` | — | **CLOSED 2026-10-28** (8 tasks, `3506587`…`a2537fa`; scope grew A12–A16: middleware alias, spike/welcome, inverse relations, `config/change-mgmt.php`, env scaffold) |
| error-contract | `Handler::render()` + mapping exception (404 generik tanpa FQCN, 422 seragam, 422/409 transisi invalid, 500 aman); `Authenticate` → 401; SecurityHeaders pada respons error; log trace utuh; `APP_DEBUG=false` di `.env.example`/compose | envelope | — |
| envelope | Helper respon terpusat (`ok`/`created`/`deleted`/`fail`); satu standar `{success, data, message, meta}` di SEMUA endpoint; 204 DELETE; satu bentuk `meta` + clamp `per_page`; binding `int $id` → route-model binding sungguhan | — | **CLOSED 2026-10-29** (6 tasks, `6ba6dd5`…`907d618`; see closure log) |
| authorization-consistency | Self-approval → 403 (+ update `SegregationOfDutiesTest`); urutan guard seragam (existence → access → state); permission bermakna verb: tambah `*.delete` untuk sub-resource, permission untuk `submit`/`revise`/`attachments`, hapus 11 permission seed mati, least-privilege untuk `GET /teams` + `session-config` | envelope | — |
| dedup-state | DRY + SOLID domain: trait `EnsuresSameField`, `decide()` paket, base state machine, scope `visibleTo($actor)` di repo, pindah transisi invalid ke exception domain (H1) | envelope, error-contract, authorization-consistency | — |
| dedup-http | DRY + SOLID HTTP: satu resource user (hapus drift `FormatsUserPayload` vs `UserResource`), resolusi signature/PDF ke service, pecah `ChangePackageController`/`ReportController` gemuk, `verification_token` keluar dari resource | envelope, authorization-consistency | — |
| query-hygiene | N+1 & query: import user preload+batch, `Setting::prime()`, `withCount` untuk list, upsert/batch insert, `user.team.field` eager-load | envelope, dedup-http | — |

**Build order:**

```
dead-code  ─────────────┐
envelope ──→ error-contract ──→ dedup-state ──┐
envelope ──→ authorization-consistency ───────┼──→ dedup-http ──→ query-hygiene
```

Alasan urutan: `dead-code` dan `envelope` tak bergantung siapa pun dan mengubah
permukaan paling banyak → dikerjakan lebih dulu agar modul berikutnya tidak
merapikan kode yang akan hilang. `error-contract` mendahului `dedup-state`
karena mapping `DomainException` menentukan bentuk catch yang tersisa. `dedup-http`
setelah authorization karena pemecahan controller menyentuh guard. `query-hygiene`
terakhir karena menyentuh repo/resource hasil refactor, bukan sebaliknya.

**Catatan skema:** Tidak ada migrasi skema apa pun. Permission baru
(`*.delete`, `wfh.report.submit`, dsb.) adalah data seeder, bukan DDL.

## Closure log

| Date | Module | Findings closed | Evidence |
|---|---|---|---|
| 2026-10-28 | `dead-code` | A1–A16 | 8 commits (`3506587`…`a2537fa`); 347 tests / 998 assertions green, Pint clean |
| 2026-10-29 | `envelope` | T1–T6 + checkpoint | 6 commits (`6ba6dd5`…`907d618`); 423 tests / 1210 assertions green, Pint clean; `response()->json(` = 0 outside `ApiResponse.php`; clamp 1..100, DELETE→204, settings 404 verified. Checkpoint-day fix `cdd8486`: Dockerfile GD lacked JPEG (`imagejpeg` undefined → 17 upload-test failures) — rebuilt with `--with-jpeg --with-freetype` |
