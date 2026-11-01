/**
 * MonitoringPage — Papan Harian + Semua Laporan + ekspor PDF tim (modul
 * wfh-monitoring, plan Task 5).
 *
 * Alur:
 * - Dua tab (Papan Harian default / Semua Laporan) — semua pemilik
 *   `wfh.monitoring.view` melihat keduanya (gate route/menu di server +
 *   nav-registry; halaman ini tidak mengganti otorisasi server).
 * - Papan Harian: fetch `fetchWfhBoard` dengan tanggal lokal (default "hari
 *   ini"); pindah tanggal → refetch. Tanggal efektif dari respons ditampilkan
 *   (default browser "hari ini" bisa beda zona dengan server). User dikelompokkan
 *   per `MonitoringUser.team`; setiap grup menampilkan dua kolom (Belum Absen /
 *   Belum Laporan); user tanpa `team.id` masuk grup "Tanpa Tim" (tanpa tombol PDF).
 * - Ekspor PDF rekap tim = tombol per grup tim (bukan panel terpisah), gate
 *   `can(user, "wfh.report.export_pdf")` + `team.id` ada; memakai tanggal
 *   aktif board; wrapper `PdfDownloadButton` (`getBlob` callback → blob →
 *   objectURL → anchor → revoke); error unduh dirender dekat tombol.
 * - Semua Laporan: tabel `WfhReportRow` + filter (status / tim via pinjaman
 *   `listTeams` / date_from+date_to / date / month / per_page). Filter lokal
 *   sampai "Terapkan" (reset ke halaman 1). `date_from`/`date_to` hanya
 *   dikirim berpasangan; `date` menang atas `month` (backend precedence —
 *   frontend hanya meneruskan yang terisi); `per_page` default (15) tidak
 *   dikirim. Pagination mempertahankan filter aktif.
 * - Error 403/422 tersaji apa adanya dari state slice (`role="alert"`) dan
 *   TIDAK di-sweep pindah tab / refetch (regresi a602c46).
 *
 * Conventions: pesan UI bahasa Indonesia, typed hooks, iterasi `void` promise,
 * permission gate via `can()` dengan nama persis seeder.
 */
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/wfh/pagination";
import { PdfDownloadButton } from "@/components/wfh/pdf-download";
import { WfhReportRow } from "@/components/wfh/report-row";
import { listTeams } from "@/api/wfh-team";
import { exportTeamWfhPdf } from "@/api/wfh-monitoring";
import type { MonitoringUser, TeamResource } from "@/api/types";
import { can } from "@/lib/permissions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";
import {
  fetchAdminReports,
  fetchWfhBoard,
  selectWfhMonitoringBoard,
  selectWfhMonitoringList,
} from "@/store/wfhMonitoringSlice";

/** Pesan server (ApiError 422/403 dari PDF tim) — fallback pesan generik. */
function pdfErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Gagal mengunduh PDF. Coba lagi.";
}

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];
const WFH_REPORT_STATUSES = ["draft", "pending", "approved", "rejected"] as const;

/** Tanggal lokal hari ini sebagai YYYY-MM-DD (default tampilan papan). */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Grup board: tim dari union kolom, dipertahankan urutan kemunculan. */
interface BoardTeamGroup {
  team: { id: number; name: string } | null;
  notCheckedIn: MonitoringUser[];
  noReport: MonitoringUser[];
}

function groupByTeam(data: {
  not_checked_in: MonitoringUser[];
  no_report: MonitoringUser[];
}): BoardTeamGroup[] {
  const groups: BoardTeamGroup[] = [];
  const byKey = new Map<string, BoardTeamGroup>();

  function push(user: MonitoringUser, column: "notCheckedIn" | "noReport") {
    const key = user.team ? `team-${user.team.id}` : "none";
    let group = byKey.get(key);
    if (!group) {
      group = { team: user.team ?? null, notCheckedIn: [], noReport: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group[column].push(user);
  }

  for (const user of data.not_checked_in) push(user, "notCheckedIn");
  for (const user of data.no_report) push(user, "noReport");
  return groups;
}

/** Teks cakupan papan dari scope server (`team_id`/`field_id` nullable). */
function scopeText(teamId: number | null, fieldId: number | null): string {
  if (teamId !== null) return "Cakupan: Tim saya";
  if (fieldId !== null) return "Cakupan: Bidang saya";
  return "Cakupan: Semua user";
}

type TabId = "board" | "reports";

export function MonitoringPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector(selectUser);
  const board = useAppSelector(selectWfhMonitoringBoard);
  const list = useAppSelector(selectWfhMonitoringList);

  // Tab aktif: papan harian default. List fetch pertama saat tab dibuka.
  const [tab, setTab] = useState<TabId>("board");
  const [listOpened, setListOpened] = useState(false);

  // ── Papan Harian ──────────────────────────────────────────────────
  const canExportPdf = can(user, "wfh.report.export_pdf");
  const groups = useMemo(
    () => (board.data ? groupByTeam(board.data) : []),
    [board.data],
  );

  useEffect(() => {
    dispatch(fetchWfhBoard({ date: todayLocal() }));
  }, [dispatch]);

  function changeBoardDate(value: string) {
    dispatch(fetchWfhBoard(value ? { date: value } : {}));
  }

  // ── Semua Laporan ─────────────────────────────────────────────────
  // Filter lokal sampai "Terapkan" (pola WfhReportsPage).
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [date, setDate] = useState("");
  const [month, setMonth] = useState("");
  const [perPage, setPerPage] = useState<number | null>(null);
  const [teams, setTeams] = useState<TeamResource[] | null>(null);

  function openReportsTab() {
    setTab("reports");
    if (!listOpened) {
      setListOpened(true);
      dispatch(fetchAdminReports({}));
    }
  }

  function openBoardTab() {
    setTab("board");
  }

  useEffect(() => {
    // Dropdown tim dimuat sekali saat tab list dibuka (listTeams pinjaman).
    if (!listOpened || teams) return;
    listTeams()
      .then((rows) => setTeams(rows))
      .catch(() => setTeams([])); // dropdown tetap tampil, pilihan kosong
  }, [listOpened, teams]);

  /** Halaman tujuan dari pagination — filter & per_page aktif dipertahankan. */
  function fetchPage(page: number) {
    dispatch(
      fetchAdminReports({
        ...(list.query.per_page !== undefined ? { per_page: list.query.per_page } : {}),
        ...(list.query.status !== undefined ? { status: list.query.status } : {}),
        ...(list.query.team_id !== undefined ? { team_id: list.query.team_id } : {}),
        ...(list.query.date_from !== undefined ? { date_from: list.query.date_from } : {}),
        ...(list.query.date_to !== undefined ? { date_to: list.query.date_to } : {}),
        ...(list.query.date !== undefined ? { date: list.query.date } : {}),
        ...(list.query.month !== undefined ? { month: list.query.month } : {}),
        page,
      }),
    );
  }

  /**
   * Terapkan filter dari input lokal → selalu kembali ke halaman 1.
   * `date_from`/`date_to` hanya dikirim berpasangan (biarkan presedensi backend
   * jalan); `month` hanya bila `date` kosong.
   */
  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPerPage(null);

    const rangeFrom = dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : {};
    const exactDate = date ? { date } : month ? { month } : {};
    dispatch(
      fetchAdminReports({
        ...(status ? { status: status as "draft" | "pending" | "approved" | "rejected" } : {}),
        ...(teamId ? { team_id: Number(teamId) } : {}),
        ...rangeFrom,
        ...exactDate,
        page: 1,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1, filter aktif (slice query) tetap. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    setPerPage(Number.isFinite(n) ? n : null);
    dispatch(
      fetchAdminReports({
        ...(list.query.status !== undefined ? { status: list.query.status } : {}),
        ...(list.query.team_id !== undefined ? { team_id: list.query.team_id } : {}),
        ...(list.query.date_from !== undefined ? { date_from: list.query.date_from } : {}),
        ...(list.query.date_to !== undefined ? { date_to: list.query.date_to } : {}),
        ...(list.query.date !== undefined ? { date: list.query.date } : {}),
        ...(list.query.month !== undefined ? { month: list.query.month } : {}),
        ...(Number.isFinite(n) ? { per_page: n } : {}),
        page: 1,
      }),
    );
  }

  const loadingList = list.status === "loading";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Monitoring WFH</h1>
          <p className="text-sm text-muted-foreground">
            Papan kepatuhan harian dan daftar laporan WFH menurut cakupan Anda.
          </p>
        </div>
        <Monitor aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>

      {/* Tab sederhana: dua tombol role="tab" — tanpa primitif tabs baru. */}
      <div role="tablist" className="flex gap-2 border-b border-border">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "board"}
          data-testid="monitoring-tab-board"
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "board"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={openBoardTab}
        >
          Papan Harian
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "reports"}
          data-testid="monitoring-tab-reports"
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            tab === "reports"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={openReportsTab}
        >
          Semua Laporan
        </button>
      </div>

      {tab === "board" && (
        <section aria-label="Papan Harian" className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent className="flex flex-wrap items-end gap-3">
              <Field className="w-48" orientation="vertical">
                <FieldLabel htmlFor="monitoring-board-date">Tanggal papan</FieldLabel>
                <Input
                  id="monitoring-board-date"
                  type="date"
                  value={board.query.date ?? ""}
                  onChange={(e) => changeBoardDate(e.target.value)}
                />
              </Field>
              {board.data && (
                <p className="text-sm text-muted-foreground">
                  {scopeText(board.data.team_id, board.data.field_id)} · Tanggal efektif{" "}
                  {board.data.date}
                </p>
              )}
            </CardContent>
          </Card>

          {board.error && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="monitoring-board-error"
            >
              {board.error}
            </p>
          )}

          {board.status === "loading" && !board.data ? (
            <div className="space-y-2" data-testid="monitoring-board-loading">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : board.status === "succeeded" && board.data ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {groups.map((group) => {
                const testId =
                  group.team !== null
                    ? `monitoring-group-team-${group.team.id}`
                    : "monitoring-group-none";
                return (
                  <Card key={testId} data-testid={testId}>
                    <CardHeader>
                      <CardTitle>{group.team?.name ?? "Tanpa Tim"}</CardTitle>
                      {group.team !== null && canExportPdf && (
                        <div data-testid={`monitoring-pdf-team-${group.team.id}`}>
                          <PdfDownloadButton
                            getBlob={() =>
                              exportTeamWfhPdf(group.team!.id, { date: board.data!.date })
                            }
                            filename={`rekap-wfh-tim-${group.team!.id}-${board.data!.date}.pdf`}
                            getError={pdfErrorMessage}
                          >
                            Unduh PDF
                          </PdfDownloadButton>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                            Belum Absen ({group.notCheckedIn.length})
                          </p>
                          {group.notCheckedIn.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Semua sudah absen.</p>
                          ) : (
                            <ul className="space-y-1">
                              {group.notCheckedIn.map((u) => (
                                <li key={u.id} className="text-sm" data-testid={`monitoring-user-${u.id}`}>
                                  {u.name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                            Belum Laporan ({group.noReport.length})
                          </p>
                          {group.noReport.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Semua sudah membuat laporan.</p>
                          ) : (
                            <ul className="space-y-1">
                              {group.noReport.map((u) => (
                                <li key={u.id} className="text-sm" data-testid={`monitoring-user-${u.id}`}>
                                  {u.name}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Memuat papan…</p>
          )}
        </section>
      )}

      {tab === "reports" && (
        <section aria-label="Semua Laporan" className="flex flex-col gap-4">
          <Card size="sm">
            <CardContent>
              <form className="flex flex-wrap items-end gap-3" onSubmit={applyFilter}>
                <Field className="w-40" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-status">Status</FieldLabel>
                  <select
                    id="monitoring-filter-status"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Semua status</option>
                    {WFH_REPORT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="w-48" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-team">Tim</FieldLabel>
                  <select
                    id="monitoring-filter-team"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                  >
                    <option value="">Semua tim</option>
                    {(teams ?? []).map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field className="w-40" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-date-from">Dari tanggal</FieldLabel>
                  <Input
                    id="monitoring-filter-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </Field>
                <Field className="w-40" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-date-to">Sampai tanggal</FieldLabel>
                  <Input
                    id="monitoring-filter-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </Field>
                <Field className="w-40" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-date">Tanggal</FieldLabel>
                  <Input
                    id="monitoring-filter-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Field>
                <Field className="w-40" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-month">Bulan</FieldLabel>
                  <Input
                    id="monitoring-filter-month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </Field>
                <Field className="w-36" orientation="vertical">
                  <FieldLabel htmlFor="monitoring-filter-perpage">Per halaman</FieldLabel>
                  <select
                    id="monitoring-filter-perpage"
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                    value={perPage?.toString() ?? "15"}
                    onChange={(e) => applyPerPage(e.target.value)}
                  >
                    {PER_PAGE_OPTIONS.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit">Terapkan</Button>
              </form>
            </CardContent>
          </Card>

          {list.error && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="monitoring-list-error"
            >
              {list.error}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Daftar Laporan WFH</CardTitle>
              <CardDescription>Total {list.meta?.total ?? 0} laporan</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingList && list.items.length === 0 ? (
                <div className="space-y-2" data-testid="monitoring-list-loading">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : list.items.length === 0 && list.status !== "failed" ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  <p>Belum ada laporan WFH untuk filter ini.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="py-2 pr-4 font-medium">Tanggal</th>
                          <th className="py-2 pr-4 font-medium">Status</th>
                          <th className="py-2 text-right font-medium">Kegiatan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.items.map((r) => (
                          <WfhReportRow
                            key={r.id}
                            report={r}
                            onOpen={(reportId) => navigate(`/wfh/${reportId}`)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4">
                    <Pagination meta={list.meta} onPageChange={fetchPage} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
