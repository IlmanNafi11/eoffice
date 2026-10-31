/**
 * `attendance-upload` — absensi foto per sesi: upload, preview ber-otorisasi.
 *
 * Preview `photo_url` menunjuk endpoint yang wajib bearer token; `<img src>`
 * polos TIDAK membawa header `Authorization` (regresi Phase 1 0d51f6f6), maka
 * bytes diambil lewat `httpClient` lalu dijadikan object URL — pola persis
 * `fetchSignatureObjectUrl` di `api/profile.ts`.
 */
import * as React from "react";
import { ImageOff, Trash2, Upload, Loader2 } from "lucide-react";
import { httpClient } from "@/api/client";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-3">
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
              } finally {
                setUploading(null);
              }
            }}
            onDelete={async () => {
              if (!att?.id) return;
              setDeleting(att.id);
              try {
                await onDelete(att.id);
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
  const inputRef = React.useRef<HTMLInputElement>(null);

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

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="w-24 shrink-0 text-sm font-medium">{label}</div>
      <div className="flex-1">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Absensi sesi ${label.toLowerCase()}`}
            className="h-24 w-auto rounded border bg-white object-contain"
          />
        ) : (
          <div className="flex h-24 items-center justify-center gap-2 rounded border border-dashed text-sm text-muted-foreground">
            <ImageOff aria-hidden="true" className="size-4" />
            Belum ada foto
          </div>
        )}
      </div>
      {canEdit ? (
        <div className="flex shrink-0 flex-col gap-2">
          {attendance?.photo_url || attendance?.checked_in ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Trash2 aria-hidden="true" className="size-4" />
              )}
              Hapus
            </Button>
          ) : null}
          <div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              id={`attendance-upload-${session}`}
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
              <label htmlFor={`attendance-upload-${session}`}>
                {uploading ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Upload aria-hidden="true" className="size-4" />
                )}
                Unggah foto
              </label>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}