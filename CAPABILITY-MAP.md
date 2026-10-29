# Capability Map: API Hardening & Audit Closeout (eoffice)

> Source intent: `docs/intent/api-hardening-closeout.md` (confirmed 2026-10-28).
> Consumer: SPA repo ini (belum diimplementasi) → breaking change pada kontrak
> API diperbolehkan penuh. Tidak ada shim kompatibilitas mundur.

| Module id | Responsibility | Depends on | Status |
|---|---|---|---|
| dead-code | Hapus semua simbol mati terkonfirmasi (A1–A11): interface CRUD tak terpakai, `Roles::` mati, `Setting::flushCache`, `BroadcastServiceProvider`+`channels.php`, relasi inverse, `SpikeController`+views spike, middleware alias mati, `welcome.blade.php` | — | **CLOSED 2026-10-28** (8 tasks, `3506587`…`a2537fa`; scope grew A12–A16: middleware alias, spike/welcome, inverse relations, `config/change-mgmt.php`, env scaffold) |
| error-contract | `Handler::render()` + mapping exception (404 generik tanpa FQCN, 422 seragam, 422/409 transisi invalid, 500 aman); `Authenticate` → 401; SecurityHeaders pada respons error; log trace utuh; `APP_DEBUG=false` di `.env.example`/compose | envelope | **CLOSED 2026-10-29** (10 tasks, `8b75af1`; see closure log) |
| envelope | Helper respon terpusat (`ok`/`created`/`deleted`/`fail`); satu standar `{success, data, message, meta}` di SEMUA endpoint; 204 DELETE; satu bentuk `meta` + clamp `per_page`; binding `int $id` → route-model binding sungguhan | — | **CLOSED 2026-10-29** (6 tasks, `6ba6dd5`…`907d618`; see closure log) |
| authorization-consistency | Self-approval → 403 (+ update `SegregationOfDutiesTest`); urutan guard seragam (existence → access → state); permission bermakna verb: tambah `*.delete` untuk sub-resource, permission untuk `submit`/`revise`/`attachments`, hapus 11 permission seed mati, least-privilege untuk `GET /teams` + `session-config` | envelope | **CLOSED 2026-10-29** (8 tasks, `bf7827e`…`5002f8e`; see closure log) |
| dedup-state | DRY + SOLID domain: trait `EnsuresSameField`, `decide()` paket, base state machine, scope `visibleTo($actor)` di repo, pindah transisi invalid ke exception domain (H1) | envelope, error-contract, authorization-consistency | **CLOSED 2026-10-29** (5 tasks, `68a9ecd`…`c51e29f`; spec §5 was already satisfied by error-contract — receipt-only, no code) |
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
| 2026-10-29 | `error-contract` | T1–T10 | 1 commit `8b75af1`; 457 tests / 1395 assertions green, Pint clean (238 files). `ApiException` + `Handler::render()` mapping (401/403/404/405/422/429/500, generic messages, no FQCN/id leaks); `Authenticate` → 401 JSON; `transitionPackage`/`reorderActivities`/settings-404 → `ApiException` 422/404; user-import split (validation/reader → 422, infra rethrow → 500); SecurityHeaders via `RequestHandled` listener (RED-proven for pre-middleware exceptions); `APP_DEBUG=false` templates; `Route::pattern('id')` → non-numeric `/changes/{id}` 404 |
| 2026-10-29 | `authorization-consistency` | T1–T8 | 8 commits (`bf7827e`…`5002f8e`); 481 tests / 1474 assertions green, Pint clean (host toolchain: PHP 8.4 + vendor present; Docker fallback unused). Self-approval → 403 both verbs w/ canonical guard order (404 precedes 403/422, proven by GuardOrderTest); per-action guard-order audit table (Task 3, no deviation in WFH/admin controllers); 3 new delete perms seeded+assigned to 4 roles, 7 route permission swaps wired (RoutePermissionContractTest, 7 tests); `/teams` scoped to own bidang (admin/`user.manage` see all; `wfh.monitoring.view` explicitly NOT a see-all gate — decision in spec); dead perms `field.manage`/`team.manage` deleted, comm remainder = 4 justified `change.implementation.*`; Task-7 found reject route inherited approve's permission — split (c2ccb80). Spec Q2 clarification committed as `5002f8e` |
| 2026-10-29 | `dedup-state` | T1–T5 | 4 commits (`68a9ecd`…`c51e29f`); 496 tests / 1521 assertions green, Pint clean (host toolchain: PHP 8.4.27 + vendor present). Same-field guard duplicated in 2 controllers → trait `EnsuresSameField` (keeps `?JsonResponse` contract, D2); package visibility duplicated as SQL scope + PHP predicate → one `applyVisibilityScope()` backing `paginatePackages` + new `packageVisibleTo()` (D3; index-vs-show consistency test); approve/reject duplicated ±50 lines → `ChangePackageDecision::decide()` guarding in **shipped** order (pending 422 → access 403 → self 403, D1 — spec's aspirational order overridden by code); twin WFH/team state machines → trait `TransitionsReportState` (`supervisor_id` difference passed as `$extra`, D5). Spec §5 already satisfied (`transitionPackage` throws `ApiException` 422 from error-contract `8b75af1`) — Task 5 was receipt-only. Behavior-frozen: `git diff 68a9ecd^..HEAD -- tests/` = zero removed lines (386 insertions only), no status/message/guard-order change. Spec AC 4 corrected from "1 hit" to 2 (`ChangePackageController::submit` hit is a different domain, out of scope) — plan finding 5. Human review approved 2026-10-29 |
