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
 * - form create (hanya `can(user, "wfh.team_report.create")`): dropdown tim
 *   via `listTeams` + tanggal → `createWfhTeamReport` `{team_id, report_date}`
 *   (tanpa `status` — server memaksa `pending`). Sukses → refetch daftar;
 *   gagal (mis. 422 duplikat) → pesan server dari `actionError` tampil apa
 *   adanya dan TIDAK tersapu refetch (regresi `a602c46`);
 * - aksi inline per baris `pending`, gate `can()` permission approve/reject:
 *   approve → `approveWfhTeamReport`; reject → dialog alasan wajib (kosong/
 *   whitespace → tombol mati, tidak mengirim) → `rejectWfhTeamReport`
 *   `{reason}`. Pesan 403/422 dari `actionError` selamat dari refetch;
 * - list kosong → pesan bahasa Indonesia; fetch gagal → pesan `list.error`.
 */
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { UsersRound } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/wfh/pagination";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveWfhTeamReport,
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
import { can } from "@/lib/permissions";
import { selectUser } from "@/store/authSlice";
import type { TeamResource, WfhTeamReport } from "@/api/types";

const PER_PAGE_OPTIONS = [10, 15, 25, 50, 100];

export function TeamReportsPage() {
  const dispatch = useAppDispatch();

  const user = useAppSelector(selectUser);
  const { status, error, query } = useAppSelector(selectWfhTeamList);
  const items = useAppSelector(selectWfhTeamListItems);
  const meta = useAppSelector(selectWfhTeamListMeta);
  const actionError = useAppSelector(selectWfhTeamActionError);

  // `perPage` null = pakai default backend 15 (tidak dikirim).
  const [perPage, setPerPage] = useState<number | null>(null);

  // Form create: hanya pemegang `wfh.team_report.create` (permission, bukan role).
  const canCreate = can(user, "wfh.team_report.create");
  const canApprove = can(user, "wfh.team_report.approve");
  const canReject = can(user, "wfh.team_report.reject");
  const [teams, setTeams] = useState<TeamResource[] | null>(null);
  const [teamId, setTeamId] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [creating, setCreating] = useState(false);

  // Approve/reject inline: baris target + dialog alasan (kosong = tombol mati).
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WfhTeamReport | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    // Query redux bisa membawa sisa navigasi sebelumnya (page 2, per_page 25)
    // sementara kontrol lokal halaman reset ke default — reset dulu supaya
    // fetch ulang mount benar-benar query bersih dan refetch mutasi konsisten.
    dispatch(setTeamListQuery({}));
    dispatch(fetchWfhTeamReports({}));
  }, [dispatch]);

  // Dropdown tim dimuat sekali saat form tersedia (listTeams tanpa gate).
  useEffect(() => {
    if (!canCreate) return;
    listTeams()
      .then((rows) => setTeams(rows))
      .catch(() => setTeams([])); // dropdown tetap tampil, pilihan kosong
  }, [canCreate]);

  /** Submit create: `{team_id, report_date}` — tanpa `status` (server yang memaksa). */
  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId || !reportDate || creating) return;
    setCreating(true);
    try {
      // Thunk fulfilled sudah memicu refetch daftar (query aktif).
      await dispatch(
        createWfhTeamReport({ team_id: Number(teamId), report_date: reportDate }),
      ).unwrap();
      setTeamId("");
      setReportDate("");
    } catch {
      // actionError sudah diset reducer — pesan server tampil apa adanya.
    } finally {
      setCreating(false);
    }
  }

  /** Approve baris: mutasi thunk (refetch ditangani slice), gagal → pesan server. */
  async function submitApprove(report: WfhTeamReport) {
    if (mutatingId !== null) return;
    setMutatingId(report.id);
    try {
      await dispatch(approveWfhTeamReport(report.id)).unwrap();
    } catch {
      // actionError diset reducer — pesan server tampil dan selamat dari refetch.
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
      await dispatch(rejectWfhTeamReport({ teamReportId: rejectTarget.id, reason })).unwrap();
      setRejectOpen(false);
      setRejectTarget(null);
    } catch {
      // actionError diset reducer — dialog tetap terbuka, pesan server tampil.
    } finally {
      setRejecting(false);
    }
  }

  const loading = status === "loading";

  /** Halaman tujuan dari pagination — per_page aktif dipertahankan. */
  function fetchPage(page: number) {
    dispatch(
      fetchWfhTeamReports({
        ...(query.per_page !== undefined ? { per_page: query.per_page } : {}),
        page,
      }),
    );
  }

  /** Ganti per halaman → reset ke halaman 1. */
  function applyPerPage(value: string) {
    const n = Number.parseInt(value, 10);
    setPerPage(Number.isFinite(n) ? n : null);
    dispatch(
      fetchWfhTeamReports({
        ...(Number.isFinite(n) ? { per_page: n } : {}),
        page: 1,
      }),
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Laporan Tim</h1>
          <p className="text-sm text-muted-foreground">
            Daftar laporan WFH tingkat tim dan persetujuannya.
          </p>
        </div>
        <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>

      <Card size="sm">
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <Field className="w-36" orientation="vertical">
              <FieldLabel htmlFor="team-reports-perpage">Per halaman</FieldLabel>
              <select
                id="team-reports-perpage"
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
          </form>
        </CardContent>
      </Card>

      {canCreate && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Buat Laporan Tim</CardTitle>
            <CardDescription>
              Laporan dibuat dengan status menunggu persetujuan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-wrap items-end gap-3" onSubmit={submitCreate}>
              <Field className="w-56" orientation="vertical">
                <FieldLabel htmlFor="team-report-team">Tim</FieldLabel>
                <select
                  id="team-report-team"
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  required
                >
                  <option value="">Pilih tim…</option>
                  {(teams ?? []).map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field className="w-44" orientation="vertical">
                <FieldLabel htmlFor="team-report-date">Tanggal laporan</FieldLabel>
                <Input
                  id="team-report-date"
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" disabled={creating}>
                Simpan
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {actionError && !rejectOpen && (
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
                          {r.status === "pending" && (canApprove || canReject) ? (
                            <div className="flex gap-2">
                              {canApprove ? (
                                <Button
                                  size="sm"
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
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination meta={meta} onPageChange={fetchPage} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
              disabled={rejecting || rejectReason.trim() === ""}
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