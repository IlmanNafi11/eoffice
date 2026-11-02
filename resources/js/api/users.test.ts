/**
 * Test unit modul `@/api/users` (Task 6 — picker evaluator).
 * Pola harness: `api/admin.test.ts` (fakeAdapter + queue envelope).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { listFieldUsers } from "@/api/users";
import { ApiError, httpClient, setAuthToken } from "@/api/client";
import type { PickerUser } from "@/api/types";

type Recorded = {
  method?: string;
  url?: string;
  headers: AxiosHeaders;
  params?: unknown;
};

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({
    method: config.method,
    url: config.url,
    headers: AxiosHeaders.from(config.headers),
    params: config.params,
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

const pickerUser: PickerUser = {
  id: 12,
  name: "Dewi Lestari",
  nip: "199503152024011002",
  team: { id: 3, name: "Tim Aplikasi Informatika" },
};

describe("api/users — listFieldUsers", () => {
  it("GET /users tanpa field_id; envelope dilepas → PickerUser[]", async () => {
    ok({ success: true, message: "Daftar user", data: [pickerUser] });

    const users = await listFieldUsers();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/users");
    expect(requests[0]?.params).toBeUndefined();
    expect(users).toEqual([pickerUser]);
  });

  it("field_id dikirim sebagai query param", async () => {
    ok({ success: true, message: "Daftar user", data: [] });
    await listFieldUsers({ field_id: 7 });

    expect(requests[0]?.url).toBe("/users");
    expect(requests[0]?.params).toEqual({ field_id: 7 });
    expect(queue.length).toBe(0);
  });

  it("data kosong → array kosong (aktor tanpa tim)", async () => {
    ok({ success: true, message: "Daftar user", data: [] });

    expect(await listFieldUsers()).toEqual([]);
  });

  it("failure envelope (success:false) → ApiError, bukan data", async () => {
    ok({ success: false, message: "Tidak diizinkan." });

    await expect(listFieldUsers()).rejects.toMatchObject({
      kind: "api",
      message: "Tidak diizinkan.",
    });
  });

  it("401/404 http → ApiError kind http", async () => {
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });

    await expect(listFieldUsers()).rejects.toBeInstanceOf(ApiError);
  });
});