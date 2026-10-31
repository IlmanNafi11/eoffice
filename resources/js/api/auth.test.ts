/**
 * Test unit modul `@/api/auth` (frontend-phase1 — Modul auth & profile).
 * Memakai fake adapter axios (pola sama dengan api/client.test.ts):
 * memverifikasi method, path, payload, dan efek samping token.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  login,
  logout,
  me,
  changePassword,
  forgotPassword,
  verifyOtp,
  resetPassword,
} from "@/api/auth";
import { httpClient, setAuthToken, getStoredToken } from "@/api/client";
import type { AuthUser, LoginResponse } from "@/api/types";

type Recorded = { method?: string; url?: string; body?: unknown; headers: AxiosHeaders };

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({
    method: config.method,
    url: config.url,
    // axios sudah serialize JSON ke string saat tiba di adapter.
    body: typeof config.data === "string" ? (JSON.parse(config.data) as unknown) : config.data,
    headers: AxiosHeaders.from(config.headers),
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

const user: AuthUser = {
  id: 1,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  phone: "081234567890",
  signature_path: null,
  signature_url: null,
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.report.create"],
  team: null,
  must_change_password: false,
};

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  httpClient.defaults.adapter = fakeAdapter;
});

afterEach(() => {
  setAuthToken(null);
});

const ok = (body: unknown) => queue.push({ status: 200, body });

describe("api/auth — endpoint & unwrap (frontend-phase1)", () => {
  it("login POST /auth/login, simpan token, kembalikan {token, user}", async () => {
    const payload: LoginResponse = { token: "tok-1", user };
    ok({ success: true, data: payload, message: "Login berhasil." });

    const result = await login({ email: "budi@kominfo.go.id", password: "rahasia123" });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/login");
    expect(requests[0]?.body).toEqual({ email: "budi@kominfo.go.id", password: "rahasia123" });
    expect(result).toEqual(payload);
    expect(getStoredToken()).toBe("tok-1");
  });

  it("login gagal (401) melempar ApiError dan tidak menyimpan token", async () => {
    queue.push({ status: 401, body: { success: false, message: "Email atau password salah." } });

    await expect(login({ email: "budi@kominfo.go.id", password: "salah" })).rejects.toMatchObject({
      kind: "http",
      status: 401,
      message: "Email atau password salah.",
    });
    expect(getStoredToken()).toBeNull();
  });

  it("me GET /auth/me tanpa mengubah token", async () => {
    setAuthToken("tok-me");
    ok({ success: true, data: user, message: null });

    const result = await me();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/auth/me");
    expect(result).toEqual(user);
    expect(getStoredToken()).toBe("tok-me");
  });

  it("logout POST /auth/logout dan membersihkan token", async () => {
    setAuthToken("tok-out");
    ok({ success: true, data: null, message: "Logout berhasil." });

    await logout();

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/logout");
    expect(getStoredToken()).toBeNull();
  });

  it("logout tetap membersihkan token walau server menolak (401)", async () => {
    setAuthToken("tok-stale");
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });

    await expect(logout()).rejects.toMatchObject({ kind: "http", status: 401 });
    expect(getStoredToken()).toBeNull();
  });

  it("changePassword POST /auth/change-password dengan payload lengkap", async () => {
    ok({ success: true, data: null, message: "Password berhasil diubah." });

    await changePassword({
      current_password: "lama123",
      new_password: "baru12345",
      new_password_confirmation: "baru12345",
    });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/change-password");
    expect(requests[0]?.body).toEqual({
      current_password: "lama123",
      new_password: "baru12345",
      new_password_confirmation: "baru12345",
    });
  });

  it("forgotPassword POST /auth/forgot-password", async () => {
    ok({ success: true, data: null, message: "Kode OTP dikirim." });

    await forgotPassword({ email: "budi@kominfo.go.id" });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/forgot-password");
    expect(requests[0]?.body).toEqual({ email: "budi@kominfo.go.id" });
  });

  it("verifyOtp POST /auth/verify-otp mengembalikan reset_token", async () => {
    ok({ success: true, data: { reset_token: "rst-9" }, message: "OTP valid." });

    const result = await verifyOtp({ email: "budi@kominfo.go.id", code: "123456" });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/verify-otp");
    expect(requests[0]?.body).toEqual({ email: "budi@kominfo.go.id", code: "123456" });
    expect(result).toEqual({ reset_token: "rst-9" });
  });

  it("resetPassword POST /auth/reset-password dengan reset_token", async () => {
    ok({ success: true, data: null, message: "Password berhasil diatur. Silakan login." });

    await resetPassword({
      reset_token: "a".repeat(60),
      new_password: "baru12345",
      new_password_confirmation: "baru12345",
    });

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/auth/reset-password");
    expect(requests[0]?.body).toEqual({
      reset_token: "a".repeat(60),
      new_password: "baru12345",
      new_password_confirmation: "baru12345",
    });
  });

  it("envelope tanpa data pada endpoint yang menjamin data → gagal-nyata (requireData)", async () => {
    // Envelope success:true tanpa `data` = bug backend; UI tidak boleh
    // menerima `null` diam-diam (ship review: guard paling murah).
    ok({ success: true, message: "Login berhasil.", data: null });
    await expect(
      login({ email: "budi@kominfo.go.id", password: "rahasia123" }),
    ).rejects.toThrow(/tidak berisi data/);
    expect(getStoredToken()).toBeNull();

    ok({ success: true, message: "OK", data: null });
    await expect(me()).rejects.toThrow(/tidak berisi data/);

    ok({ success: true, message: "OK", data: null });
    await expect(
      verifyOtp({ email: "budi@kominfo.go.id", code: "123456" }),
    ).rejects.toThrow(/tidak berisi data/);
  });
});
