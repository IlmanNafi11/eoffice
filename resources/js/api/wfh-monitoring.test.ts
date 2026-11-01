/**
 * Test unit modul `@/api/wfh-monitoring` (modul wfh-monitoring).
 * Mengunci kontrak 3 operasi `openapi.yaml` tag `WFH Monitoring` +
 * `exportTeamWfhPdf` (tag `WFH Reports`): params query opsional hanya bila
 * terisi, pemetaan envelope `ApiResponse::paginated` → `{ reports, meta }`
 * (pola a78e547), dan blob PDF yang bypass unwrap interceptor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  getWfhMonitoring,
  adminListWfhReports,
  exportTeamWfhPdf,
} from "@/api/wfh-monitoring";
import { httpClient, setAuthToken } from "@/api/client";
import type {
  ListAdminReportsQuery,
  MonitoringUser,
  WfhReport,
} from "@/api/types";

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
  return Promise.reject(
    new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, config, {}, response),
  );
}

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  httpClient.defaults.adapter = fakeAdapter;
});

const ok = (body: unknown) => queue.push({ status: 200, body });

const staffA: MonitoringUser = {
  id: 7,
  name: "Budi Santoso",
  nip: "198005052005011003",
  email: "budi@example.go.id",
  is_active: true,
  team_id: 3,
  team: { id: 3, name: "Tim Aplikasi Informatika" },
};

const staffB: MonitoringUser = {
  id: 9,
  name: "Sari Dewi",
  nip: "199003032010012005",
  email: "sari@example.go.id",
  is_active: true,
  team_id: null,
  team: null,
};

const reportRow: WfhReport = {
  id: 21,
  user_id: 7,
  report_date: "2026-07-15",
  status: "approved",
  user: {
    id: 7,
    name: "Budi Santoso",
    nip: "198005052005011003",
    position: "Pranata Komputer",
    rank: "III/c",
  },
};

describe("api/wfh-monitoring — getWfhMonitoring (board)", () => {
  it("mengirim query {date, team_id, field_id} hanya bila terisi dan melepas envelope data", async () => {
    ok({
      success: true,
      data: {
        date: "2026-07-15",
        team_id: 3,
        field_id: null,
        not_checked_in: [staffA],
        no_report: [staffB],
      },
      message: null,
      meta: null,
    });

    const out = await getWfhMonitoring({ date: "2026-07-15", team_id: 3 });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/wfh/monitoring");
    expect(requests[0]?.params).toEqual({ date: "2026-07-15", team_id: 3 });
    expect(out.date).toBe("2026-07-15");
    expect(out.team_id).toBe(3);
    expect(out.field_id).toBeNull();
    expect(out.not_checked_in).toEqual([staffA]);
    expect(out.no_report).toEqual([staffB]);
  });

  it("tanpa query mengirim tanpa params; envelope tanpa data dianggap bug dan gagal", async () => {
    ok({ success: true, data: null, message: null, meta: null });

    await expect(getWfhMonitoring()).rejects.toThrow("getWfhMonitoring");
    expect(requests[0]?.params).toBeUndefined();
    expect(requests[0]?.url).toBe("/admin/wfh/monitoring");
  });

  it("properti query undefined tidak dikirim sama sekali", async () => {
    ok({
      success: true,
      data: {
        date: "2026-07-15",
        team_id: null,
        field_id: 1,
        not_checked_in: [],
        no_report: [],
      },
      message: null,
      meta: null,
    });

    await getWfhMonitoring({ date: "2026-07-15" });

    expect(requests[0]?.params).toEqual({ date: "2026-07-15" });
    expect(Object.keys(requests[0]?.params ?? {})).not.toContain("team_id");
  });
});

describe("api/wfh-monitoring — adminListWfhReports (envelope paginated)", () => {
  it("meneruskan semua filter terisi dan memetakan envelope → { reports, meta }", async () => {
    ok({
      success: true,
      data: [reportRow],
      message: null,
      meta: { current_page: 2, last_page: 5, per_page: 15, total: 71 },
    });

    const query: ListAdminReportsQuery = {
      per_page: 15,
      page: 2,
      status: "approved",
      team_id: 3,
      date_from: "2026-07-01",
      date_to: "2026-07-15",
    };
    const out = await adminListWfhReports(query);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/wfh/reports");
    expect(requests[0]?.params).toEqual(query);
    expect(out.reports).toEqual([reportRow]);
    expect(out.meta).toEqual({
      current_page: 2,
      last_page: 5,
      per_page: 15,
      total: 71,
    });
  });

  it("envelope tanpa meta → meta default aman (total 0, current_page 1)", async () => {
    ok({ success: true, data: [], message: null, meta: null });

    const out = await adminListWfhReports({ page: 1 });

    expect(out.reports).toEqual([]);
    expect(out.meta).toEqual({
      current_page: 1,
      last_page: 1,
      per_page: undefined,
      total: 0,
    });
  });

  it("per_page default (tidak di-set) tidak dikirim sebagai params", async () => {
    ok({ success: true, data: [], message: null, meta: null });

    await adminListWfhReports();

    expect(requests[0]?.params).toBeUndefined();
  });

  it("query dengan properti undefined tidak menyertakan key kosong", async () => {
    ok({ success: true, data: [], message: null, meta: null });

    await adminListWfhReports({ status: undefined, date: "2026-08-10" });

    expect(requests[0]?.params).toEqual({ date: "2026-08-10" });
  });
});

describe("api/wfh-monitoring — exportTeamWfhPdf (blob bypass unwrap)", () => {
  it("GET /admin/wfh/teams/{team}/pdf dengan responseType blob, bytes apa adunya", async () => {
    const pdf = new Blob(["%PDF-1.7 fake"], { type: "application/pdf" });
    queue.push({ status: 200, body: pdf });

    const out = await exportTeamWfhPdf(3, { date: "2026-07-15", team_report_id: 12 });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/wfh/teams/3/pdf");
    expect(requests[0]?.params).toEqual({ date: "2026-07-15", team_report_id: 12 });
    expect(out).toBeInstanceOf(Blob);
  });

  it("date tanpa team_report_id tetap mengirim date saja", async () => {
    const pdf = new Blob(["%PDF-1.7 fake"], { type: "application/pdf" });
    queue.push({ status: 200, body: pdf });

    await exportTeamWfhPdf(3, { date: "2026-07-15" });

    expect(requests[0]?.params).toEqual({ date: "2026-07-15" });
  });

  it("team_report_id nullable → tak dikirim bila undefined", async () => {
    const pdf = new Blob(["%PDF-1.7 fake"], { type: "application/pdf" });
    queue.push({ status: 200, body: pdf });

    await exportTeamWfhPdf(3);

    expect(requests[0]?.params).toBeUndefined();
    expect(requests[0]?.url).toBe("/admin/wfh/teams/3/pdf");
  });
});
