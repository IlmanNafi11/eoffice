/**
 * Modul API domain WFH Monitoring (modul wfh-monitoring).
 *
 * Kontrak `postman/specs/openapi.yaml` tag `WFH Monitoring` (2 op) +
 * `exportTeamWfhPdf` pinjaman dari tag `WFH Reports` (lihat
 * `SPEC-wfh-monitoring.md` — ekspor PDF rekap tim = tombol per grup tim di
 * papan harian, bukan panel terpisah).
 *
 * Disiplin envelope: board (`getWfhMonitoring`) lewat `requireData`;
 * list admin (`adminListWfhReports`) = `ApiResponse::paginated`
 * (`{data[], meta}`) dipetakan `{ reports, meta }` (pola `wfh-team.ts`);
 * PDF binary lewat `httpClient` blob — bypass unwrap interceptor (pola
 * `exportWfhReportPdf`).
 */
import { api, httpClient, requireData } from "@/api/client";
import {
  ListAdminReportsQuery,
  PaginationMeta,
  WfhMonitoringData,
  WfhReport,
} from "@/api/types";

/** Query `GET /admin/wfh/monitoring` — keduanya opsional. */
interface WfhMonitoringQuery {
  date?: string;
  team_id?: number;
}

/**
 * GET /admin/wfh/monitoring — papan monitoring harian (envelope `{data}`).
 * `date` default "hari ini" diputuskan backend; `team_id` opsional — scope
 * otomatis per peran bila tak dikirim.
 */
export async function getWfhMonitoring(
  query: WfhMonitoringQuery = {},
): Promise<WfhMonitoringData> {
  const params: Record<string, unknown> = {};
  if (query.date !== undefined) params.date = query.date;
  if (query.team_id !== undefined) params.team_id = query.team_id;

  const res = await api.get<WfhMonitoringData>(
    "/admin/wfh/monitoring",
    Object.keys(params).length > 0 ? { params } : {},
  );
  return requireData(res.data, "getWfhMonitoring");
}

/**
 * GET /admin/wfh/reports — envelope `ApiResponse::paginated` → `{ reports, meta }`.
 * Semua filter opsional; presedensi `date_from`/`date_to` > `date` > `month`
 * diputuskan backend. `page` turut diteruskan untuk paginasi Laravel.
 */
export async function adminListWfhReports(
  query: ListAdminReportsQuery = {},
): Promise<{ reports: WfhReport[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;
  if (query.status !== undefined) params.status = query.status;
  if (query.team_id !== undefined) params.team_id = query.team_id;
  if (query.date_from !== undefined) params.date_from = query.date_from;
  if (query.date_to !== undefined) params.date_to = query.date_to;
  if (query.date !== undefined) params.date = query.date;
  if (query.month !== undefined) params.month = query.month;

  const res = await api.get<WfhReport[]>(
    "/admin/wfh/reports",
    Object.keys(params).length > 0 ? { params } : {},
  );
  const meta = res.meta;
  return {
    reports: res.data ?? [],
    meta: {
      current_page: meta?.current_page ?? 1,
      last_page: meta?.last_page ?? 1,
      per_page: meta?.per_page,
      total: meta?.total ?? 0,
    },
  };
}

/**
 * GET /admin/wfh/teams/{team}/pdf — binary `application/pdf` (non-envelope).
 * Tidak melewati unwrap interceptor: ambil Blob langsung dari `httpClient`.
 * `team_report_id` opsional: bila diisi, backend men-toggle flag `isApproved`
 * yang mengontrol render tanda tangan kepala bidang.
 */
export async function exportTeamWfhPdf(
  teamId: number,
  query: { date?: string; team_report_id?: number | null } = {},
): Promise<Blob> {
  const params: Record<string, unknown> = {};
  if (query.date !== undefined) params.date = query.date;
  if (query.team_report_id !== undefined) params.team_report_id = query.team_report_id;

  const res = await httpClient.get<Blob>(`/admin/wfh/teams/${teamId}/pdf`, {
    params: Object.keys(params).length > 0 ? params : undefined,
    responseType: "blob",
  });
  return res.data;
}