/**
 * Test unit modul `@/api/wfh` (frontend-phase2 — Modul wfh-reports).
 * Mengunci kontrak 17 operasi `openapi.yaml`: payload JSON, params query,
 * multipart FormData keys, dan jalur blob PDF yang bypass unwrap.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  listWfhReports,
  createWfhReport,
  getWfhReport,
  updateWfhReportMetadata,
  deleteWfhReport,
  submitWfhReport,
  approveWfhReport,
  rejectWfhReport,
  reviseWfhReport,
  addReportActivity,
  updateReportActivity,
  deleteReportActivity,
  reorderReportActivities,
  addReportAttendance,
  deleteReportAttendance,
  exportWfhReportPdf,
  getWfhSessionConfig,
} from "@/api/wfh";
import { httpClient, setAuthToken } from "@/api/client";
import type { WfhReport, WfhReportActivity } from "@/api/types";

type Recorded = {
  method?: string;
  url?: string;
  headers: AxiosHeaders;
  params?: unknown;
  data?: unknown;
};

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({
    method: config.method,
    url: config.url,
    headers: AxiosHeaders.from(config.headers),
    params: config.params,
    data: config.data,
  });
  const next = queue.shift();
  if (!next) throw new Error("fakeAdapter: no queued response");
  const response = {
    status: next.status,
    statusText: next.status === 200 ? "OK" : "Error",
    data: next.body,
    headers: {},
    config,
  } as AxiosResponse;
  if (next.status >= 200 && next.status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, config, {}, response));
}

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  httpClient.defaults.adapter = fakeAdapter;
});

const ok = (body: unknown) => queue.push({ status: 200, body });
const created = (body: unknown) => queue.push({ status: 201, body });

const report: WfhReport = {
  id: 23,
  user_id: 1,
  report_date: "2025-07-11",
  status: "draft",
};

const activity: WfhReportActivity = {
  id: 67,
  activity: "Menyusun dokumentasi API modul WFH",
  start_time: "08:00",
  end_time: "10:00",
  sort_order: 1,
  links: [{ id: 89, url: "https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12" }],
};

// Body JSON yang tiba di adapter: axios sudah serialize ke string.
function jsonBody(i = 0): unknown {
  const raw = requests[i]?.data;
  return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

describe("api/wfh — list & read", () => {
  it("listWfhReports mengirim params date/month/per_page dan melepas envelope + meta", async () => {
    ok({
      success: true,
      data: [report],
      message: null,
      meta: { current_page: 1, last_page: 3, per_page: 15, total: 40 },
    });

    const result = await listWfhReports({ date: "2025-07-11", month: "2025-07", per_page: 15 });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/wfh/reports");
    expect(requests[0]?.params).toEqual({ date: "2025-07-11", month: "2025-07", per_page: 15 });
    expect(result.reports).toEqual([report]);
    expect(result.meta).toEqual({ current_page: 1, last_page: 3, per_page: 15, total: 40 });
  });

  it("listWfhReports tanpa filter → filter tidak ikut dikirim sebagai param kosong", async () => {
    ok({ success: true, data: [], message: null, meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 } });

    const result = await listWfhReports({});

    expect(requests[0]?.params).toBeUndefined();
    expect(result.reports).toEqual([]);
    expect(result.meta?.total).toBe(0);
  });

  it("getWfhReport GET /wfh/reports/{id} → requireData resource", async () => {
    ok({ success: true, data: report, message: null });

    const result = await getWfhReport(23);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/wfh/reports/23");
    expect(result).toEqual(report);
  });

  it("getWfhReport envelope tanpa data → gagal-nyata (requireData)", async () => {
    ok({ success: true, message: "Laporan tidak ditemukan.", data: null });

    await expect(getWfhReport(999)).rejects.toThrow(/tidak berisi data/);
  });
});

describe("api/wfh — create & metadata", () => {
  it("createWfhReport multipart: kunci FormData bertingkat sesuai parsing PHP backend", async () => {
    created({ success: true, data: report, message: "Laporan WFH berhasil dibuat." });

    const photo = new File(["jpg-bytes"], "pagi.jpg", { type: "image/jpeg" });
    const result = await createWfhReport({
      report_date: "2025-07-11",
      status: "draft",
      activities: [
        {
          activity: "Menyusun dokumentasi API modul WFH",
          start_time: "08:00",
          end_time: "10:00",
          links: ["https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12"],
        },
        { activity: "Review kode fitur change management" },
      ],
      attendances: { pagi: { photo } },
    });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/wfh/reports");
    const form = requests[0]?.data;
    expect(form).toBeInstanceOf(FormData);
    const fd = form as FormData;
    expect(fd.get("report_date")).toBe("2025-07-11");
    expect(fd.get("status")).toBe("draft");
    expect(fd.get("activities[0][activity]")).toBe("Menyusun dokumentasi API modul WFH");
    expect(fd.get("activities[0][start_time]")).toBe("08:00");
    expect(fd.get("activities[0][end_time]")).toBe("10:00");
    expect(fd.get("activities[0][links][0]")).toBe("https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12");
    expect(fd.get("activities[1][activity]")).toBe("Review kode fitur change management");
    expect(fd.get("activities[1][start_time]")).toBeNull();
    const uploaded = fd.get("attendances[pagi][photo]");
    expect(uploaded).toBeInstanceOf(File);
    expect((uploaded as File).name).toBe("pagi.jpg");
    expect(result).toEqual(report);
  });

  it("createWfhReport minimal: hanya report_date, tanpa key activities/attendances", async () => {
    created({ success: true, data: report, message: "Laporan WFH berhasil dibuat." });

    await createWfhReport({ report_date: "2025-07-11" });

    const fd = requests[0]?.data as FormData;
    expect(fd.get("report_date")).toBe("2025-07-11");
    expect(fd.get("status")).toBeNull();
    expect(fd.get("activities[0][activity]")).toBeNull();
    expect(fd.get("attendances[pagi][photo]")).toBeNull();
  });

  it("createWfhReport 422 validasi → ApiError kind 'validation'", async () => {
    queue.push({
      status: 422,
      body: { success: false, message: "The report date field is required.", errors: { report_date: ["The report date field is required."] } },
    });

    await expect(createWfhReport({ report_date: "" })).rejects.toMatchObject({ kind: "validation", status: 422 });
  });

  it("updateWfhReportMetadata PUT JSON {report_date} — metadata only", async () => {
    ok({ success: true, data: { ...report, report_date: "2025-07-12" }, message: "Laporan WFH berhasil diperbarui." });

    const result = await updateWfhReportMetadata(23, "2025-07-12");

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/wfh/reports/23");
    expect(jsonBody()).toEqual({ report_date: "2025-07-12" });
    expect(result.report_date).toBe("2025-07-12");
  });

  it("deleteWfhReport DELETE 200 ber-envelope → SUCCESS message, data null tak pecah", async () => {
    ok({ success: true, data: null, message: "Laporan WFH berhasil dihapus." });

    const message = await deleteWfhReport(23);

    expect(requests[0]?.method).toBe("delete");
    expect(requests[0]?.url).toBe("/wfh/reports/23");
    expect(message).toBe("Laporan WFH berhasil dihapus.");
  });
});

describe("api/wfh — transisi status", () => {
  it.each([
    ["submitWfhReport", submitWfhReport, "/wfh/reports/23/submit"],
    ["approveWfhReport", approveWfhReport, "/wfh/reports/23/approve"],
    ["reviseWfhReport", reviseWfhReport, "/wfh/reports/23/revise"],
  ])("%s POST tanpa body → requireData resource", async (_name, fn, url) => {
    ok({ success: true, data: { ...report, status: "pending" }, message: "Laporan berhasil disubmit untuk persetujuan." });

    const result = await fn(23);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe(url);
    expect(requests[0]?.data).toBeUndefined();
    expect(result.status).toBe("pending");
  });

  it("rejectWfhReport POST {reason} → requireData resource", async () => {
    ok({ success: true, data: { ...report, status: "rejected" }, message: "Laporan ditolak." });

    const result = await rejectWfhReport(23, "Rincian aktivitas kurang detail.");

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/wfh/reports/23/reject");
    expect(jsonBody()).toEqual({ reason: "Rincian aktivitas kurang detail." });
    expect(result.status).toBe("rejected");
  });
});

describe("api/wfh — sub-resource activities", () => {
  it("addReportActivity POST json {activity, times, links[url]} → ReportActivityResponse", async () => {
    created({ success: true, data: activity, message: "Kegiatan berhasil ditambahkan." });

    const result = await addReportActivity(23, {
      activity: "Menyusun dokumentasi API modul WFH",
      start_time: "08:00",
      end_time: "10:00",
      links: [{ url: "https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12" }],
    });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/wfh/reports/23/activities");
    expect(jsonBody()).toEqual({
      activity: "Menyusun dokumentasi API modul WFH",
      start_time: "08:00",
      end_time: "10:00",
      links: [{ url: "https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12" }],
    });
    expect(result.id).toBe(67);
    // Asimetri kontrak v6.0.0: sub-resource activity TIDAK mengirim sort_order di links.
    expect(result.links?.[0]?.sort_order).toBeUndefined();
  });

  it("updateReportActivity PUT json links id-diff {id?, url}", async () => {
    ok({ success: true, data: activity, message: "Kegiatan berhasil diperbarui." });

    const result = await updateReportActivity(23, 67, {
      activity: "Menyusun dokumentasi API modul WFH",
      start_time: "08:00",
      end_time: "11:00",
      links: [
        { id: 89, url: "https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12" },
        { url: "https://git.kominfo.go.id/intern/wfh-api/-/issues/34" },
      ],
    });

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/wfh/reports/23/activities/67");
    expect(jsonBody()).toEqual({
      activity: "Menyusun dokumentasi API modul WFH",
      start_time: "08:00",
      end_time: "11:00",
      links: [
        { id: 89, url: "https://git.kominfo.go.id/intern/wfh-api/-/merge_requests/12" },
        { url: "https://git.kominfo.go.id/intern/wfh-api/-/issues/34" },
      ],
    });
    expect(result.id).toBe(67);
  });

  it("deleteReportActivity DELETE → SUCCESS message", async () => {
    ok({ success: true, data: null, message: "Kegiatan berhasil dihapus." });

    const message = await deleteReportActivity(23, 67);

    expect(requests[0]?.method).toBe("delete");
    expect(requests[0]?.url).toBe("/wfh/reports/23/activities/67");
    expect(message).toBe("Kegiatan berhasil dihapus.");
  });

  it("reorderReportActivities PATCH {ids} urutan persis", async () => {
    ok({ success: true, data: null, message: "Urutan kegiatan berhasil diubah." });

    const message = await reorderReportActivities(23, { ids: [69, 67, 68] });

    expect(requests[0]?.method).toBe("patch");
    expect(requests[0]?.url).toBe("/wfh/reports/23/activities/reorder");
    expect(jsonBody()).toEqual({ ids: [69, 67, 68] });
    expect(message).toBe("Urutan kegiatan berhasil diubah.");
  });
});

describe("api/wfh — sub-resource attendances", () => {
  it("addReportAttendance multipart {session, photo} → AttendanceResponse", async () => {
    created({
      success: true,
      data: { id: 45, date: "2025-07-11", session: "pagi", photo_url: "http://localhost/api/wfh/reports/23/attendances/45/photo", check_in_at: "2025-07-11T08:15:30.000000Z" },
      message: "Absensi WFH berhasil.",
    });

    const photo = new File(["jpg-bytes"], "pagi.jpg", { type: "image/jpeg" });
    const result = await addReportAttendance(23, { session: "pagi", photo });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/wfh/reports/23/attendances");
    const fd = requests[0]?.data;
    expect(fd).toBeInstanceOf(FormData);
    expect((fd as FormData).get("session")).toBe("pagi");
    expect((fd as FormData).get("photo")).toBeInstanceOf(File);
    expect(result.id).toBe(45);
    expect(result.session).toBe("pagi");
  });

  it("deleteReportAttendance DELETE → SUCCESS message", async () => {
    ok({ success: true, data: null, message: "Absensi berhasil dihapus." });

    const message = await deleteReportAttendance(23, 45);

    expect(requests[0]?.method).toBe("delete");
    expect(requests[0]?.url).toBe("/wfh/reports/23/attendances/45");
    expect(message).toBe("Absensi berhasil dihapus.");
  });
});

describe("api/wfh — PDF & session config", () => {
  it("exportWfhReportPdf GET blob + bearer, bypass unwrap envelope", async () => {
    setAuthToken("tok-pdf");
    const pdfBlob = new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type: "application/pdf" });
    queue.push({ status: 200, body: pdfBlob });

    const blob = await exportWfhReportPdf(23);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/wfh/reports/23/pdf");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer tok-pdf");
    // Non-envelope: bytes PDF tidak di-unwrap — Blob apa adanya.
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
  });

  it("getWfhSessionConfig GET → requireData {sessions, allowed_days}", async () => {
    ok({ success: true, data: { sessions: ["pagi", "siang", "sore"], allowed_days: [1, 2, 3, 4, 5] }, message: null });

    const result = await getWfhSessionConfig();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/wfh/session-config");
    expect(result).toEqual({ sessions: ["pagi", "siang", "sore"], allowed_days: [1, 2, 3, 4, 5] });
  });
});
