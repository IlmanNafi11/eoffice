/**
 * TeamReportsPage — daftar + buat + setujui/tolak laporan WFH tim (modul
 * wfh-team-reports).
 *
 * Alur (plan Task 3 + Task 4 + Task 5):
 * - mount → `fetchWfhTeamReports` dengan query bersih (halaman 1);
 * - baris render tim (`TeamNested`), tanggal, pembuat (`creator`), dan
 *   status badge via `WfhStatusBadge` (satu sumber label status);
 * - pagination primitive (`components/wfh/pagination`) → fetch halaman tujuan
 *   dengan `per_page` aktif supaya kombinasi query tidak berubah;
 * - per halaman → fetch ulang dari halaman 1; nilai default (15) tidak dikirim
 *   supaya query tetap ramping;
 * - create (hanya `can(user, "wfh.team_report.create")`): tombol "Buat
 *   laporan" membuka dialog (dropdown tim via `listTeams` + tanggal laporan;
 *   tombol Buat mati sampai keduanya terisi; Batal tanpa mutasi) →
 *   `createWfhTeamReport` `{team_id, report_date}` (tanpa `status` — server
 *   memaksa `pending`). Sukses → dialog tutup + refetch daftar; gagal (mis.
 *   422 duplikat) → dialog tetap terbuka, pesan server dari `actionError`
 *   tampil apa adanya dan TIDAK tersapu refetch (regresi `a602c46`);
 * - aksi inline per baris `pending`, gate `can()` permission approve/reject:
 *   approve → `approveWfhTeamReport`; reject → dialog alasan wajib (kosong/
 *   whitespace → tombol mati, tidak mengirim) → `rejectWfhTeamReport`
 *   `{reason}`. Pesan 403/422 dari `actionError` selamat dari refetch;
 * - list kosong → pesan bahasa Indonesia; fetch gagal → pesan `list.error`.
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ListFilter, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { toUiError } from "@/lib/ui-errors";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pagination } from "@/components/wfh/pagination";
import { PdfDownloadButton } from "@/components/wfh/pdf-download";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveWfhTeamReport,
  clearWfhTeamActionError,
  createWfhTeamReport,
  fetchWfhTeamReports,
  rejectWfhTeamReport,
  setTeamListQuery,
  selectWfhTeamActionError,
  selectWfhTeamList,
  selectWfhTeamListItems,
  selectWfhTeamListMeta,
} from "@/store/wfhTeamSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { listTeams } from "@/api/wfh-team";
import { exportTeamWfhPdf } from "@/api/wfh-monitoring";
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import { WFH_REPORT_STATUSES } from "@/lib/wfh-report-statuses";
import { pdfErrorMessage } from "@/lib/pdf-error-message";
import type { TeamResource, WfhTeamReport, WfhReportStatus } from "@/api/types";

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];

export function TeamReportsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const user = useAppSelector(selectUser);
  const { status, error, query } = useAppSelector(selectWfhTeamList);
  const items = useAppSelector(selectWfhTeamListItems);
  const meta = useAppSelector(selectWfhTeamListMeta);
  const actionError = useAppSelector(selectWfhTeamActionError);

  // `perPage` null = pakai default backend 15 (tidak dikirim).
  const [perPage, setPerPage] = useState<number | null>(null);

  // Filter list: kontrol lokal sampai "Terapkan" (pola MonitoringPage).
  // Dropdown dikontrol agar popover kalender/Select di dalamnya tidak menutup
  // dropdown saat interaksi (portal terpisah dianggap "outside" oleh Radix).
  // Nilai awal diambil dari query redux yang aktif: kembali ke halaman ini
  // menampilkan filter yang benar-benar diterapkan, bukan "Semua status"
  // padahal daftar masih terfilter (ship review: desinkron kontrol vs query).
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState(query.status ?? "");
  const [filterTeamId, setFilterTeamId] = useState(
    query.team_id !== undefined ? String(query.team_id) : "",
  );
  const [dateFrom, setDateFrom] = useState(query.date_from ?? "");
  const [dateTo, setDateTo] = useState(query.date_to ?? "");

  // Dialog create: hanya pemegang `wfh.team_report.create` (permission, bukan role).
  const canCreate = can(user, "wfh.team_report.create");
  const canApprove = can(user, "wfh.team_report.approve");
  const canReject = can(user, "wfh.team_report.reject");
  const [teams, setTeams] = useState<TeamResource[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Approve/reject inline: baris target + dialog alasan (kosong = tombol mati).
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WfhTeamReport | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  useEffect(() => {
    // Query redux yang masih terpasang (filter terapan dari kunjungan
    // sebelumnya) dipertahankan — kontrol lokal membaca query yang sama saat
    // init, jadi membuangnya di sini justru mendesinkronkan kontrol vs daftar
    // (ship review #22 B2). Yang dibuang hanya sisa paginasi: kembali ke
    // halaman ini selalu mulai dari halaman 1.
    dispatch(
      setTeamListQuery({
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.team_id !== undefined ? { team_id: query.team_id } : {}),
        ...(query.date_from !== undefined ? { date_from: query.date_from } : {}),
        ...(query.date_to !== undefined ? { date_to: query.date_to } : {}),
        page: 1,
      }),
    );
    dispatch(
      fetchWfhTeamReports({
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.team_id !== undefined ? { team_id: query.team_id } : {}),
        ...(query.date_from !== undefined ? { date_from: query.date_from } : {}),
        ...(query.date_to !== undefined ? { date_to: query.date_to } : {}),
        page: 1,
      }),
    );
  }, [dispatch]);
  // Sengaja tidak reaktif terhadap `query` (run-once-on-mount): nilai yang
  // dibaca adalah snapshot filter saat mount, bukan efek dari perubahan
  // filter di tengah sesi — exhaustive-deps di sini memang diabaikan.

  // Dropdown tim dimuat sekali: dipakai dialog create DAN filter list, jadi
  // tidak digate `canCreate` (pemegang view-only juga butuh filter tim).
  useEffect(() => {
    listTeams()
      .then((rows) => setTeams(rows))
      .catch(() => setTeams([])); // dropdown tetap tampil, pilihan kosong
  }, []);

  /**
   * Buka dialog → reset pilihan lama. `actionError` disimpan di redux dan
   * HANYA dibersihkan oleh mutasi berikutnya, jadi tanpa `dispatch` ini error
   * 422 dari percobaan sebelumnya muncul kembali di dialog baru (ship#17).
   */
  function openCreate() {
    setTeamId("");
    setReportDate("");
    dispatch(clearWfhTeamActionError());
    setCreateOpen(true);
  }

  /** Submit create: `{team_id, report_date}` — tanpa `status` (server yang memaksa). */
  async function submitCreate() {
    if (!teamId || !reportDate || creating) return;
    setCreating(true);
    try {
      // Thunk fulfilled sudah memicu refetch daftar (query aktif).
      const result = await dispatch(
        createWfhTeamReport({ team_id: Number(teamId), report_date: reportDate }),
      ).unwrap();
      setCreateOpen(false);
      toast.success(result.message);
    } catch (err) {
      // `unwrap()` melempar payload slice (string `messageOf`) — non-string
      // tetap lewat seam. Banner inline di dalam dialog tetap dirender
      // (konvensi a602c46).
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  /** Approve baris: mutasi thunk (refetch ditangani slice), gagal → pesan server. */
  async function submitApprove(report: WfhTeamReport) {
    if (mutatingId !== null) return;
    setMutatingId(report.id);
    try {
      const result = await dispatch(approveWfhTeamReport(report.id)).unwrap();
      toast.success(result.message);
    } catch (err) {
      // `unwrap()` melempar payload slice (string `messageOf`) — non-string
      // tetap lewat seam. Banner inline tetap dirender (konvensi a602c46).
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      setMutatingId(null);
    }
  }

  /** Buka dialog reject — bersihkan alasan lama setiap kali dibuka. */
  function openReject(report: WfhTeamReport) {
    setRejectReason("");
    setRejectTarget(report);
    setRejectOpen(true);
  }

  /** Submit reject dengan alasan wajib — kosong/whitespace tidak dikirim. */
  async function submitReject() {
    if (!rejectTarget || rejecting) return;
    const reason = rejectReason.trim();
    if (reason === "") return;
    setRejecting(true);
    try {
      const result = await dispatch(
        rejectWfhTeamReport({ teamReportId: rejectTarget.id, reason }),
      ).unwrap();
      setRejectOpen(false);
      setRejectTarget(null);
      toast.success(result.message);
    } catch (err) {
      // `unwrap()` melempar payload slice (string `messageOf`) — non-string
      // tetap lewat seam. Dialog tetap terbuka, banner inline tetap dirender.
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      setRejecting(false);
    }
  }

  const loading = status === "loading";

  /** Halaman tujuan dari pagination — filter & per_page aktif dipertahankan. */
  function fetchPage(page: number) {
    dispatch(
      fetchWfhTeamReports({
        ...(query.per_page !== undefined ? { per_page: query.per_page } : {}),
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.team_id !== undefined ? { team_id: query.team_id } : {}),
        ...(query.date_from !== undefined ? { date_from: query.date_from } : {}),
        ...(query.date_to !== undefined ? { date_to: query.date_to } : {}),
        page,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1, filter aktif (slice query) tetap. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    setPerPage(Number.isFinite(n) ? n : null);
    dispatch(
      fetchWfhTeamReports({
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.team_id !== undefined ? { team_id: query.team_id } : {}),
        ...(query.date_from !== undefined ? { date_from: query.date_from } : {}),
        ...(query.date_to !== undefined ? { date_to: query.date_to } : {}),
        ...(Number.isFinite(n) ? { per_page: n } : {}),
        page: 1,
      }),
    );
  }

  /**
   * Terapkan filter dari input lokal → selalu kembali ke halaman 1.
   * Rentang inklusif: from/to boleh diberikan sendiri-sendiri (hari tunggal
   * = from sama dengan to); keduanya kosong = semua laporan.
   */
  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPerPage(null);
    setFilterOpen(false);

    const nextQuery = {
      ...(filterStatus ? { status: filterStatus as WfhReportStatus } : {}),
      ...(filterTeamId ? { team_id: Number(filterTeamId) } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      page: 1,
    };
    // REPLACE, bukan merge (ship #23): kontrol per halaman kembali ke default,
    // jadi `per_page` lama tidak boleh selamat di query redux — kalau tidak
    // pagination mengirim nilai yang berbeda dari yang ditampilkan kontrol
    // (kelas desinkronisasi #22 B2, kini pada `per_page`).
    dispatch(setTeamListQuery(nextQuery));
    dispatch(fetchWfhTeamReports(nextQuery));
  }

  const canExportPdf = can(user, "wfh.report.export_pdf");

  const perPageSelect = (
    <Select value={perPage?.toString() ?? "15"} onValueChange={applyPerPage}>
      <SelectTrigger
        aria-label="Per halaman"
        size="sm"
        className="w-25 text-muted-foreground"
        data-testid="team-reports-perpage-trigger"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PER_PAGE_OPTIONS.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const filterMenu = (
    <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Filter laporan"
          data-testid="team-reports-filter-trigger"
        >
          <ListFilter aria-hidden="true" />
          Filter
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 p-2.5"
        onInteractOutside={(event) => {
          // Kalender DateInput & opsi Select me-render portal terpisah, jadi
          // klik di sana dianggap "outside" oleh Radix — biarkan dropdown tetap
          // terbuka agar pemilihan filter tidak terputus.
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-slot="popover-content"], [data-slot="select-content"]')) {
            event.preventDefault();
          }
        }}
      >
        <form className="flex flex-col gap-3" onSubmit={applyFilter}>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-reports-filter-status">Status</FieldLabel>
            <Select
              value={filterStatus === "" ? undefined : filterStatus}
              onValueChange={(v) => setFilterStatus(v ?? "")}
            >
              <SelectTrigger
                id="team-reports-filter-status"
                aria-label="Status"
                className="w-full"
              >
                <SelectValue placeholder="Semua status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua status</SelectItem>
                {WFH_REPORT_STATUSES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-reports-filter-team">Tim</FieldLabel>
            <Select
              value={filterTeamId === "" ? undefined : filterTeamId}
              onValueChange={(v) => setFilterTeamId(v ?? "")}
            >
              <SelectTrigger
                id="team-reports-filter-team"
                aria-label="Tim"
                className="w-full"
              >
                <SelectValue placeholder="Semua tim" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Semua tim</SelectItem>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-reports-filter-date-from">Dari tanggal</FieldLabel>
            <DateInput
              id="team-reports-filter-date-from"
              value={dateFrom}
              onChange={setDateFrom}
            />
          </Field>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-reports-filter-date-to">Sampai tanggal</FieldLabel>
            <DateInput
              id="team-reports-filter-date-to"
              value={dateTo}
              onChange={setDateTo}
            />
          </Field>
          <Button type="submit" className="mt-1 w-full">
            Terapkan
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Laporan Tim</h1>
          <p className="text-sm text-muted-foreground">
            Daftar laporan WFH tingkat tim dan persetujuannya.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={openCreate}>
            <UsersRound aria-hidden="true" className="size-4" />
            Buat laporan
          </Button>
        ) : (
          <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
        )}
      </div>

      {actionError && !rejectOpen && !createOpen && (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="team-action-error"
        >
          {actionError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Daftar Laporan Tim</CardTitle>
          <CardDescription>Total {meta?.total ?? 0} laporan</CardDescription>
          <CardAction>{filterMenu}</CardAction>
        </CardHeader>
        <CardContent>
          {loading && items.length === 0 ? (
            <div className="space-y-2" data-testid="team-reports-loading">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <p>Belum ada laporan tim untuk filter ini.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Tim</th>
                      <th className="py-2 pr-4 font-medium">Tanggal</th>
                      <th className="py-2 pr-4 font-medium">Pembuat</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr
                        key={r.id}
                        data-testid={`team-report-row-${r.id}`}
                        className="border-b border-border/60"
                      >
                        <td className="py-2 pr-4 font-medium">{r.team?.name ?? "-"}</td>
                        <td className="py-2 pr-4">{r.report_date}</td>
                        <td className="py-2 pr-4">{r.creator?.name ?? "-"}</td>
                        <td className="py-2">
                          <WfhStatusBadge status={r.status} />
                        </td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/team-reports/${r.id}`)}
                            >
                              Detail
                            </Button>
                            {canExportPdf ? (
                              <PdfDownloadButton
                                getBlob={() =>
                                  exportTeamWfhPdf(r.team_id, {
                                    date: r.report_date,
                                    team_report_id: r.id,
                                  })
                                }
                                filename={`WFH-Team-${r.team_id}-${r.report_date}.pdf`}
                                getError={pdfErrorMessage}
                                onError={(e) => toast.error(pdfErrorMessage(e))}
                              >
                                Unduh PDF
                              </PdfDownloadButton>
                            ) : null}
                            {r.status === "pending" && (canApprove || canReject) ? (
                              <>
                                {canApprove ? (
                                  <Button
                                    size="sm"
                                    pending={mutatingId === r.id}
                                    disabled={mutatingId !== null}
                                    onClick={() => void submitApprove(r)}
                                  >
                                    Setujui
                                  </Button>
                                ) : null}
                                {canReject ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    disabled={mutatingId !== null}
                                    onClick={() => openReject(r)}
                                  >
                                    Tolak
                                  </Button>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination meta={meta} onPageChange={fetchPage} rightSlot={perPageSelect} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Laporan Tim</DialogTitle>
            <DialogDescription>
              Laporan dibuat dengan status menunggu persetujuan.
            </DialogDescription>
          </DialogHeader>
          <Field className="w-full" orientation="vertical">
            <FieldLabel htmlFor="team-report-team">Tim</FieldLabel>
            <Select
              value={teamId === "" ? undefined : teamId}
              onValueChange={(v) => setTeamId(v ?? "")}
            >
              <SelectTrigger
                id="team-report-team"
                aria-label="Tim"
                className="w-full"
              >
                <SelectValue placeholder="Pilih tim…" />
              </SelectTrigger>
              <SelectContent>
                {(teams ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="w-full" orientation="vertical">
            <FieldLabel htmlFor="team-report-date">Tanggal laporan</FieldLabel>
            <DateInput
              id="team-report-date"
              value={reportDate}
              onChange={setReportDate}
            />
          </Field>
          {actionError && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="team-action-error"
            >
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              pending={creating}
              disabled={!teamId || reportDate === ""}
              onClick={() => void submitCreate()}
            >
              Buat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak laporan</DialogTitle>
            <DialogDescription>
              Alasan wajib diisi — dikirim bersama keputusan penolakan.
            </DialogDescription>
          </DialogHeader>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-report-reject-reason">Alasan penolakan</FieldLabel>
            <Input
              id="team-report-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
          {actionError && (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="team-reject-error"
            >
              {actionError}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={rejecting}
              onClick={() => setRejectOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              pending={rejecting}
              disabled={rejectReason.trim() === ""}
              onClick={() => void submitReject()}
            >
              Tolak laporan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}