/**
 * `report-row` — baris laporan WFH di tabel list (row + badge + klik-detail).
 * Diekstrak dari `WfhReportsPage` supaya list personal dan list admin
 * (modul `wfh-monitoring`) memakai baris yang sama, tanpa fork tabel. Prop
 * minimal: `report` + `onOpen` (+ `sessions` untuk kolom Status WFH); komponen
 * tak mengimpor store atau react-router — pemanggil yang memutuskan apa arti
 * "buka detail".
 */
import type { WfhReport, WfhSession } from "@/api/types";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { WfhAttendanceStatus } from "@/components/wfh/attendance-status";

export function WfhReportRow({
  report,
  sessions,
  onOpen,
}: {
  report: WfhReport;
  /** Sesi aktif dari `GET /wfh/session-config`; kosong → tanda —. */
  sessions: WfhSession[];
  onOpen: (reportId: number) => void;
}) {
  return (
    <tr
      data-testid={`wfh-report-row-${report.id}`}
      className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/50"
      onClick={() => onOpen(report.id)}
    >
      <td className="py-2 pr-4 font-medium">{report.report_date}</td>
      <td className="py-2 pr-4">
        <WfhStatusBadge status={report.status} />
      </td>
      <td className="py-2 pr-4">
        <WfhAttendanceStatus sessions={sessions} attendances={report.attendances} />
      </td>
      <td className="py-2 text-right">
        {report.activity_count ?? report.activities?.length ?? 0}
      </td>
    </tr>
  );
}
