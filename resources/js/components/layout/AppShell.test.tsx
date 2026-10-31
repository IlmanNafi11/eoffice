/**
 * Render test AppShell (Sidebar + Header + Outlet) — frontend-phase1 Phase 2.
 *
 * Kontrak yang dijaga (spec §Success Criteria 3, §Boundaries):
 * - Sidebar HANYA membaca `NAV_REGISTRY` + `visibleNav(user)` — tidak ada
 *   hardcode role name di komponen.
 * - Menu berbeda antar role murni dari payload permission.
 * - Header menampilkan nama user; tombol keluar men-dispatch `logout`
 *   (POST /auth/logout) dan membersihkan state sesi.
 * - Logout di dalam ProtectedRoute yang sesungguhnya → token null → guard
 *   memindahkan route ke /login (komposit guard+header, ship review gap).
 * - Saat `user` belum termuat, header menampilkan tombol "Keluar" polos
 *   (bukan dropdown) tanpa crash.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
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
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { makeStore } from "@/store";
import { selectToken, selectUser, setToken, setUser } from "@/store/authSlice";
import { AUTH_TOKEN_KEY } from "@/api/client";

const mockedLogout = authApi.logout as unknown as Mock;

/**
 * Permission di bawah disalin dari `database/seeders/RolePermissionSeeder.php`
 * (sumber kebenaran RBAC); subset yang menentukan isi sidebar saja. Kelengkapan
 * daftar per role dijaga `lib/permissions.test.ts`.
 */
const STAF_PERMISSIONS = [
  "wfh.report.create",
  "wfh.report.update",
  "wfh.report.submit",
  "change.initiation.view",
  "change.implementation.view",
];

const KEPALA_BIDANG_PERMISSIONS = [
  "wfh.report.create",
  "wfh.report.approve",
  "wfh.monitoring.view",
  "wfh.team_report.view",
  "wfh.team_report.approve",
  "change.initiation.view",
];

function userWith(roles: string[], permissions: string[]): AuthUser {
  return {
    id: 1,
    name: "Budi Santoso",
    nip: "199001012023011001",
    email: "budi@kominfo.go.id",
    position: "Staf Bidang Infrastruktur",
    must_change_password: false,
    is_active: true,
    roles,
    permissions,
  };
}

/** Render AppShell dengan satu route anak nyata sebagai outlet. */
function renderShell(user: AuthUser) {
  const store = makeStore();
  store.dispatch(setToken("tok-shell"));
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<div>halaman outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

describe("AppShell — Sidebar dinamis dari NAV_REGISTRY", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("me-render outlet di dalam shell", () => {
    renderShell(userWith(["staf"], STAF_PERMISSIONS));

    expect(screen.getByText("halaman outlet")).toBeTruthy();
  });

  it("menampilkan menu umum (Beranda, WFH, Profil) untuk staf", () => {
    renderShell(userWith(["staf"], STAF_PERMISSIONS));

    expect(screen.getByRole("link", { name: /beranda/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /^wfh$/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /profil saya/i })).toBeTruthy();
  });

  it("tidak menampilkan menu monitoring/manajemen user untuk staf", () => {
    renderShell(userWith(["staf"], STAF_PERMISSIONS));

    expect(screen.queryByRole("link", { name: /monitoring/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /manajemen user/i })).toBeNull();
  });

  it("menampilkan menu monitoring untuk kepala bidang sesuai permission", () => {
    renderShell(userWith(["kepala_bidang"], KEPALA_BIDANG_PERMISSIONS));

    expect(screen.getByRole("link", { name: /monitoring wfh/i })).toBeTruthy();
    // Role tanpa permission tetap tidak melihat menu admin.
    expect(screen.queryByRole("link", { name: /manajemen user/i })).toBeNull();
  });

  it("memfilter per item, bukan menyembunyikan seluruh sidebar", () => {
    renderShell(userWith(["staf"], ["profile.view"]));

    expect(screen.queryByRole("link", { name: /^wfh$/i })).toBeNull();
    expect(screen.getByRole("link", { name: /profil saya/i })).toBeTruthy();
  });
});

describe("AppShell — Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("menampilkan nama dan jabatan user", () => {
    renderShell(userWith(["staf"], STAF_PERMISSIONS));

    expect(screen.getByText(/budi santoso/i)).toBeTruthy();
    expect(screen.getByText(/staf bidang infrastruktur/i)).toBeTruthy();
  });

  it("tombol keluar me-revoke sesi dan membersihkan token", async () => {
    mockedLogout.mockResolvedValueOnce(undefined);
    const store = renderShell(userWith(["staf"], STAF_PERMISSIONS));
    expect(selectToken(store.getState())).toBe("tok-shell");

    await userEvent.click(screen.getByTestId("user-menu"));
    await userEvent.click(screen.getByRole("menuitem", { name: /keluar/i }));

    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(selectToken(store.getState())).toBeNull();
    expect(selectUser(store.getState())).toBeNull();
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it("logout di dalam guard memindahkan route ke /login (composite)", async () => {
    mockedLogout.mockResolvedValueOnce(undefined);
    const store = makeStore();
    store.dispatch(setToken("tok-shell"));
    store.dispatch(setUser(userWith(["staf"], STAF_PERMISSIONS)));

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<div data-testid="route-login">halaman login</div>} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route index element={<div>halaman outlet</div>} />
              </Route>
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await userEvent.click(screen.getByTestId("user-menu"));
    await userEvent.click(screen.getByRole("menuitem", { name: /keluar/i }));

    // Guard membaca token null → redirect ke /login.
    expect(await screen.findByTestId("route-login")).toBeTruthy();
  });

  it("header menampilkan tombol keluar placeholder saat user belum termuat (tanpa crash)", async () => {
    const store = makeStore();
    store.dispatch(setToken("tok-shell"));

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<div>halaman outlet</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    // Header user-null menampilkan tombol "Keluar" polos (bukan dropdown).
    const keluar = screen.getByRole("button", { name: /keluar/i });
    expect(keluar).toBeTruthy();
    mockedLogout.mockResolvedValueOnce(undefined);
    await userEvent.click(keluar);
    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });
});