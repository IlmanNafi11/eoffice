/**
 * Unit test ProtectedRoute (frontend-phase1 Phase 2, Slice 2).
 *
 * Kontrak yang dijaga (spec §Resolved Questions 3, plan Phase 2):
 * - Token kosong (belum login / sudah 401) → redirect ke `/login`.
 * - `must_change_password: true` → semua route diblokir KECUALI
 *   `/change-password`; user dipaksa ke sana.
 * - Token ada + flag false → konten anak dirender normal.
 *
 * Sesi disimulasikan lewat store (`setToken`/`setUser`) — tidak ada network;
 * modul `@/api/auth` di-mock mengikuti konvensi test lain.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { makeStore } from "@/store";
import type { AppStore } from "@/store";
import { setToken, setUser } from "@/store/authSlice";

function userWith(mustChangePassword: boolean): AuthUser {
  return {
    id: 1,
    name: "Budi Santoso",
    nip: "199001012023011001",
    email: "budi@kominfo.go.id",
    must_change_password: mustChangePassword,
    is_active: true,
    roles: ["staf"],
    permissions: [],
  };
}

/** Sesi: token + user (opsional — segmen user-null diuji terpisah). */
function renderGuarded(
  initialPath: string,
  opts: { token?: string | null; user?: AuthUser | null } = {},
): AppStore {
  const store = makeStore();
  if (opts.token !== null) store.dispatch(setToken(opts.token ?? "tok-guard"));
  if (opts.user !== null) {
    store.dispatch(setUser(opts.user ?? userWith(false)));
  }

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          {/* Route login netral — hanya penanda lokasi redirect. */}
          <Route path="/login" element={<div>halaman login</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>halaman terlindungi</div>} />
            <Route path="/profil" element={<div>halaman profil</div>} />
            {/* Di dalam guard: user dengan flag wajib boleh mendarat di sini. */}
            <Route
              path="/change-password"
              element={<div>halaman change password</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("ProtectedRoute — guard sesi", () => {
  it("me-redirect ke /login saat token kosong", () => {
    renderGuarded("/", { token: null });

    expect(screen.getByText("halaman login")).toBeTruthy();
    expect(screen.queryByText("halaman terlindungi")).toBeNull();
  });

  it("me-redirect ke /login saat sesi sudah dibersihkan oleh 401 (token null, user tertinggal)", () => {
    // Interceptor 401 menghapus localStorage & dispatch clearToken —
    // user bisa tertinggal di state; token yang menentukan sesi.
    renderGuarded("/profil", { token: null, user: userWith(false) });

    expect(screen.getByText("halaman login")).toBeTruthy();
    expect(screen.queryByText("halaman profil")).toBeNull();
  });

  it("me-render konten saat token ada dan user normal", () => {
    renderGuarded("/");

    expect(screen.getByText("halaman terlindungi")).toBeTruthy();
    expect(screen.queryByText("halaman login")).toBeNull();
  });

  it("me-render konten saat user belum termuat (fetchMe berjalan setelah mount)", () => {
    // `initialAuthState` sengaja user=null; guard tidak boleh menolak
    // sesi valid hanya karena `fetchMe` belum selesai.
    renderGuarded("/", { user: null });

    expect(screen.getByText("halaman terlindungi")).toBeTruthy();
  });
});

describe("ProtectedRoute — guard must_change_password", () => {
  it("me-redirect ke /change-password saat flag aktif dan user buka route lain", () => {
    renderGuarded("/profil", { user: userWith(true) });

    expect(screen.getByText("halaman change password")).toBeTruthy();
    expect(screen.queryByText("halaman profil")).toBeNull();
  });

  it("tetap me-render /change-password meski flag aktif", () => {
    renderGuarded("/change-password", { user: userWith(true) });

    expect(screen.getByText("halaman change password")).toBeTruthy();
  });
});
