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
import { api, requireData, Messaged } from "@/api/client";
import {
  CreateTeamReportInput,
  ListTeamReportsQuery,
  PaginationMeta,
  RejectTeamReportInput,
  TeamResource,
  WfhTeamReport,
  WfhTeamReportDetail,
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
  if (query.status !== undefined) params.status = query.status;
  if (query.date_from !== undefined) params.date_from = query.date_from;
  if (query.date_to !== undefined) params.date_to = query.date_to;
  if (query.team_id !== undefined) params.team_id = query.team_id;
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

/**
 * GET /admin/wfh/team-reports/{id} — envelope `ApiResponse::ok` `{data}`;
 * detail = header laporan + `members[]` live per anggota aktif tim
 * (openapi `getWfhTeamReport`, modul wfh-team-report-detail).
 */
export async function getWfhTeamReport(teamReportId: number): Promise<WfhTeamReportDetail> {
  const res = await api.get<WfhTeamReportDetail>(`/admin/wfh/team-reports/${teamReportId}`);
  return requireData(res.data, "getWfhTeamReport");
}

/** POST /admin/wfh/team-reports — server memaksa `status=pending` + `created_by`. */
export async function createWfhTeamReport(
  input: CreateTeamReportInput,
): Promise<Messaged<WfhTeamReport>> {
  const res = await api.post<WfhTeamReport>("/admin/wfh/team-reports", input);
  return { ...requireData(res.data, "createWfhTeamReport"), message: res.message ?? "" };
}

/** POST /admin/wfh/team-reports/{id}/approve — payload kosong. */
export async function approveWfhTeamReport(
  teamReportId: number,
): Promise<Messaged<WfhTeamReport>> {
  const res = await api.post<WfhTeamReport>(`/admin/wfh/team-reports/${teamReportId}/approve`);
  return { ...requireData(res.data, "approveWfhTeamReport"), message: res.message ?? "" };
}

/** POST …/reject — alasan wajib (kontrak `RejectTeamReportRequest`). */
export async function rejectWfhTeamReport(
  teamReportId: number,
  input: RejectTeamReportInput,
): Promise<Messaged<WfhTeamReport>> {
  const res = await api.post<WfhTeamReport>(`/admin/wfh/team-reports/${teamReportId}/reject`, input);
  return { ...requireData(res.data, "rejectWfhTeamReport"), message: res.message ?? "" };
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