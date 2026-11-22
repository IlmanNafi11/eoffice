/**
 * `attendance-upload` — absensi foto per sesi: upload, preview ber-otorisasi.
 *
 * Preview `photo_url` menunjuk endpoint yang wajib bearer token; `<img src>`
 * polos TIDAK membawa header `Authorization` (regresi Phase 1 0d51f6f6), maka
 * bytes diambil lewat `httpClient` lalu dijadikan object URL — pola persis
 * `fetchSignatureObjectUrl` di `api/profile.ts`.
 *
 * Layout: kartu sesi mengalir HORIZONTAL (`→`, gaya `|Pagi|Siang|Sore|`) dan
 * membungkus ke baris berikutnya saat ruang habis. Label sesi berada di ATAS
 * avatar circle (`rounded-full`), dan bar aksi di bawahnya memakai grid
 * `auto-fit` supaya Hapus & Unggah foto selalu berbagi lebar yang sama.
 */
import * as React from "react";
import { ATTENDANCE_RULE, validateUploads } from "@/lib/upload-validate";
import { ImageOff, Trash2, Loader2, X } from "lucide-react";
import { httpClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import type { WfhAttendance, WfhSession } from "@/api/types";

/** Ambil bytes masker absensi lewat client ber-otorisasi → object URL. */
export async function fetchAttendanceObjectUrl(url: string): Promise<string> {
  const res = await httpClient.get<Blob>(url, { responseType: "blob" });
  return URL.createObjectURL(res.data);
}

interface AttendanceUploadListProps {
  sessions: WfhSession[];
  attendances: WfhAttendance[];
  /** Gate editability (draft|rejected) dihitung orang tua — bukan di sini. */
  canEdit: boolean;
  onUpload: (input: { session: WfhSession; photo: File }) => Promise<void>;
  onDelete: (attendanceId: number) => Promise<void>;
}

/** Foto terpasang per sesi, untuk memadankan baris absensi dengan sesinya. */
function bySession(attendances: WfhAttendance[]): Partial<Record<WfhSession, WfhAttendance>> {
  const map: Partial<Record<WfhSession, WfhAttendance>> = {};
  for (const att of attendances) map[att.session] = att;
  return map;
}

const SESSION_LABEL: Record<WfhSession, string> = {
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
};

export function AttendanceUploadList({
  sessions,
  attendances,
  canEdit,
  onUpload,
  onDelete,
}: AttendanceUploadListProps) {
  const [uploading, setUploading] = React.useState<WfhSession | null>(null);
  const [deleting, setDeleting] = React.useState<number | null>(null);

  const mapped = bySession(attendances);
  return (
    <div className="flex flex-wrap items-stretch gap-3">
      {sessions.map((session) => {
        const att = mapped[session];
        return (
          <AttendanceRow
            key={session}
            session={session}
            label={SESSION_LABEL[session]}
            attendance={att}
            canEdit={canEdit}
            uploading={uploading === session}
            deleting={deleting === att?.id}
            onUpload={async (photo) => {
              setUploading(session);
              try {
                await onUpload({ session, photo });
              } catch {
                // Error di-surfing orang tua (slice `current.error`) — jangan
                // rethrow, biar tidak jadi unhandled rejection di sini.
              } finally {
                setUploading(null);
              }
            }}
            onDelete={async () => {
              if (!att?.id) return;
              setDeleting(att.id);
              try {
                await onDelete(att.id);
              } catch {
                // idem — error di-surfing orang tua.
              } finally {
                setDeleting(null);
              }
            }}
          />
        );
      })}
    </div>
  );
}

function AttendanceRow({
  session,
  label,
  attendance,
  canEdit,
  uploading,
  deleting,
  onUpload,
  onDelete,
}: {
  session: WfhSession;
  label: string;
  attendance: WfhAttendance | undefined;
  canEdit: boolean;
  uploading: boolean;
  deleting: boolean;
  onUpload: (photo: File) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  // File terpilih (belum terunggah) — menentukan kapan tombol X/Batal tampil.
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  // Pesan pre-check T9a: inline di dekat input, bukan kunci field internal.
  const [preCheckError, setPreCheckError] = React.useState<string | null>(null);
  const setAndTrack = React.useCallback((next: string | null) => {
    if (previewUrlRef.current && previewUrlRef.current !== next) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }, []);

  // Muat preview dari `photo_url` ber-otorisasi; revoke saat unmount/ganti.
  React.useEffect(() => {
    let cancelled = false;
    if (attendance?.photo_url) {
      fetchAttendanceObjectUrl(attendance.photo_url)
        .then((url) => {
          if (!cancelled) setAndTrack(url);
        })
        .catch(() => setAndTrack(null));
    } else {
      setAndTrack(null);
    }
    return () => {
      cancelled = true;
    };
  }, [attendance?.photo_url, setAndTrack]);

  React.useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [],
  );

  async function handleFileChange(file: File | null) {
    // Early-return: dua event `change` ter-antre sebelum re-render jangan
    // memicu upload paralel (ship review #4 double-select guard).
    if (!file || uploading) return;
    // Pre-check client (T9a): tolak file yang pasti salah SEBELUM request
    // network dikirim; pesan inline memakai label Indonesia, bukan kunci.
    const invalid = validateUploads([file], ATTENDANCE_RULE);
    if (invalid !== null) {
      setPreCheckError(invalid);
      return;
    }
    setPreCheckError(null);
    setSelectedFile(file);
    try {
      await onUpload(file);
      setSelectedFile(null);
    } catch {
      // Error di-surfacing orang tua; file terpilih tetap bisa dibatalkan.
    }
  }

  /** Batal pilih file — sama dengan tombol X bawaan FileInput. */
  function clearSelected() {
    setSelectedFile(null);
    setPreCheckError(null);
  }
  /**
   * Bar aksi: grid `auto-fit minmax(8rem,1fr)` — tiap sel dapat lebar SAMA
   * (border box, termasuk padding tombol Hapus), dan otomatis turun ke baris
   * sendiri saat kartu menyempit. Tombol X (hapus file terpilih di FileInput)
   * DIKELOMPOKKAN di bar ini: sel ketiga sejajar Hapus & Unggah, sehingga
   * saat X tampil ia tidak meluber keluar kartu (regresi overflow).
   */
  const actionBarCls = "grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2 items-center";
  return (
    <div className="flex min-w-56 flex-1 flex-col gap-2 rounded-lg border p-3">
      <div className="text-center text-sm font-medium">{label}</div>
      <div className="flex justify-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Absensi sesi ${label.toLowerCase()}`}
            className="size-24 shrink-0 rounded-full border bg-white object-cover"
          />
        ) : (
          <div className="flex size-24 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted/30 text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-5" />
          </div>
        )}
      </div>
      {canEdit ? (
        <div className={actionBarCls}>
          {attendance?.photo_url || attendance?.checked_in ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="size-4" />
              )}
              Hapus
            </Button>
          ) : null}
          <FileInput
            id={`attendance-upload-${session}`}
            accept="image/jpeg,image/png"
            placeholder="Unggah foto"
            onFileChange={(f) => void handleFileChange(f)}
            disabled={uploading}
            size="sm"
            className="w-full"
            clearButton="none"
          />
          {/* Tombol X: bagian grid yang SAMA dengan Hapus & Unggah, jadi saat
              tampil ia mengisi sel dan tidak meluber keluar kartu. */}
          {selectedFile ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="hapus file terpilih"
              title="Hapus file terpilih"
              disabled={uploading}
              onClick={clearSelected}
              className="w-full text-muted-foreground"
            >
              <X aria-hidden="true" className="size-4" />
              Batal
            </Button>
          ) : null}
          {preCheckError ? (
            <p className="text-xs text-destructive" role="alert">
              {preCheckError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}