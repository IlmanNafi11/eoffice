/**
 * Test unit modul `@/api/wfh-team` (modul wfh-team-reports).
 * Mengunci kontrak 5 operasi `openapi.yaml` tag `WFH Team Reports` + 1 op
 * pinjaman `listTeams` (tag Organization): bentuk payload JSON, params query,
 * dan pemetaan envelope `ApiResponse::paginated` → `{ reports, meta }`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  listWfhTeamReports,
  createWfhTeamReport,
  approveWfhTeamReport,
  rejectWfhTeamReport,
  listTeams,
} from "@/api/wfh-team";
import { httpClient, setAuthToken } from "@/api/client";
import type { WfhTeamReport, TeamResource } from "@/api/types";

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
const created = (body: unknown) => queue.push({ status: 201, body });

const teamReport: WfhTeamReport = {
  id: 12,
  team_id: 3,
  report_date: "2025-07-11",
  status: "pending",
  created_by: 1,
};

const teamResource: TeamResource = {
  id: 3,
  name: "Tim Aplikasi Informatika",
  leader_id: 12,
  field_id: 1,
};

// Body JSON yang tiba di adapter: axios sudah serialize ke string.
function jsonBody(i = 0): unknown {
  const raw = requests[i]?.data;
  return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

describe("api/wfh-team — list (envelope paginated)", () => {
  it("listWfhTeamReports meneruskan per_page/page dan memetakan envelope paginated → { reports, meta }", async () => {
    ok({
      success: true,
      data: [teamReport],
      message: null,
      meta: { current_page: 2, last_page: 3, per_page: 15, total: 32 },
    });

    const out = await listWfhTeamReports({ per_page: 15, page: 2 });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/wfh/team-reports");
    expect(requests[0]?.params).toEqual({ per_page: 15, page: 2 });
    expect(out.reports).toEqual([teamReport]);
    expect(out.meta).toEqual({ current_page: 2, last_page: 3, per_page: 15, total: 32 });
  });

  it("listWfhTeamReports tanpa query mengirim tanpa params dan memetakan meta default", async () => {
    ok({
      success: true,
      data: [],
      message: null,
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 },
    });

    const out = await listWfhTeamReports();

    expect(requests[0]?.params).toBeUndefined();
    expect(out.reports).toEqual([]);
    expect(out.meta).toEqual({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  });
});

describe("api/wfh-team — create/approve/reject", () => {
  it("createWfhTeamReport mengirim JSON {team_id, report_date} dan melepas envelope", async () => {
    created({ success: true, data: teamReport, message: null, meta: null });

    const out = await createWfhTeamReport({ team_id: 3, report_date: "2025-07-11" });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/admin/wfh/team-reports");
    expect(jsonBody(0)).toEqual({ team_id: 3, report_date: "2025-07-11" });
    expect(out).toEqual(teamReport);
  });

  it("approveWfhTeamReport mengirim payload kosong dan melepas envelope", async () => {
    ok({
      success: true,
      data: { ...teamReport, status: "approved" },
      message: null,
      meta: null,
    });

    const out = await approveWfhTeamReport(12);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/admin/wfh/team-reports/12/approve");
    expect(requests[0]?.data).toBeUndefined();
    expect(out).toEqual({ ...teamReport, status: "approved" });
  });

  it("rejectWfhTeamReport mengirim JSON {reason} dan melepas envelope", async () => {
    ok({
      success: true,
      data: { ...teamReport, status: "rejected", reject_reason: "Data tidak lengkap" },
      message: null,
      meta: null,
    });

    const out = await rejectWfhTeamReport(12, { reason: "Data tidak lengkap" });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/admin/wfh/team-reports/12/reject");
    expect(jsonBody(0)).toEqual({ reason: "Data tidak lengkap" });
    expect(out).toEqual({ ...teamReport, status: "rejected", reject_reason: "Data tidak lengkap" });
  });
});

describe("api/wfh-team — listTeams (borrowed)", () => {
  it("listTeams mengembalikan TeamResource[] via envelope requireData", async () => {
    ok({ success: true, data: [teamResource], message: null, meta: null });

    const out = await listTeams();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/teams");
    expect(out).toEqual([teamResource]);
  });

  it("listTeams meneruskan field_id opsional", async () => {
    ok({ success: true, data: [teamResource], message: null, meta: null });

    await listTeams(1);

    expect(requests[0]?.params).toEqual({ field_id: 1 });
  });
});