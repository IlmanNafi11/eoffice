/**
 * Unit test store/authSlice (frontend-phase1).
 * Reducer + thunks diuji dengan mock modul `@/api/auth` (vi.mock) sehingga
 * tidak ada network. Kontrak yang dijaga: token persist ke localStorage saat
 * login, dibersihkan saat logout/401, dan flag `must_change_password` turun
 * setelah change-password sukses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { AxiosError } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import type { AuthUser } from "@/api/types";

vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  me: vi.fn(),
  changePassword: vi.fn(),
  forgotPassword: vi.fn(),
  verifyOtp: vi.fn(),
  resetPassword: vi.fn(),
}));

import { httpClient, AUTH_TOKEN_KEY } from "@/api/client";
import * as authApi from "@/api/auth";
import {
  authReducer,
  setToken,
  setUser,
  clearToken,
  login,
  logout,
  fetchMe,
  changePassword,
  verifyOtp,
  selectAuth,
  selectToken,
  selectUser,
} from "@/store/authSlice";
import { makeStore } from "@/store";

const mockedLogin = authApi.login as unknown as Mock;
const mockedLogout = authApi.logout as unknown as Mock;
const mockedMe = authApi.me as unknown as Mock;
const mockedChange = authApi.changePassword as unknown as Mock;
const mockedVerify = authApi.verifyOtp as unknown as Mock;

const user: AuthUser = {
  id: 1,
  name: "Rover",
  nip: "19800101 200501 1 001",
  email: "rover@eoffice.test",
  rank: "III/a",
  position: "Staf",
  phone: "08123",
  signature_path: null,
  signature_url: null,
  must_change_password: true,
  is_active: true,
  roles: ["admin"],
  permissions: ["profile.view"],
  team: null,
};

const seeded = () => authReducer(undefined, { type: "@@INIT" });

describe("authSlice — reducers", () => {
  it("state awal bersih: token null, user null, status idle, error null", () => {
    const state = seeded();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
  });

  it("setToken menyimpan token tanpa menyentuh user", () => {
    const state = authReducer(authReducer(undefined, setUser(user)), setToken("tok-1"));
    expect(state.token).toBe("tok-1");
    expect(state.user).toEqual(user);
  });

  it("clearToken membuang token, user, error, dan mengembalikan status idle", () => {
    let state = authReducer(undefined, setToken("tok-1"));
    state = authReducer(state, setUser(user));
    state = authReducer(state, { type: "auth/login/rejected", error: { message: "boom" } });
    state = authReducer(state, clearToken());

    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
    expect(state.status).toBe("idle");
  });
});

describe("authSlice — thunks", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("login sukses menyimpan token+user dan mem-persist token ke localStorage", async () => {
    mockedLogin.mockResolvedValueOnce({ token: "tok-abc", user });
    const store = makeStore();

    await store.dispatch(login({ email: "rover@eoffice.test", password: "secret" }));

    const state = selectAuth(store.getState());
    expect(state.status).toBe("succeeded");
    expect(selectToken(store.getState())).toBe("tok-abc");
    expect(selectUser(store.getState())).toEqual(user);
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("tok-abc");
  });

  it("login gagal mencatat pesan error tanpa menyimpan token", async () => {
    mockedLogin.mockRejectedValueOnce(new Error("Kredensial salah"));
    const store = makeStore();

    await store.dispatch(login({ email: "rover@eoffice.test", password: "wrong" }));

    const state = selectAuth(store.getState());
    expect(state.status).toBe("failed");
    expect(state.error).toBe("Kredensial salah");
    expect(state.token).toBeNull();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("logout membersihkan state meski request revoke gagal", async () => {
    mockedLogin.mockResolvedValueOnce({ token: "tok-abc", user });
    const store = makeStore();
    await store.dispatch(login({ email: "rover@eoffice.test", password: "secret" }));

    mockedLogout.mockRejectedValueOnce(new Error("network"));
    await store.dispatch(logout());

    expect(selectToken(store.getState())).toBeNull();
    expect(selectUser(store.getState())).toBeNull();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("fetchMe menimpa user dari server", async () => {
    mockedMe.mockResolvedValueOnce({ ...user, position: "Kabag" });
    const store = makeStore();

    await store.dispatch(fetchMe());

    expect(selectUser(store.getState())?.position).toBe("Kabag");
  });

  it("changePassword sukses menurunkan flag must_change_password", async () => {
    mockedLogin.mockResolvedValueOnce({ token: "tok-abc", user });
    const store = makeStore();
    await store.dispatch(login({ email: "rover@eoffice.test", password: "secret" }));
    expect(selectUser(store.getState())?.must_change_password).toBe(true);

    mockedChange.mockResolvedValueOnce(undefined);
    await store.dispatch(
      changePassword({ current_password: "a", new_password: "b", new_password_confirmation: "b" }),
    );

    expect(selectUser(store.getState())?.must_change_password).toBe(false);
  });

  it("verifyOtp mengembalikan reset_token ke pemanggil", async () => {
    mockedVerify.mockResolvedValueOnce({ reset_token: "reset-123" });
    const store = makeStore();

    const result = await store.dispatch(
      verifyOtp({ email: "rover@eoffice.test", code: "123456" }),
    );

    expect(result.payload).toEqual({ reset_token: "reset-123" });
  });
});

describe("store — rehydrate & 401", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("token tersimpan di localStorage dipakai sebagai state awal", () => {
    window.localStorage.setItem(AUTH_TOKEN_KEY, "tok-stored");
    const store = makeStore();
    expect(selectToken(store.getState())).toBe("tok-stored");
  });

  it("401 dari server membersihkan sesi dan mengarahkan ke /login", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    const store = makeStore();
    mockedLogin.mockResolvedValueOnce({ token: "tok-abc", user });
    await store.dispatch(login({ email: "rover@eoffice.test", password: "secret" }));
    expect(selectToken(store.getState())).toBe("tok-abc");

    // Adapter palsu: setiap request dibalas 401.
    httpClient.defaults.adapter = (config: InternalAxiosRequestConfig) =>
      Promise.reject(
        new AxiosError(
          "Unauthorized",
          AxiosError.ERR_BAD_REQUEST,
          config,
          {},
          {
            status: 401,
            statusText: "Unauthorized",
            data: { success: false, message: "Unauthenticated." },
            headers: {},
            config,
          } as AxiosResponse,
        ),
      );

    await expect(httpClient.get("/auth/me")).rejects.toBeTruthy();

    expect(selectToken(store.getState())).toBeNull();
    expect(selectUser(store.getState())).toBeNull();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
