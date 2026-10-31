/**
 * Unit test LoginPage (frontend-phase1 Phase 3, Slice 1).
 *
 * Kontrak yang dijaga (plan task "LoginPage", spec §Success Criteria 2):
 * - Form email + password; submit me-dispatch thunk `login` dengan input
 *   apa adanya (validasi kredensial murni urusan server).
 * - Error dari envelope (401 `Email atau password salah.`, 403 akun nonaktif,
 *   429 throttle) ditampilkan dari `auth.error` di store — bukan state lokal
 *   duplikat.
 * - Sukses → `navigate("/")`; `ProtectedRoute` yang memilah tujuan akhir:
 *   user biasa mendarat di `/`, user `must_change_password` dipaksa ke
 *   `/change-password` (spec §Resolved Questions 3).
 * - Link ke `/forgot-password` tersedia (alur Slice 3).
 *
 * Catatan: login tidak punya respons 422 (openapi.yaml: 200/401/403/429), jadi
 * tidak ada tampilan error per-field di sini — itu milik upload signature.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

import * as authApi from "@/api/auth";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginPage } from "@/pages/auth/LoginPage";
import { makeStore } from "@/store";
import type { AppStore } from "@/store";
import { AUTH_TOKEN_KEY } from "@/api/client";

/** User payload contoh sesuai `AuthUser` dari openapi.yaml. */
function userWith(mustChangePassword: boolean): AuthUser {
  return {
    id: 1,
    name: "Siti Staf",
    nip: "1111111111",
    email: "staf@kominfo.go.id",
    must_change_password: mustChangePassword,
    is_active: true,
    roles: ["staf"],
    permissions: ["wfh.report.create"],
  };
}

/**
 * Render LoginPage dengan store nyata. Route terlindungi memakai
 * `ProtectedRoute` sungguhan — dialah yang menentukan redirect akhir, jadi
 * test ini membuktikan rantai login → guard, bukan sekadar `navigate`.
 */
function renderLogin(initialPath = "/login"): AppStore {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<div>halaman lupa password</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>halaman terlindungi</div>} />
            <Route path="/change-password" element={<div>halaman change password</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

/** Isi form dan submit lewat tombol. */
async function submitLogin(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByTestId("login-submit"));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("LoginPage — render & struktur form", () => {
  it("menampilkan form email, password, tombol Masuk, dan link lupa password", () => {
    renderLogin();

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/password/i)).toBeTruthy();
    expect(screen.getByTestId("login-submit")).toBeTruthy();
    expect(screen.getByRole("link", { name: /lupa password/i })).toBeTruthy();
  });

  it("tidak menampilkan pesan error sebelum ada percobaan login", () => {
    renderLogin();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("LoginPage — submit", () => {
  it("me-dispatch thunk login dengan email & password dari form, lalu masuk ke halaman terlindungi", async () => {
    const mockLogin = vi.mocked(authApi.login);
    mockLogin.mockResolvedValueOnce({
      token: "tok-login",
      user: userWith(false),
    });

    const store = renderLogin();
    await submitLogin("staf@kominfo.go.id", "rahasia-aman");

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith({
      email: "staf@kominfo.go.id",
      password: "rahasia-aman",
    });
    // Token tersimpan: state store + localStorage (spec §Success Criteria 2).
    expect(await screen.findByText("halaman terlindungi")).toBeTruthy();
    expect(store.getState().auth.token).toBe("tok-login");
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("tok-login");
  });

  it("menonaktifkan tombol selagi request berjalan", async () => {
    const { promise, resolve } = Promise.withResolvers<{
      token: string;
      user: AuthUser;
    }>();
    vi.mocked(authApi.login).mockReturnValueOnce(promise);

    renderLogin();
    await submitLogin("staf@kominfo.go.id", "rahasia-aman");

    const button = screen.getByTestId("login-submit") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.queryByText("halaman terlindungi")).toBeNull();

    resolve({ token: "tok-slow", user: userWith(false) });
    expect(await screen.findByText("halaman terlindungi")).toBeTruthy();
  });

  it("menampilkan pesan error envelope (401 kredensial salah) dan tetap di /login", async () => {
    vi.mocked(authApi.login).mockRejectedValueOnce(
      Object.assign(new Error("Email atau password salah."), { kind: "http" }),
    );

    renderLogin();
    await submitLogin("staf@kominfo.go.id", "password-salah");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/email atau password salah/i)).toBeTruthy();
    // Gagal = tidak ada sesi: form login masih tampil, route terlindungi tidak.
    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.queryByText("halaman terlindungi")).toBeNull();
  });

  it("membersihkan pesan error lama begitu submit berikutnya dimulai", async () => {
    const retry = Promise.withResolvers<{ token: string; user: AuthUser }>();
    vi.mocked(authApi.login)
      .mockRejectedValueOnce(new Error("Email atau password salah."))
      .mockReturnValueOnce(retry.promise);

    renderLogin();
    await submitLogin("staf@kominfo.go.id", "password-salah");
    expect(await screen.findByText(/email atau password salah/i)).toBeTruthy();

    // Retry masih pending: alert harus sudah hilang (reducer `login.pending`
    // membersihkan `error`), bukan menunggu hasil sukses.
    await userEvent.setup().click(screen.getByTestId("login-submit"));
    expect(screen.queryByRole("alert")).toBeNull();

    retry.resolve({ token: "tok-retry", user: userWith(false) });
    expect(await screen.findByText("halaman terlindungi")).toBeTruthy();
  });
});

describe("LoginPage — redirect setelah sukses", () => {
  it("user dengan must_change_password dipaksa ke /change-password oleh guard", async () => {
    vi.mocked(authApi.login).mockResolvedValueOnce({
      token: "tok-must-change",
      user: userWith(true),
    });

    renderLogin();
    await submitLogin("staf@kominfo.go.id", "password-demo");

    expect(await screen.findByText("halaman change password")).toBeTruthy();
    expect(screen.queryByText("halaman terlindungi")).toBeNull();
  });
});

describe("LoginPage — link lupa password", () => {
  it("menuju /forgot-password", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("link", { name: /lupa password/i }));

    expect(screen.getByText("halaman lupa password")).toBeTruthy();
  });
});
