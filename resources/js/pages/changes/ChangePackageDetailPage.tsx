/**
 * ChangePackageDetailPage — detail paket perubahan + mesin status
 * (modul change-package, Phase 3 Task 6).
 *
 * Alur (plan Task 6 + spec):
 * - mount → `fetchPackage(id)` (show; relasi change_types/attachments di-load
 *   server); dua kartu: Inisiasi (doc_number, bidang, inisiator, tanggal
 *   dibutuhkan, deskripsi, alasan, badge status) + Implementasi + lampiran;
 * - unduh lampiran lewat `httpClient` ber-bearer dari `attachment.url` (route
 *   `attachments.download`) → objectURL → anchor → revoke — BUKAN `<a href>`
 *   telanjang (ship review S2: endpoint wajib bearer; pola
 *   `fetchAttendanceObjectUrl`);
 * - matriks aksi digate `can()` × ownership (`initiation.initiator_id ===
 *   user.id`) × status dari data resource; server tetap otoritas
 *   (`ChangePackageDecision`, urutan guard 422→403→403):
 *   - Ubah Draft → `/changes/:id/edit`; Hapus (confirm dialog); Unggah
 *     Lampiran (≤10 file, slice); Ajukan Submit (build full
 *     `PackageSubmitInput` dari resource → `submitPackageThunk`) — inisiator +
 *     `draft`;
 *   - Setujui/Tolak — TANPA dialog alasan (Resolved #4) → `can(approve|reject)`
 *     + `pending` + bukan inisiator;
 *   - PDF inisiasi/implementasi via `PdfDownloadButton` (`getBlob` memakai
 *     api domain, `getError` memetakan 422 tanda tangan) digate `export_pdf` +
 *     status (`approved` / impl `completed`).
 * - error pasca-mutasi tersimpan slice (`current.error`) dan TIDAK lenyap:
 *   halaman hanya refetch setelah mutasi SUKSES (pelajaran a602c46 —
 *   `fetchPackage.pending` tidak membersihkan error, dan aksi gagal tak
 *   memicu refetch sama sekali).
 *
 * Konvensi modul: pesan UI Indonesia, typed hooks, gate UI = permission persis
 * seeder + kondisi data — bukan nama role.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Paperclip, Pencil, Send, Trash2, X } from "lucide-react";

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
import { PdfDownloadButton } from "@/components/wfh/pdf-download";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { httpClient } from "@/api/client";
import {
  exportInitiationPdf,
  exportImplementationPdf,
} from "@/api/change-package";
import {
  deletePackageThunk,
  decidePackageThunk,
  fetchPackage,
  selectChangePackageCurrent,
  selectChangePackageCurrentData,
  submitPackageThunk,
  uploadAttachmentsThunk,
} from "@/store/changePackageSlice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { selectUser } from "@/store/authSlice";
import { can } from "@/lib/permissions";
import type {
  ChangePackage,
  PackageAttachment,
  PackageSubmitInput,
} from "@/api/types";

/** Batas kontrak `UploadChangePackageAttachmentsRequest` (max:10 file). */
const MAX_ATTACHMENTS = 10;

/** Unduh bytes lampiran lewat httpClient ber-bearer → objectURL → anchor. */
export async function downloadAttachmentObjectUrl(url: string): Promise<void> {
  const res = await httpClient.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(res.data);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  // Nama tersimpan dari segmen terakhir endpoint (…/attachments/{id}).
  anchor.download = url.split("/").filter(Boolean).pop() ?? "lampiran";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Bangun `PackageSubmitInput` penuh dari resource show — server mem-persist
 * seluruh payload ini sebelum transisi pending. Field wajib submit yang tak
 * lengkap di resource draft dikirim kosong dan validasi server (422) yang
 * menyusun pesan per field; UI tidak menduplikasi aturan form edit.
 */
export function buildSubmitInputFromResource(pkg: ChangePackage): PackageSubmitInput {
  const impl = pkg.implementation;
  return {
    initiation: {
      field_id: pkg.initiation.field_id,
      needed_by_date: pkg.initiation.needed_by_date ?? "",
      description: pkg.initiation.description,
      reason: pkg.initiation.reason,
    },
    implementation: {
      priority: (impl?.priority ?? "") as "normal" | "emergency",
      impact: (impl?.impact ?? "") as "Minor" | "Mayor",
      change_type_ids: impl?.change_types?.map((t) => t.id) ?? [],
      test_plan: impl?.test_plan ?? "",
      execution_date: impl?.execution_date ?? "",
      release_date: impl?.release_date ?? "",
      implementation_result: impl?.implementation_result ?? "",
      production_impact: impl?.production_impact ?? null,
      required_effort: impl?.required_effort ?? null,
      resources: impl?.resources ?? null,
      cost_needed: impl?.cost_needed ?? false,
      cost_amount: impl?.cost_needed ? (impl.cost_amount ?? null) : null,
    },
  };
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "-"}</span>
    </div>
  );
}

export function ChangePackageDetailPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { packageId } = useParams<{ packageId: string }>();
  const id = Number.parseInt(packageId ?? "", 10);

  const user = useAppSelector(selectUser);
  const current = useAppSelector(selectChangePackageCurrent);
  const pkg = useAppSelector(selectChangePackageCurrentData);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Guard double-submit (pola WFH detail #4): ref sinkron menolak dua klik
  // beruntun; state men-disable tombol selama in-flight. DIDEKLARASIKAN
  // SEBELUM early-return — Rules of Hooks.
  const busyRef = useRef(false);
  const [pendingMutation, setPendingMutation] = useState(false);

  useEffect(() => {
    if (Number.isFinite(id)) dispatch(fetchPackage(id));
  }, [dispatch, id]);

  if (!Number.isFinite(id)) {
    return (
      <p className="text-sm text-destructive" role="alert">
        ID paket tidak valid.
      </p>
    );
  }

  if (current.status === "loading" && !pkg) {
    return (
      <div className="space-y-2" data-testid="change-package-detail-loading">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Full-page error HANYA untuk kegagalan fetch awal (data belum ada).
  // Error mutasi tampil inline (di bawah) — halaman tetap termuat.
  if (current.error && !pkg) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-destructive" role="alert">
          {current.error}
        </p>
        <Button variant="outline" asChild className="w-fit">
          <Link to="/changes">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Kembali ke daftar
          </Link>
        </Button>
      </div>
    );
  }

  if (!pkg) return null;

  const impl = pkg.implementation;
  const isOwner = pkg.initiation.initiator_id === user?.id;
  const isDraft = pkg.initiation.status === "draft";
  const isPending = pkg.initiation.status === "pending";

  // ── Gate tombol (permission sintetik × ownership × status) ──────────
  const canEdit = isDraft && isOwner && can(user, "change.initiation.update");
  const canDoSubmit = isDraft && isOwner && can(user, "change.initiation.submit");
  const canDelete = isDraft && isOwner && can(user, "change.initiation.delete");
  const canUpload =
    isDraft &&
    isOwner &&
    can(user, "change.implementation.update") &&
    (impl?.attachments?.length ?? 0) < MAX_ATTACHMENTS;
  // Server (ChangePackageDecision): pending 422 → scope 403 → self 403. UI
  // menambah "bukan inisiator" — tombol yang pasti 403 disembunyikan.
  const canApprove = isPending && !isOwner && can(user, "change.initiation.approve");
  const canReject = isPending && !isOwner && can(user, "change.initiation.reject");
  const canInitiationPdf =
    pkg.initiation.status === "approved" && can(user, "change.initiation.export_pdf");
  const canImplementationPdf =
    impl?.status === "completed" && can(user, "change.implementation.export_pdf");

  /** Satu mutasi: tunggu selesai lalu refetch detail (hanya bila SUKSES). */
  async function runMutation(action: { unwrap: () => Promise<unknown> }) {
    if (busyRef.current) return;
    busyRef.current = true;
    setPendingMutation(true);
    try {
      await action.unwrap();
      if (Number.isFinite(id)) dispatch(fetchPackage(id));
    } catch {
      // Pesan error sudah disimpan slice → tampil di halaman. Jangan refetch:
      // error mutasi tak boleh lenyap (a602c46).
    } finally {
      busyRef.current = false;
      setPendingMutation(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon-sm" asChild>
            <Link to="/changes" aria-label="Kembali ke daftar">
              <ArrowLeft aria-hidden="true" className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">
              Paket Perubahan {pkg.initiation.doc_number}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <WfhStatusBadge status={pkg.initiation.status} />
              {pkg.initiation.initiator ? (
                <span className="text-sm text-muted-foreground">
                  {pkg.initiation.initiator.name} · {pkg.initiation.initiator.nip}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {canInitiationPdf ? (
            <PdfDownloadButton
              getBlob={() => exportInitiationPdf(id)}
              getError={(e) =>
                e instanceof Error ? e.message : "Gagal mengunduh PDF."
              }
              filename={`Initiation-${id}.pdf`}
            >
              Unduh PDF Inisiasi
            </PdfDownloadButton>
          ) : null}
          {canImplementationPdf ? (
            <PdfDownloadButton
              getBlob={() => exportImplementationPdf(id)}
              getError={(e) =>
                e instanceof Error ? e.message : "Gagal mengunduh PDF."
              }
              filename={`Implementation-${id}.pdf`}
            >
              Unduh PDF Implementasi
            </PdfDownloadButton>
          ) : null}
        </div>
      </div>

      {current.error ? (
        <p
          className="text-sm text-destructive"
          role="alert"
          data-testid="change-package-detail-error"
        >
          {current.error}
        </p>
      ) : null}

      {/* ── Aksi draft (inisiator) ── */}
      {canEdit || canDoSubmit || canUpload || canDelete ? (
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button variant="outline" asChild>
              <Link to={`/changes/${id}/edit`}>
                <Pencil aria-hidden="true" className="size-4" />
                Ubah Draft
              </Link>
            </Button>
          ) : null}
          {canDoSubmit ? (
            <Button
              disabled={pendingMutation}
              onClick={() =>
                void runMutation(
                  dispatch(
                    submitPackageThunk({
                      packageId: id,
                      input: buildSubmitInputFromResource(pkg),
                    }),
                  ),
                )
              }
            >
              <Send aria-hidden="true" className="size-4" />
              Ajukan Submit
            </Button>
          ) : null}
          {canUpload ? (
            <Field orientation="vertical">
              <FieldLabel htmlFor="change-package-attachment-input" className="sr-only">
                Unggah Lampiran
              </FieldLabel>
              <Input
                id="change-package-attachment-input"
                type="file"
                multiple
                className="w-72"
                disabled={uploading}
                data-testid="change-package-attachment-input"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length === 0) return;
                  void (async () => {
                    setUploading(true);
                    try {
                      await dispatch(
                        uploadAttachmentsThunk({ packageId: id, files }),
                      ).unwrap();
                      dispatch(fetchPackage(id));
                    } catch {
                      // Pesan error disimpan slice → tampil di halaman.
                    } finally {
                      setUploading(false);
                    }
                  })();
                }}
              />
            </Field>
          ) : null}
          {canDelete ? (
            <Button
              variant="destructive"
              disabled={pendingMutation}
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Hapus
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── Aksi keputusan (approve/reject — tanpa dialog alasan) ── */}
      {canApprove || canReject ? (
        <div className="flex items-center gap-2">
          {canApprove ? (
            <Button
              disabled={pendingMutation}
              onClick={() =>
                void runMutation(
                  dispatch(decidePackageThunk({ packageId: id, approve: true })),
                )
              }
            >
              <Check aria-hidden="true" className="size-4" />
              Setujui
            </Button>
          ) : null}
          {canReject ? (
            <Button
              variant="destructive"
              disabled={pendingMutation}
              onClick={() =>
                void runMutation(
                  dispatch(decidePackageThunk({ packageId: id, approve: false })),
                )
              }
            >
              <X aria-hidden="true" className="size-4" />
              Tolak
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── Kartu Inisiasi ── */}
      <Card>
        <CardHeader>
          <CardTitle>Inisiasi</CardTitle>
          <CardDescription>Identitas dan kebutuhan paket perubahan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="No. Dokumen" value={pkg.initiation.doc_number} />
            <InfoRow label="Bidang" value={pkg.initiation.field?.name} />
            <InfoRow label="Tanggal dibutuhkan" value={pkg.initiation.needed_by_date} />
            <InfoRow label="Tanggal inisiasi" value={pkg.initiation.initiation_date} />
            <div className="col-span-2">
              <InfoRow label="Deskripsi" value={pkg.initiation.description} />
            </div>
            <div className="col-span-2">
              <InfoRow label="Alasan" value={pkg.initiation.reason} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Kartu Implementasi ── */}
      {impl ? (
        <Card>
          <CardHeader>
            <CardTitle>Implementasi</CardTitle>
            <CardDescription>Rencana teknis pelaksanaan perubahan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Prioritas" value={impl.priority} />
              <InfoRow label="Dampak" value={impl.impact} />
              <div className="col-span-2 flex flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Jenis perubahan
                </span>
                <span className="text-sm">
                  {impl.change_types?.map((t) => t.name).join(", ") || "-"}
                </span>
              </div>
              <InfoRow label="Rencana pengujian" value={impl.test_plan} />
              <InfoRow label="Tanggal eksekusi" value={impl.execution_date} />
              <InfoRow label="Tanggal rilis" value={impl.release_date} />
              <InfoRow label="Hasil implementasi" value={impl.implementation_result} />
              <InfoRow label="Dampak produksi" value={impl.production_impact} />
              <InfoRow label="Effort" value={impl.required_effort} />
              <InfoRow label="Sumber daya" value={impl.resources} />
              <InfoRow
                label="Biaya"
                value={
                  impl.cost_needed
                    ? `Rp ${impl.cost_amount ?? "-"}`
                    : "Tidak perlu biaya"
                }
              />
              <InfoRow label="Status implementasi" value={impl.status} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Lampiran ── */}
      <Card>
        <CardHeader>
          <CardTitle>Lampiran</CardTitle>
          <CardDescription>
            {impl?.attachments?.length ?? 0} dari maksimal {MAX_ATTACHMENTS} berkas.
            Unduhan lewat endpoint ber-otorisasi (bearer) — bukan tautan /storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(impl?.attachments?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada lampiran.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {impl?.attachments?.map((attachment: PackageAttachment) => (
                <li
                  key={attachment.id}
                  data-testid={`change-package-attachment-${attachment.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Paperclip aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span>Lampiran #{attachment.id}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void downloadAttachmentObjectUrl(attachment.url)}
                  >
                    Unduh
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog konfirmasi hapus ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus paket perubahan</DialogTitle>
            <DialogDescription>
              Draft akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setDeleteOpen(false);
                void (async () => {
                  try {
                    await dispatch(deletePackageThunk(id)).unwrap();
                    navigate("/changes");
                  } catch {
                    // Pesan error disimpan slice → tampil di halaman.
                  }
                })();
              }}
            >
              Ya, hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}