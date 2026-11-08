/**
 * `attendance-status` — ringkasan absensi per sesi aktif pada baris daftar WFH.
 * Tiap sesi (Setting `wfh_sessions`) tampil sebagai pill kecil: hijau + centang
 * bila sudah absen (`checked_in`), muted tanpa centang bila belum. Tujuannya
 * giving user ringkasan cepat — "Pagi absen, Siang absen, Sore belum" — dalam
 * satu glance di tabel list. Konsumen: WfhReportsPage & MonitoringPage.
 */
import { Check } from "lucide-react";
import type { WfhAttendance, WfhSession } from "@/api/types";
import { cn } from "cn";

/** Label bahasa Indonesia per sesi (sama seperti `attendance-upload`). */
const SESSION_LABEL: Record<WfhSession, string> = {
  pagi: "Pagi",
  siang: "Siang",
  sore: "Sore",
};

/** Foto/status terpasang per sesi untuk mempermudah lookup. */
function bySession(
  attendances: WfhAttendance[],
): Partial<Record<WfhSession, WfhAttendance>> {
  const map: Partial<Record<WfhSession, WfhAttendance>> = {};
  for (const att of attendances) map[att.session] = att;
  return map;
}

export function WfhAttendanceStatus({
  sessions,
  attendances,
}: {
  /** Sesi aktif (dari `GET /wfh/session-config`); fallback default oleh konsumen. */
  sessions: WfhSession[];
  /** Absensi laporan (list endpoint sudah mem-load relasi ini). */
  attendances?: WfhAttendance[];
}) {
  const mapped = bySession(attendances ?? []);
  const checkedCount = sessions.filter((s) => mapped[s]?.checked_in).length;

  if (sessions.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={`Absensi ${checkedCount} dari ${sessions.length} sesi`}
      data-testid="wfh-attendance-status"
    >
      {sessions.map((session) => {
        const checked = Boolean(mapped[session]?.checked_in);
        return (
          <span
            key={session}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
              checked
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-muted text-muted-foreground",
            )}
            aria-label={`${SESSION_LABEL[session]} ${checked ? "sudah absen" : "belum absen"}`}
          >
            {checked ? (
              <Check aria-hidden="true" className="size-3" />
            ) : null}
            {SESSION_LABEL[session]}
          </span>
        );
      })}
    </div>
  );
}
