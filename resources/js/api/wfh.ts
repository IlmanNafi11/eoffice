/**
 * Modul API domain WFH Reports (frontend-phase2 — modul wfh-reports).
 * Kontrak tunggal: `postman/specs/openapi.yaml` (tag `WFH Reports` + `WFH Settings`).
 *
 * 17 operasi terkonsumsi lewat helper `api` (unwrap + `ApiError`), KECUALI PDF
 * yang berjalan lewat `httpClient` langsung (`responseType: "blob"`) karena
 * responsnya binary non-envelope — lihat Resolved Question #2 pada SPEC.
 */
import { api, httpClient, requireData } from "@/api/client";
import type { PaginationMeta } from "@/api/types";
import {
  ActivityInput,
  ActivityUpdateInput,
  AttendanceUploadInput,
  CreateWfhReportInput,
  ListWfhReportsQuery,
  RejectReportRequest,
  ReorderInput,
  WfhReport,
  WfhReportActivity,
  WfhSession,
  WfhSessionConfig,
} from "@/api/types";

/**
 * `#/components/schemas/AttendanceResponse.data` — baris absensi yang baru
 * ditambahkan lewat POST sub-resource. Tidak terpapar sebagai `WfhAttendance`
 * (resource list dari resource utama berbeda bentuk: `date` + `check_in_at`).
 */
export interface WfhAttendanceUploaded {
  id: number;
  date: string;
  session: WfhSession;
  photo_url: string;
  check_in_at: string;
}

/** GET /wfh/reports — daftar paginated + meta dari `Unwrapped.meta`. */
export async function listWfhReports(query: ListWfhReportsQuery = {}): Promise<{
  reports: WfhReport[];
  meta: PaginationMeta | null;
}> {
  const params: Record<string, unknown> = {};
  if (query.date) params.date = query.date;
  if (query.month) params.month = query.month;
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;
  const res = await api.get<WfhReport[]>(
    "/wfh/reports",
    Object.keys(params).length > 0 ? { params } : {},
  );
  return { reports: res.data ?? [], meta: res.meta };
}

/** POST /wfh/reports — multipart (get-or-create; `status` draft default / submit). */
export async function createWfhReport(input: CreateWfhReportInput): Promise<WfhReport> {
  const form = buildStoreReportForm(input);
  const res = await api.postForm<WfhReport>("/wfh/reports", form);
  return requireData(res.data, "createWfhReport");
}

/** GET /wfh/reports/{report} — detail dengan `attendances`. */
export async function getWfhReport(reportId: number): Promise<WfhReport> {
  const res = await api.get<WfhReport>(`/wfh/reports/${reportId}`);
  return requireData(res.data, "getWfhReport");
}

/** PUT /wfh/reports/{report} — metadata only `{report_date}` (kontrak v6). */
export async function updateWfhReportMetadata(reportId: number, reportDate: string): Promise<WfhReport> {
  const res = await api.put<WfhReport>(`/wfh/reports/${reportId}`, { report_date: reportDate });
  return requireData(res.data, "updateWfhReportMetadata");
}

/** DELETE /wfh/reports/{report} — SuccessResponse tanpa `data`; kembalikan message. */
export async function deleteWfhReport(reportId: number): Promise<string> {
  const res = await api.del(`/wfh/reports/${reportId}`);
  return res.message ?? "";
}

/** POST /wfh/reports/{report}/submit. */
export async function submitWfhReport(reportId: number): Promise<WfhReport> {
  const res = await api.post<WfhReport>(`/wfh/reports/${reportId}/submit`);
  return requireData(res.data, "submitWfhReport");
}

/** POST /wfh/reports/{report}/approve. */
export async function approveWfhReport(reportId: number): Promise<WfhReport> {
  const res = await api.post<WfhReport>(`/wfh/reports/${reportId}/approve`);
  return requireData(res.data, "approveWfhReport");
}

/** POST /wfh/reports/{report}/reject — alasan wajib. */
export async function rejectWfhReport(reportId: number, reason: string): Promise<WfhReport> {
  const res = await api.post<WfhReport>(`/wfh/reports/${reportId}/reject`, { reason } satisfies RejectReportRequest);
  return requireData(res.data, "rejectWfhReport");
}

/** POST /wfh/reports/{report}/revise. */
export async function reviseWfhReport(reportId: number): Promise<WfhReport> {
  const res = await api.post<WfhReport>(`/wfh/reports/${reportId}/revise`);
  return requireData(res.data, "reviseWfhReport");
}

/** POST /wfh/reports/{report}/activities — tambah satu kegiatan (JSON). */
export async function addReportActivity(reportId: number, input: ActivityInput): Promise<WfhReportActivity> {
  const res = await api.post<WfhReportActivity>(`/wfh/reports/${reportId}/activities`, input);
  return requireData(res.data, "addReportActivity");
}

/** PUT /wfh/reports/{report}/activities/{activity} — links id-diff. */
export async function updateReportActivity(
  reportId: number,
  activityId: number,
  input: ActivityUpdateInput,
): Promise<WfhReportActivity> {
  const res = await api.put<WfhReportActivity>(`/wfh/reports/${reportId}/activities/${activityId}`, input);
  return requireData(res.data, "updateReportActivity");
}

/** DELETE /wfh/reports/{report}/activities/{activity}. */
export async function deleteReportActivity(reportId: number, activityId: number): Promise<string> {
  const res = await api.del(`/wfh/reports/${reportId}/activities/${activityId}`);
  return res.message ?? "";
}

/** PATCH /wfh/reports/{report}/activities/reorder — `{ids}` urutan persis. */
export async function reorderReportActivities(reportId: number, input: ReorderInput): Promise<string> {
  const res = await api.patch(`/wfh/reports/${reportId}/activities/reorder`, input);
  return res.message ?? "";
}

/** POST /wfh/reports/{report}/attendances — multipart `{session, photo}`. */
export async function addReportAttendance(
  reportId: number,
  input: AttendanceUploadInput,
): Promise<WfhAttendanceUploaded> {
  const form = new FormData();
  form.append("session", input.session);
  form.append("photo", input.photo);
  const res = await api.postForm<WfhAttendanceUploaded>(`/wfh/reports/${reportId}/attendances`, form);
  return requireData(res.data, "addReportAttendance");
}

/** DELETE /wfh/reports/{report}/attendances/{attendance}. */
export async function deleteReportAttendance(reportId: number, attendanceId: number): Promise<string> {
  const res = await api.del(`/wfh/reports/${reportId}/attendances/${attendanceId}`);
  return res.message ?? "";
}

/**
 * GET /wfh/reports/{report}/pdf — binary `application/pdf` (non-envelope).
 * Tidak melewati unwrap interceptor: ambil Blob langsung dari `httpClient`.
 */
export async function exportWfhReportPdf(reportId: number): Promise<Blob> {
  const res = await httpClient.get<Blob>(`/wfh/reports/${reportId}/pdf`, { responseType: "blob" });
  return res.data;
}

/** GET /wfh/session-config — sesi + hari boleh WFH (tanpa permission gate). */
export async function getWfhSessionConfig(): Promise<WfhSessionConfig> {
  const res = await api.get<WfhSessionConfig>("/wfh/session-config");
  return requireData(res.data, "getWfhSessionConfig");
}

/**
 * Susun FormData untuk `StoreReportRequest` (multipart). Kunci aktivitas
 * bertingkat (`activities[0][activity]`) dan foto sesi (`attendances[pagi][photo]`)
 * persis mengikuti cara parsing nested array/objek PHP (`StoreReportRequest`).
 */
function buildStoreReportForm(input: CreateWfhReportInput): FormData {
  const form = new FormData();
  form.append("report_date", input.report_date);
  if (input.status) form.append("status", input.status);
  (input.activities ?? []).forEach((activity, i) => {
    form.append(`activities[${i}][activity]`, activity.activity);
    if (activity.start_time) form.append(`activities[${i}][start_time]`, activity.start_time);
    if (activity.end_time) form.append(`activities[${i}][end_time]`, activity.end_time);
    (activity.links ?? []).forEach((url, j) => {
      form.append(`activities[${i}][links][${j}]`, url);
    });
  });
  for (const [session, entry] of Object.entries(input.attendances ?? {})) {
    if (entry?.photo) form.append(`attendances[${session}][photo]`, entry.photo);
  }
  return form;
}