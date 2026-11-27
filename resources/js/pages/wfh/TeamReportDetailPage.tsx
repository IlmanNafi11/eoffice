/**
 * TeamReportDetailPage — detail laporan WFH tim + aksi transisi (modul
 * wfh-team-report-detail, Task 7).
 *
 * Kontrak (plan Task 7 + spec):
 * - Data SELALU dari endpoint (`fetchWfhTeamReportDetail` via route param) —
 *   aman deep-link/refresh, tidak membawa state navigasi.
 * - Header: tim, tanggal, badge status, pembuat, supervisor, alasan reject
 *   bila `rejected`.
 * - Kartu per anggota: nama + NIP, badge status laporan personal, absensi per
 *   sesi dengan foto via `fetchAttendanceObjectUrl` (bearer; `<img src>` polos
 *   TIDAK membawa header Authorization — pola `attendance-upload`), kegiatan
 *   (jam, teks, tautan). Anggota tanpa laporan: tanda kosong, bukan crash.
 * - Aksi: `pending` + permission → Setujui/Tolak (dialog alasan wajib); Unduh
 *   PDF gate `wfh.report.export_pdf` memakai `exportTeamWfhPdf` dengan
 *   `team_report_id`; back link ke daftar `/team-reports`.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { toUiError } from "@/lib/ui-errors";
import { ArrowLeft } from "lucide-react";

import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { PdfDownloadButton } from "@/components/wfh/pdf-download";
import { fetchAttendanceObjectUrl } from "@/components/wfh/attendance-upload";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { exportTeamWfhPdf } from "@/api/wfh-monitoring";
import { can } from "@/lib/permissions";
import type { WfhSession, WfhTeamReportMember } from "@/api/types";
import {
  approveWfhTeamReport,
  fetchWfhTeamReportDetail,
  rejectWfhTeamReport,
  selectWfhTeamDetail,
  selectWfhTeamActionError,
} from "@/store/wfhTeamSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";

/** Label sesi absensi — read-only di sini (editor milik `attendance-upload`). */
const SESSION_LABEL: Record<WfhSession, string> = {
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
};

/** Foto absensi ber-otorisasi: object URL di-load per `photo_url`, revoke saat unmount. */
function MemberAttendancePhoto({ url, session }: { url: string; session: WfhSession }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAttendanceObjectUrl(url)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = next;
        setObjectUrl(next);
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  if (!objectUrl) {
    return (
      <p className="text-xs text-muted-foreground">Foto tidak dapat dimuat.</p>
    );
  }
  return (
    <img
      src={objectUrl}
      alt={`Foto absensi sesi ${SESSION_LABEL[session]}`}
      className="max-h-32 rounded-md border border-border"
    />
  );
}

/** Satu kartu anggota: identitas, badge laporan personal, absensi, kegiatan. */
function MemberCard({ member }: { member: WfhTeamReportMember }) {
  return (
    <Card size="sm" data-testid={`team-report-member-${member.user_id}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {member.name}
          <span className="text-sm font-normal text-muted-foreground">
            {member.nip ?? "-"}
          </span>
        </CardTitle>
        <CardDescription>
          {member.report_status ? (
            <WfhStatusBadge status={member.report_status} />
          ) : (
            <span>Belum ada laporan personal pada tanggal ini.</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">Absensi</p>
          {member.attendances.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada absensi.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.attendances.map((att) => (
                <li key={att.id} className="flex items-center gap-3 text-sm">
                  <span className="w-14 font-medium">{SESSION_LABEL[att.session]}</span>
                  {att.photo_url ? (
                    <MemberAttendancePhoto url={att.photo_url} session={att.session} />
                  ) : (
                    <span className="text-muted-foreground">Tanpa foto</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Kegiatan</p>
          {member.activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada kegiatan.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {member.activities.map((act) => (
                <li key={act.id} className="text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {act.start_time ?? "--:--"}–{act.end_time ?? "--:--"}
                  </span>{" "}
                  {act.activity}
                  {act.links.map((link) => (
                    <a
                      key={link}
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm text-primary underline underline-offset-4"
                    >
                      {link}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function TeamReportDetailPage() {
  const dispatch = useAppDispatch();
  const { reportId } = useParams<{ reportId: string }>();
  const id = Number.parseInt(reportId ?? "", 10);

  const user = useAppSelector(selectUser);
  const { data: report, status: fetchStatus, error } = useAppSelector(selectWfhTeamDetail);
  // Pesan mutasi (approve/reject) disimpan slice di `list.actionError` — bukan
  // `detail.error` (fetch ulang akan membersihkannya). Tampil inline/di dialog.
  const actionError = useAppSelector(selectWfhTeamActionError);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  // Guard double-submit: ref sinkron menolak dua klik beruntun sebelum
  // re-render; state men-disable tombol selama in-flight (pola detail personal).
  const busyRef = useRef(false);
  const [pendingMutation, setPendingMutation] = useState(false);


  useEffect(() => {
    if (Number.isFinite(id)) dispatch(fetchWfhTeamReportDetail(id));
  }, [dispatch, id]);

  if (!Number.isFinite(id)) {
    return (
      <p className="text-sm text-destructive" role="alert">
        ID laporan tidak valid.
      </p>
    );
  }

  if (fetchStatus === "loading" && !report) {
    return (
      <div className="space-y-2" data-testid="team-report-detail-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/team-reports">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke daftar
          </Link>
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const canApprove = report.status === "pending" && can(user, "wfh.team_report.approve");
  const canReject = report.status === "pending" && can(user, "wfh.team_report.reject");
  const canDownloadPdf = can(user, "wfh.report.export_pdf");

  async function submitApprove() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPendingMutation(true);
    const result = dispatch(approveWfhTeamReport(report!.id));
    try {
      // Slice me-refetch detail aktif + list setelah mutasi sukses (Task 5);
      // halaman tidak menambah refetch kedua.
      toast.success((await result.unwrap()).message);
    } catch (err) {
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      busyRef.current = false;
      setPendingMutation(false);
    }
  }

  async function submitReject() {
    const reason = rejectReason.trim();
    if (reason === "" || rejecting) return;
    setRejecting(true);
    const result = dispatch(rejectWfhTeamReport({ teamReportId: report!.id, reason }));
    try {
      toast.success((await result.unwrap()).message);
      setRejectOpen(false);
    } catch (err) {
      // `unwrap()` melempar payload slice (`messageOf`) — non-string tetap lewat seam.
      toast.error(typeof err === "string" && err ? err : toUiError(err).message);
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6" data-testid="team-report-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" asChild>
            <Link to="/team-reports" aria-label="Kembali ke daftar">
              <ArrowLeft aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              <span data-testid="team-report-detail-team">{report.team?.name ?? "-"}</span>
              {" — "}
              <span data-testid="team-report-detail-date">{report.report_date}</span>
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <WfhStatusBadge status={report.status} />
              {report.creator ? (
                <span className="text-sm text-muted-foreground">
                  Pembuat: {report.creator.name} · {report.creator.nip ?? "-"}
                </span>
              ) : null}
              {report.supervisor ? (
                <span className="text-sm text-muted-foreground">
                  Supervisor: {report.supervisor.name} · {report.supervisor.nip ?? "-"}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {canDownloadPdf ? (
          <PdfDownloadButton
            getBlob={() =>
              exportTeamWfhPdf(report!.team_id, {
                date: report!.report_date,
                team_report_id: report!.id,
              })
            }
            filename={`WFH-Team-${report!.team_id}-${report!.report_date}.pdf`}
            onError={(e) => toast.error(toUiError(e).message)}
          >
            Unduh PDF
          </PdfDownloadButton>
        ) : null}
      </div>

      {report.status === "rejected" && report.reject_reason ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">Alasan penolakan:</p>
          <p>{report.reject_reason}</p>
        </div>
      ) : null}

      {report.status === "pending" && (canApprove || canReject) ? (
        <div className="flex gap-2">
          {canApprove ? (
            <Button disabled={pendingMutation} onClick={() => void submitApprove()}>
              Setujui
            </Button>
          ) : null}
          {canReject ? (
            <Button
              variant="destructive"
              disabled={pendingMutation}
              onClick={() => {
                setRejectReason("");
                setRejectOpen(true);
              }}
            >
              Tolak
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {actionError && !rejectOpen ? (
        <p
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
          data-testid="team-detail-action-error"
        >
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {report.members.map((member) => (
          <MemberCard key={member.user_id} member={member} />
        ))}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak laporan</DialogTitle>
            <DialogDescription>
              Alasan wajib diisi — dikirim bersama keputusan penolakan.
            </DialogDescription>
          </DialogHeader>
          <Field orientation="vertical">
            <FieldLabel htmlFor="team-report-detail-reject-reason">Alasan penolakan</FieldLabel>
            <Input
              id="team-report-detail-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
          {actionError ? (
            <p
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="team-detail-reject-error"
            >
              {actionError}
            </p>
          ) : null}
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
