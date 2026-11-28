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
| Lazy-load `TrendChart` (recharts) on the dashboard landing route | Built chunk `DashboardPage` **330.80 kB raw / 96.53 kB gzip** → **6.5 kB** route chunk; recharts isolated in a 324.72 kB `TrendChart` chunk. After review #26 the chunk is mounted only when `data.trend` exists (previously it was requested on every mount) with a fixed-height skeleton during load | kept | `npm run typecheck` clean, `DashboardPage.test.tsx` 19/19 green (including a lazy-boundary test). Full suite had unrelated timeouts in `ChangePackageFormPage.test.tsx` under load; that file passes 42/42 in isolation. |
| Resize attendance photos at upload + one-shot migration (`AttendancePhotoResize`, both upload paths, `media:resize-attendance`) | 2400×1800 JPEG: **527 kB source / ~16 MB decoded bitmap** per PDF cell → **5–6.1 kB / ~1.08 MB** after resize to 600×450; migration fixture **68,490 → 5,099 bytes** (86% smaller). Encoding cost measured **20–23 ms** per photo once at write time. | kept | Resize is paid once at upload; PDF render stays unchanged. Both write paths use the same format-preserving helper (JPEG→JPEG, PNG→PNG with alpha preserved, WebP→WebP; corrupt files keep original bytes). `TeamReportPdfTest` and the `photo_path` contract are unchanged. After review #26 the legacy migration is scoped to `attendances/`, chunked, isolates pixel-bomb rows, uses honest `--dry-run` wording, and keeps the public disk untouched. Pixel bombs now fail validation with 422 on both upload endpoints instead of a 500. |
| Full-resolution signature trim retained (grid-scan experiment reverted) | The 4-px grid scan looked faster in isolation (273.3 → 20.6 ms median) but missed off-grid ink in **299/300** randomized fixtures and flattened isolated strokes; total `normalize()` wall time barely changed (153.7 → 159.3 ms). Ship review #26 reverted the scan to the original exact full-pixel pass | reverted | A correctness regression is not worth an imperceptible end-to-end win. `ImageSignatureServiceTest` now pins an isolated off-grid dot that fails under the grid scan. |
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
