/**
 * Test unit modul `@/api/dashboard` (modul dashboard).
 * Mengunci kontrak 1 operasi `openapi.yaml` tag `Dashboard`:
 * `GET /dashboard` (envelope `DashboardResponse`) → data ter-unwrap via
 * `requireData` (pola `getWfhMonitoring`); envelope tanpa `data` = bug
 * backend dan gagal-nyata, bukan `null` yang diam-diam dirender UI.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getDashboard } from "@/api/dashboard";
import { httpClient, setAuthToken } from "@/api/client";
import type { DashboardData } from "@/api/types";

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

/** Fixture lengkap: semua seksi terisi (shape final OpenAPI Task 1). */
const dashboardData: DashboardData = {
  generated_at: "2026-11-24T09:14:00+07:00",
  today: {
    is_workday: true,
    me: {
      attendance: { sessions_done: 2, sessions_total: 3, next_session: "sore" },
      report: { status: "pending", report_id: 123 },
    },
    scope: {
      label: "Bidang",
      users_total: 12,
      absent: 3,
      no_report: 5,
      team_reports_pending: 2,
    },
  },
  queue: {
    change_initiations_pending: { count: 5 },
    implementations_review: { count: 2 },
    team_reports_pending: { count: 2 },
  },
  trend: {
    days: [{ date: "2026-11-03", compliant: 9, total: 12 }],
    summary: { compliant: 118, total: 140 },
  },
  attention: {
    users: [{ user_id: 7, name: "Siti", team: "Tim A", compliant: 5, total: 12 }],
    threshold_note: "kepatuhan < 60% dalam 14 hari kerja terakhir",
  },
};

describe("getDashboard", () => {
  it("memanggil GET /dashboard dan mengembalikan data ter-unwrap", async () => {
    ok({ success: true, data: dashboardData, message: null, meta: null });

    const result = await getDashboard();

    expect(requests[0]!.method).toBe("get");
    expect(requests[0]!.url).toBe("/dashboard");
    expect(result).toEqual(dashboardData);
  });

  it("envelope tanpa data gagal-nyata (requireData), bukan null diam-diam", async () => {
    ok({ success: true, data: null, message: null, meta: null });

    await expect(getDashboard()).rejects.toThrow("getDashboard");
  });
});
