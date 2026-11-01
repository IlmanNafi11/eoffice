/**
 * WfhReportDetailPage — detail laporan WFH personal + aksi transisi
 * (frontend-phase2, Phase 3 task "WfhReportDetailPage + wiring route").
 *
 * Kontrak (spec §Code Style + Acceptance; plan Task detail page):
 * - gate editability via helper TUNGGAL `canEditReport(status)` (draft|rejected)
 *   — dipakai SEMUA aksi edit di halaman ini dan test-nya;
 * - aksi owner (kegiatan/absensi/tanggal/submit/revisi) disembunyikan untuk
 *   non-owner; approve/reject butuh `wfh.report.approve|reject` dan hanya
 *   untuk status `pending` (route middleware `routes/api.php` sumber kebenaran
 *   otorisasi; UI hanya menyembunyikan aksi yang mustahil lolos);
 * - PDF hanya saat `pending|approved` + `wfh.report.export_pdf`
 *   (gate status di `ReportPdfController::export`);
 * - aksi tak diizinkan disembunyikan (bukan `disabled`);
 * - reject wajib lewat dialog alasan (`RejectReportRequest.reason`);
 * - error mutasi (422/403 kontrak) tampil sebagai pesan `current.error`;
 * - mutasi sub-resource (activity/attendance) bukan resource utama →
 *   halaman refetch detail (GET show) setelah semua operasi selesai;
 * - sesi absensi dari `GET /wfh/session-config` (server, bukan hardcode);
 * - kegiatan: id-diff (tanpa id → POST, teks berubah → PUT id, hilang →
 *   DELETE, urutan berubah → PATCH {ids}).
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";

import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { ActivitiesEditor } from "@/components/wfh/activities-editor";
import { AttendanceUploadList } from "@/components/wfh/attendance-upload";
import { PdfDownloadButton } from "@/components/wfh/pdf-download";
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
import { exportWfhReportPdf, getWfhSessionConfig } from "@/api/wfh";
import { can } from "@/lib/permissions";
import type { WfhReport, WfhReportActivity, WfhSessionConfig } from "@/api/types";
import {
  addReportActivity,
  addReportAttendance,
  approveWfhReport,
  deleteReportActivity,
  deleteReportAttendance,
  fetchWfhReport,
  rejectWfhReport,
  reorderReportActivities,
  reviseWfhReport,
  selectWfhCurrent,
  submitWfhReport,
  updateReportActivity,
  updateWfhReportMetadata,
} from "@/store/wfhSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";

/** Satu pintu gate edit — dipakai semua aksi edit (spec §Risks). */
export function canEditReport(status: WfhReport["status"]): boolean {
  return status === "draft" || status === "rejected";
}

export function WfhReportDetailPage() {
  const dispatch = useAppDispatch();
  const { reportId } = useParams<{ reportId: string }>();
  const id = Number.parseInt(reportId ?? "", 10);

  const user = useAppSelector(selectUser);
  const { report, status: fetchStatus, error } = useAppSelector(selectWfhCurrent);

  const [config, setConfig] = useState<WfhSessionConfig | null>(null);
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    if (Number.isFinite(id)) dispatch(fetchWfhReport(id));
  }, [dispatch, id]);

  useEffect(() => {
    let cancelled = false;
    getWfhSessionConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setConfig(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetch = useCallback(() => {
    if (Number.isFinite(id)) dispatch(fetchWfhReport(id));
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
      <div className="space-y-2" data-testid="wfh-detail-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/wfh">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke daftar
          </Link>
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const isOwner = user?.id === report.user_id;
  const editable = canEditReport(report.status);

  const canSubmit = isOwner && report.status === "draft" && can(user, "wfh.report.submit");
  const canRevise = isOwner && report.status === "rejected" && can(user, "wfh.report.update");
  const canApprove = report.status === "pending" && can(user, "wfh.report.approve");
  const canReject = report.status === "pending" && can(user, "wfh.report.reject");
  const canUpdateReport = editable && isOwner && can(user, "wfh.report.update");
  const canCreateActivity = editable && isOwner && can(user, "wfh.report.create");
  const canUploadAttendance = editable && isOwner && can(user, "wfh.attendance.create");
  const canDeleteAttendance = editable && isOwner && can(user, "wfh.report.attendance.delete");
  const canDownloadPdf =
    (report.status === "pending" || report.status === "approved") &&
    can(user, "wfh.report.export_pdf");

  /** Satu mutasi: tunggu selesai lalu refetch detail. `dispatch(thunk)`
   *  mengembalikan thenable ber-`.unwrap()` (RTK). */
  async function runMutation(action: { unwrap: () => Promise<unknown> }) {
    try {
      await action.unwrap();
      refetch();
    } catch {
      // Pesan error sudah disimpan slice → tampil di halaman. Jangan refetch:
      // fetchWfhReport.pending membersihkan current.error sebelum terlihat.
    }
  }

  /** Id-diff kegiatan: tambah → POST, teks berubah → PUT, hilang → DELETE,
   *  urutan berubah → PATCH {ids}. Semua gate sudah difilter dari canEdit. */
  async function persistActivities(next: WfhReportActivity[]) {
    const prev = report?.activities ?? [];
    if (!report) return;

    const nextById = new Map<number, WfhReportActivity>(
      next.filter((a) => a.id != null).map((a) => [a.id as number, a]),
    );
    const prevById = new Map<number, WfhReportActivity>(
      prev.filter((a) => a.id != null).map((a) => [a.id as number, a]),
    );

    const ops: Array<{ unwrap: () => Promise<unknown> }> = [];

    // Tambah (baris tanpa id → POST sub-resource).
    for (const row of next.filter((a) => a.id == null)) {
      ops.push(
        dispatch(
          addReportActivity({ reportId: report.id, input: { activity: row.activity } }),
        ),
      );
    }

    // Hapus (id hilang → DELETE).
    for (const row of prev.filter((a) => a.id != null && !nextById.has(a.id as number))) {
      ops.push(
        dispatch(deleteReportActivity({ reportId: report.id, activityId: row.id as number })),
      );
    }

    // Ubah teks (id sama, teks beda → PUT; links dibawa ulang id-diff).
    for (const row of next.filter((a) => a.id != null)) {
      const before = prevById.get(row.id as number);
      if (before && before.activity !== row.activity) {
        ops.push(
          dispatch(
            updateReportActivity({
              reportId: report.id,
              activityId: row.id as number,
              input: {
                id: row.id,
                activity: row.activity,
                links:
                  before.links?.map((l) => ({ id: l.id ?? null, url: l.url })) ?? [],
              },
            }),
          ),
        );
      }
    }

    // Reorder: urutan id berubah (backend menulis ulang sort_order).
    const orderedIds = next
      .filter((a) => a.id != null)
      .map((a) => a.id as number);
    const prevOrderedIds = [...prev]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .filter((a) => a.id != null)
      .map((a) => a.id as number);
    if (orderedIds.join(",") !== prevOrderedIds.join(",")) {
      ops.push(
        dispatch(reorderReportActivities({ reportId: report.id, ids: orderedIds })),
      );
    }

    const results = await Promise.allSettled(ops.map((op) => op.unwrap()));
    // Semua gagal (mis. 422 validasi) → jangan refetch; pesan error di slice
    // (disimpan matcher rejected) harus tetap tampil.
    if (results.some((r) => r.status === "rejected")) return;
    refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" asChild>
            <Link to="/wfh" aria-label="Kembali ke daftar">
              <ArrowLeft aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Laporan WFH {report.report_date}</h1>
            <div className="mt-1 flex items-center gap-2">
              <WfhStatusBadge status={report.status} />
              {report.user ? (
                <span className="text-sm text-muted-foreground">
                  {report.user.name} · {report.user.nip}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {canDownloadPdf ? (
          <PdfDownloadButton
            getBlob={() => exportWfhReportPdf(report.id)}
            filename={`WFH-${report.id}-${report.report_date}.pdf`}
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
            <Button onClick={() => void runMutation(dispatch(approveWfhReport(report.id)))}>
              Setujui
            </Button>
          ) : null}
          {canReject ? (
            <Button
              variant="destructive"
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

      {canSubmit ? (
        <div>
          <Button onClick={() => void runMutation(dispatch(submitWfhReport(report.id)))}>
            Ajukan untuk disetujui
          </Button>
        </div>
      ) : null}

      {canRevise ? (
        <div>
          <Button onClick={() => void runMutation(dispatch(reviseWfhReport(report.id)))}>
            Revisi laporan
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {canUpdateReport ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Tanggal laporan</CardTitle>
            <CardDescription>Ubah tanggal kerja (metadata laporan).</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!dateDraft || dateDraft === report.report_date) return;
                void runMutation(
                  dispatch(
                    updateWfhReportMetadata({ reportId: report.id, reportDate: dateDraft }),
                  ),
                );
              }}
            >
              <Field className="w-48" orientation="vertical">
                <FieldLabel htmlFor="wfh-detail-date">Tanggal laporan</FieldLabel>
                <Input
                  id="wfh-detail-date"
                  type="date"
                  value={dateDraft ?? report.report_date}
                  onChange={(e) => setDateDraft(e.target.value)}
                />
              </Field>
              <Button type="submit" variant="outline" disabled={!dateDraft}>
                <Save aria-hidden="true" className="size-4" />
                Simpan tanggal
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kegiatan</CardTitle>
          <CardDescription>
            Total {report.activities?.length ?? 0} kegiatan tercatat.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivitiesEditor
            activities={report.activities ?? []}
            canEdit={canCreateActivity}
            onChange={(next) => void persistActivities(next)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Absensi</CardTitle>
          <CardDescription>Foto tiap sesi sebagai bukti kehadiran.</CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceUploadList
            sessions={config?.sessions ?? []}
            attendances={report.attendances ?? []}
            canEdit={canUploadAttendance || canDeleteAttendance}
            onUpload={({ session, photo }) =>
              runMutation(dispatch(addReportAttendance({ reportId: report.id, session, photo })))
            }
            onDelete={(attendanceId) =>
              runMutation(
                dispatch(deleteReportAttendance({ reportId: report.id, attendanceId })),
              )
            }
          />
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
            <FieldLabel htmlFor="wfh-reject-reason">Alasan penolakan</FieldLabel>
            <Input
              id="wfh-reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </Field>
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
              onClick={async () => {
                setRejecting(true);
                try {
                  await dispatch(
                    rejectWfhReport({ reportId: report.id, reason: rejectReason.trim() }),
                  ).unwrap();
                  setRejectOpen(false);
                  refetch();
                } catch {
                  // Pesan error disimpan slice → tampil di halaman.
                } finally {
                  setRejecting(false);
                }
              }}
            >
              Tolak laporan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}