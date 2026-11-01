/**
 * Modul API domain WFH Team Reports (modul wfh-team-reports).
 *
 * Kontrak `postman/specs/openapi.yaml` tag `WFH Team Reports` (4 op) + 1 op
 * pinjaman `listTeams` (tag `Organization`, dipinjam untuk dropdown form
 * create — keputusan user 2026-11-01, lihat `SPEC-wfh-team-reports.md`).
 *
 * Disiplin envelope: SEMUA 5 op lewat envelope — list = `ApiResponse::paginated`
 * (`{success, data[], meta}`; meta = paginator), create/approve/reject +
 * listTeams = envelope `{data}` lewat `requireData`.
 */
import { api, requireData } from "@/api/client";
import {
  CreateTeamReportInput,
  ListTeamReportsQuery,
  PaginationMeta,
  RejectTeamReportInput,
  TeamResource,
  WfhTeamReport,
} from "@/api/types";

/**
 * GET /admin/wfh/team-reports — envelope `ApiResponse::paginated` →
 * `{ reports, meta }`. Ground truth E2E 2026-11-01: backend membungkus paginator
 * dalam envelope (`ApiResponse::paginated`), BUKAN paginator raw seperti
 * deskripsi lama `TeamReportListResponse`; unwrap melepas `success`, jadi
 * `res.data` = array baris dan `res.meta` = paginator.
 */
export async function listWfhTeamReports(
  query: ListTeamReportsQuery = {},
): Promise<{ reports: WfhTeamReport[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;

  const res = await api.get<WfhTeamReport[]>(
    "/admin/wfh/team-reports",
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

/** POST /admin/wfh/team-reports — server memaksa `status=pending` + `created_by`. */
export async function createWfhTeamReport(input: CreateTeamReportInput): Promise<WfhTeamReport> {
  const res = await api.post<WfhTeamReport>("/admin/wfh/team-reports", input);
  return requireData(res.data, "createWfhTeamReport");
}

/** POST /admin/wfh/team-reports/{id}/approve — payload kosong. */
export async function approveWfhTeamReport(teamReportId: number): Promise<WfhTeamReport> {
  const res = await api.post<WfhTeamReport>(`/admin/wfh/team-reports/${teamReportId}/approve`);
  return requireData(res.data, "approveWfhTeamReport");
}

/** POST …/reject — alasan wajib (kontrak `RejectTeamReportRequest`). */
export async function rejectWfhTeamReport(
  teamReportId: number,
  input: RejectTeamReportInput,
): Promise<WfhTeamReport> {
  const res = await api.post<WfhTeamReport>(`/admin/wfh/team-reports/${teamReportId}/reject`, input);
  return requireData(res.data, "rejectWfhTeamReport");
}

/**
 * GET /teams (op pinjaman, tag Organization) — daftar tim flat untuk dropdown,
 * tanpa permission gate; filter opsional `field_id`.
 */
export async function listTeams(fieldId?: number): Promise<TeamResource[]> {
  const params: Record<string, unknown> = {};
  if (fieldId !== undefined) params.field_id = fieldId;

  const res = await api.get<TeamResource[]>("/teams", Object.keys(params).length > 0 ? { params } : {});
  return requireData(res.data, "listTeams");
}