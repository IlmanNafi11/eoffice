import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { api, httpClient, setAuthToken, getStoredToken, onUnauthorized } from "@/api/client";

type Recorded = { method?: string; url?: string; headers: AxiosHeaders };

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({ method: config.method, url: config.url, headers: AxiosHeaders.from(config.headers) });
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

const logoutSpy = vi.fn();
const assignSpy = vi.fn();

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  onUnauthorized(logoutSpy);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignSpy },
  });
  httpClient.defaults.adapter = fakeAdapter;
});

afterEach(() => {
  onUnauthorized(null);
  logoutSpy.mockClear();
  assignSpy.mockClear();
});

const ok = (body: unknown) => queue.push({ status: 200, body });

describe("api/client — instance & interceptor (frontend-phase1 / axios client)", () => {
  it("baseURL instance adalah '/api'", () => {
    expect(httpClient.defaults.baseURL).toBe("/api");
  });

  it("request interceptor menempelkan 'Authorization: Bearer <token>'", async () => {
    setAuthToken("tok-123");
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("tanpa token, header Authorization tidak dikirim", async () => {
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBeUndefined();
  });

  it("setAuthToken menyimpan ke localStorage dan setAuthToken(null) membersihkannya", () => {
    setAuthToken("tok-x");
    expect(getStoredToken()).toBe("tok-x");
    expect(window.localStorage.getItem("auth_token")).toBe("tok-x");
    setAuthToken(null);
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });

  it("token hasil rehydrate dari localStorage ikut terpakai sebagai Bearer", async () => {
    window.localStorage.setItem("auth_token", "tok-rehydrated");
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer tok-rehydrated");
  });

  it("response interceptor meng-unwrap envelope → data + message", async () => {
    ok({ success: true, data: { token: "t", user: { id: 1 } }, message: "Login berhasil." });
    const result = await api.post<{ token: string; user: { id: number } }>("/auth/login", { email: "a@b.c", password: "x" });
    expect(result.data).toEqual({ token: "t", user: { id: 1 } });
    expect(result.message).toBe("Login berhasil.");
    expect(result.meta).toBeNull();
  });

  it("unwrap: respons tanpa payload (logout) → data null, message tetap", async () => {
    ok({ success: true, data: null, message: "Logout berhasil." });
    const result = await api.post("/auth/logout");
    expect(result.data).toBeNull();
    expect(result.message).toBe("Logout berhasil.");
  });

  it("unwrap: meta pagination ikut diteruskan", async () => {
    ok({ success: true, data: [], message: null, meta: { current_page: 1, last_page: 3, per_page: 15, total: 40 } });
    const result = await api.get<unknown[]>("/admin/users");
    expect(result.meta).toEqual({ current_page: 1, last_page: 3, per_page: 15, total: 40 });
  });

  it("respons 200 dengan success:false → reject ApiError kind 'api'", async () => {
    ok({ success: false, message: "Gagal tak terduga." });
    const err = await api.get("/auth/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ kind: "api", message: "Gagal tak terduga." });
  });

  it("HTTP 422 → reject ApiError kind 'validation' dengan errors per field", async () => {
    queue.push({
      status: 422,
      body: { success: false, message: "The phone must not be greater than 20 characters.", errors: { phone: ["The phone must not be greater than 20 characters."] } },
    });
    const err = await api.put("/profile", { phone: "x".repeat(21) }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "validation", status: 422 });
    expect((err as { errors?: Record<string, string[]> }).errors?.phone?.[0]).toContain("20 characters");
  });

  it("HTTP 401 pada request bertoken → token dibersihkan, callback logout jalan, redirect '/login'", async () => {
    setAuthToken("leaked-token");
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });
    await expect(api.get("/auth/me")).rejects.toMatchObject({ kind: "http", status: 401 });
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem("auth_token")).toBeNull();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith("/login");
  });

  it("401 pada request tanpa token (login kredensial salah) TIDAK memicu logout/redirect", async () => {
    queue.push({ status: 401, body: { success: false, message: "Email atau password salah." } });
    await expect(api.post("/auth/login", { email: "a@b.c", password: "salah" })).rejects.toMatchObject({
      kind: "http",
      status: 401,
      message: "Email atau password salah.",
    });
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("error jaringan tanpa respons → ApiError kind 'network'", async () => {
    httpClient.defaults.adapter = (config) =>
      Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
    const err = await api.get("/auth/me").catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "network" });
  });
});
