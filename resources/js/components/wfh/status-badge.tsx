/**
 * `status-badge` — peta status laporan WFH → label Indonesia + variasi warna.
 * Ditempatkan di `components/wfh` sesuai plan; saat modul berikutnya
 * (team-reports/monitoring) memakainya lagi, modul itu yang menaikkannya ke
 * `components/ui`/`shared` — bukan modul ini.
 */
import type { WfhReportStatus } from "@/api/types";
import { cn } from "cn";

/**
 * Peta `status → label` bahasa Indonesia. Satu-satunya sumber label; gunakan
 * selalu lewat `WfhStatusBadge` atau import langsung untuk cell tabel.
 */
export const WFH_STATUS_LABELS: Record<WfhReportStatus, string> = {
  draft: "Draf",
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const STATUS_VARIANT: Record<WfhReportStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function WfhStatusBadge({
  status,
  className,
}: {
  status: WfhReportStatus;
  className?: string;
}) {
  return (
    <span
      data-testid="wfh-status-badge"
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_VARIANT[status],
        className,
      )}
    >
      {WFH_STATUS_LABELS[status]}
    </span>
  );
}