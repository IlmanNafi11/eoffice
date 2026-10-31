/**
 * Unit test ChangePasswordPage (frontend-phase1 Phase 3, Slice 4, plan task
 * "ChangePasswordPage").
 *
 * Kontrak yang dijaga:
 * - Form current/new/confirm; submit me-dispatch thunk `changePassword`
 *   dengan input apa adanya (validasi min-8 & konfirmasi murni urusan server,
 *   422 → pesan envelope via `auth.error`).
 * - Sukses → flag `must_change_password` turun (reducer) → navigasi `/`.
 * - Halaman bisa dijangkau saat guard must_change aktif; test membuktikan
 *   guard TIDAK memblokir `/change-password` (render di dalam ProtectedRoute).
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
import { ChangePasswordPage } from "@/pages/auth/ChangePasswordPage";
import { makeStore } from "@/store";
import type { AppStore } from "@/store";
import { setToken, setUser } from "@/store/authSlice";

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

/** Render di dalam ProtectedRoute sungguhan — membuktikan guard membiarkan /change-password. */
function renderChangePassword(store: AppStore, user: AuthUser | null): void {
  store.dispatch(setToken("tok-cp"));
  if (user) store.dispatch(setUser(user));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/change-password"]}>
        <Routes>
          <Route path="/login" element={<div data-testid="route-login">halaman login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/" element={<div data-testid="route-home">halaman beranda</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

async function submitForm(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/password saat ini/i), current);
  await user.type(screen.getByLabelText(/^password baru$/i), next);
  await user.type(screen.getByLabelText(/konfirmasi password baru/i), confirm);
  await user.click(screen.getByTestId("change-password-submit"));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ChangePasswordPage — render", () => {
  it("terjangkau saat must_change_password aktif (guard tidak memblokir)", () => {
    const store = makeStore();
    renderChangePassword(store, userWith(true));
    expect(screen.getByTestId("change-password-submit")).toBeTruthy();
  });

  it("tidak menampilkan error sebelum submit", () => {
    const store = makeStore();
    renderChangePassword(store, userWith(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ChangePasswordPage — submit", () => {
  it("me-dispatch changePassword dengan current/new/confirmation; sukses → / dan flag turun", async () => {
    vi.mocked(authApi.changePassword).mockResolvedValueOnce(undefined);
    const store = makeStore();
    renderChangePassword(store, userWith(true));

    await submitForm("lama-aman-8", "baru-aman-8", "baru-aman-8");

    expect(authApi.changePassword).toHaveBeenCalledTimes(1);
    expect(authApi.changePassword).toHaveBeenCalledWith({
      current_password: "lama-aman-8",
      new_password: "baru-aman-8",
      new_password_confirmation: "baru-aman-8",
    });
    expect(await screen.findByTestId("route-home")).toBeTruthy();
    expect(store.getState().auth.user?.must_change_password).toBe(false);
  });

  it("menampilkan error envelope (422 password saat ini salah) dan tetap di halaman", async () => {
    vi.mocked(authApi.changePassword).mockRejectedValueOnce(
      new Error("Password saat ini tidak sesuai."),
    );
    const store = makeStore();
    renderChangePassword(store, userWith(false));

    await submitForm("salah-banget", "baru-aman-8", "baru-aman-8");

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/password saat ini tidak sesuai/i)).toBeTruthy();
    expect(screen.getByTestId("change-password-submit")).toBeTruthy();
    expect(store.getState().auth.user?.must_change_password).toBe(false);
  });

  it("mengosongkan error lama saat submit berikutnya dimulai", async () => {
    const retry = Promise.withResolvers<void>();
    vi.mocked(authApi.changePassword)
      .mockRejectedValueOnce(new Error("Password saat ini tidak sesuai."))
      .mockReturnValueOnce(retry.promise);
    const store = makeStore();
    renderChangePassword(store, userWith(false));

    await submitForm("salah-banget", "baru-aman-8", "baru-aman-8");
    expect(await screen.findByRole("alert")).toBeTruthy();

    await userEvent.setup().click(screen.getByTestId("change-password-submit"));
    expect(screen.queryByRole("alert")).toBeNull();

    retry.resolve();
  });
});
