# Performance audit ledger — branch `optimaze-query` (2026-11-28)

Baseline: host PHP 8.4.28 + vendor, Postgres `kominfo-db` on 127.0.0.1:5433,
`.env` generated locally, Vite manifest copied from the main checkout so the
CSP test can render the app shell. Baseline suite: **971 passed / 1 failed**
(the one failure was the missing Vite manifest, resolved by building assets).

Evidence tier: Verify. Codebase-memory project
`data-home-.herdr-worktrees-eoffice-optimaze-query` (full index, 5,219 nodes /
22,021 edges at 06:14:41Z). `check_index_coverage` on every evidence path:
`no_recorded_issue`, generation matches. Partial parse ranges in three PDF
Blade views and `app.css` were read directly where relevant.

## Attempts

| Idea | Baseline → Result | Verdict | Why |
|---|---|---|---|
| Eager-load `team.leader` in `/api/admin/users` and its sibling UserResource paths | Probe (12 teams): **20 queries, 13** `select users where id=?` lazy loads → **8 queries, 0** lazy loads (one `WHERE IN` instead) | kept | Guard proven RED (11) with the fix reverted, GREEN (0) with it applied. Query count flat as rows grow. |
| Lazy-load `TrendChart` (recharts) on the dashboard landing route | Built chunk `DashboardPage` **330.80 kB raw / 96.53 kB gzip** → **6.5 kB** route chunk; recharts isolated in a 324.72 kB `TrendChart` chunk fetched only when trend data exists | kept | `npm run typecheck` clean, `DashboardPage.test.tsx` 18/18 green. Full suite had 5 unrelated timeouts in `ChangePackageFormPage.test.tsx` under 62-worker load; that file passes 42/42 in isolation. |
| Downscale attendance photos before dompdf | Measured 2400×1800 JPEG: 527 kB source → ~16 MB decoded bitmap per occurrence; downscale to 148×111 = 2.5 kB (208×) in 39 ms | **not applied** | Existing `TeamReportPdfTest` asserts `photo` contains the raw filename; changing the view-data to a data URI would require rewriting those assertions. Needs a separate contract decision. |
| Replace hand-rolled whitespace trim in `ImageSignatureService` with `imagecropauto` | 2000×2000 input: **153.7 ms** per upload | **not applied** | Behavioral crop semantics are covered by existing tests; a different algorithm risks changing signature images. Needs its own spec + visual regression. |
| Add DB indexes | `EXPLAIN` on monitoring anti-join, report list `(user_id, report_date)` and change-list visibility all use existing indexes | **not applied** | Spec requires Ask first for DDL; no plan showed a missing index. |

## Endpoints proven N+1-free (query log, 10 → 30 rows, identical counts)

| Endpoint | queries before/after scale-up |
|---|---|
| `/api/dashboard` | 9 → 9 (all aggregates, no per-day/per-user loop) |
| `/api/admin/wfh/reports` | 5 → 5 (`withCount` + batched `attendances`/`user`/`team`) |
| `/api/admin/wfh/team-reports` | 4 → 4 |
| `/api/changes` | 6 → 6 |
| `/api/admin/wfh/monitoring` | 4 → 4 |
| `/api/wfh/reports` | 1 → 1 |

Scopes checked: all paginated list endpoints (`ApiResponse::paginated` inbound
trace: UserController, ReportController ×2, TeamReportController,
ChangePackageController), the five resources touching relations, dashboard
section builders, seeding/import, middleware, monitoring, and EXPLAIN for the
three hottest query shapes. Not checked: every individual write endpoint's
write-amplification, production RUM/CrUX numbers, and the PDF render paths
under production-scale concurrent load (no representative dataset).
