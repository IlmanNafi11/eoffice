/**
 * `report-row` — baris laporan WFH di tabel list (row + badge + klik-detail).
 * Diekstrak dari `WfhReportsPage` supaya list personal dan list admin
 * (modul `wfh-monitoring`) memakai baris yang sama, tanpa fork tabel. Prop
 * minimal: `report` + `onOpen` (+ `sessions` untuk kolom Status WFH); komponen
 * tak mengimpor store atau react-router — pemanggil yang memutuskan apa arti
 * "buka detail".
 *
 * `actions` opt-in (modul `wfh-report-actions`): menu Aksi per baris untuk
 * list personal. Monitoring tidak mengirim prop → kolom tidak dirender.
 * Item ter-gate status (`draft` untuk Edit/Hapus, `pending|approved` untuk
 * Unduh PDF) + permission dari pemanggil; aksi tak diizinkan disembunyikan
 * (bukan `disabled`). Handler menerima `report` utuh agar pemanggil tak perlu
 * mencari ulang baris di state.
 */
import type { WfhReport, WfhSession } from "@/api/types";
import { WfhStatusBadge } from "@/components/wfh/status-badge";
import { WfhAttendanceStatus } from "@/components/wfh/attendance-status";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, EllipsisVertical, Eye, Pencil, Trash2 } from "lucide-react";

/** Aksi baris yang disediakan pemanggil; handler menerima baris utuh. */
export interface WfhReportRowActions {
  canEdit: boolean;
  canDelete: boolean;
  canDownloadPdf: boolean;
  onEdit: (report: WfhReport) => void;
  onDelete: (report: WfhReport) => void;
  onDownload: (report: WfhReport) => void;
}

export function WfhReportRow({
  report,
  sessions,
  onOpen,
  actions,
}: {
  report: WfhReport;
  /** Sesi aktif dari `GET /wfh/session-config`; kosong → tanda —. */
  sessions: WfhSession[];
  onOpen: (reportId: number) => void;
  /** Menu Aksi opt-in; tanpa prop → tanpa kolom (Monitoring). */
  actions?: WfhReportRowActions;
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
      {actions ? (
        // Baris membuka detail; semua interaksi di sel aksi (termasuk konten
        // menu yang portal-nya tetap ikut silsilah React) tidak boleh navigasi.
        <td className="py-2 pl-2 text-right" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Aksi"
                data-testid={`wfh-report-actions-${report.id}`}
              >
                <EllipsisVertical aria-hidden="true" className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onSelect={() => onOpen(report.id)}>
                <Eye aria-hidden="true" />
                Detail
              </DropdownMenuItem>
              {actions.canEdit && report.status === "draft" ? (
                <DropdownMenuItem onSelect={() => actions.onEdit(report)}>
                  <Pencil aria-hidden="true" />
                  Edit
                </DropdownMenuItem>
              ) : null}
              {actions.canDelete && report.status === "draft" ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => actions.onDelete(report)}
                >
                  <Trash2 aria-hidden="true" />
                  Hapus
                </DropdownMenuItem>
              ) : null}
              {actions.canDownloadPdf &&
              (report.status === "pending" || report.status === "approved") ? (
                <DropdownMenuItem onSelect={() => actions.onDownload(report)}>
                  <Download aria-hidden="true" />
                  Unduh PDF
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      ) : null}
    </tr>
  );
}
