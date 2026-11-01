/**
 * `report-row` — baris laporan WFH di tabel list (row + badge + klik-detail).
 * Diekstrak dari `WfhReportsPage` supaya list personal dan list admin
 * (modul `wfh-monitoring`, plan Task 5) memakai baris yang sama, tanpa fork
 * tabel. Prop minimal: `report` + `onOpen`; komponen tak mengimpor store atau
 * react-router — pemanggil yang memutuskan apa arti "buka detail".
 */
import type { WfhReport } from "@/api/types";
import { WfhStatusBadge } from "@/components/wfh/status-badge";

export function WfhReportRow({
  report,
  onOpen,
}: {
  report: WfhReport;
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
      <td className="py-2 text-right">
        {report.activity_count ?? report.activities?.length ?? 0}
      </td>
    </tr>
  );
}
