/**
 * Unit test SessionBootstrap (frontend-phase1 Phase 3).
 *
 * Kontrak (spec §Success Criteria 2: "refresh halaman tetap terautentikasi —
 * sesi bertahan via GET /auth/me"):
 * - token ada + user belum termuat (kondisi setelah reload, karena
 *   `initialAuthState` sengaja user=null) → dispatch `fetchMe` tepat sekali;
 * - user sudah ada → tidak ada request ulang;
 * - token kosong (belum login) → tidak ada request sama sekali.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
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
import { SessionBootstrap } from "@/routes/SessionBootstrap";
import { makeStore } from "@/store";
import type { AppStore } from "@/store";
import { AUTH_TOKEN_KEY } from "@/api/client";
import { setToken, setUser } from "@/store/authSlice";

function userWith(name: string): AuthUser {
  return {
    id: 7,
    name,
    nip: "0000000000",
    email: "admin@kominfo.go.id",
    must_change_password: false,
    is_active: true,
    roles: ["admin"],
    permissions: ["user.manage"],
  };
}

/** Render bootstrap dengan store nyata; token/user diatur lewat dispatch. */
function renderBootstrap(seed: { token?: string; user?: AuthUser }): AppStore {
  const store = makeStore();
  if (seed.token) store.dispatch(setToken(seed.token));
  if (seed.user) store.dispatch(setUser(seed.user));

  render(
    <Provider store={store}>
      <SessionBootstrap>
        <div>isi shell</div>
      </SessionBootstrap>
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("SessionBootstrap — rehidrasi user setelah refresh", () => {
  it("memanggil GET /auth/me sekali saat token ada tetapi user belum termuat", async () => {
    vi.mocked(authApi.me).mockResolvedValueOnce(userWith("Administrator"));

    const store = renderBootstrap({ token: "tok-refresh" });

    expect(await screen.findByText("isi shell")).toBeTruthy();
    await vi.waitFor(() => {
      expect(authApi.me).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(store.getState().auth.user?.name).toBe("Administrator");
    });
  });

  it("tidak memanggil GET /auth/me saat user sudah termuat", async () => {
    renderBootstrap({ token: "tok-live", user: userWith("Siti Staf") });

    expect(screen.getByText("isi shell")).toBeTruthy();
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it("tidak memanggil GET /auth/me tanpa token", () => {
    renderBootstrap({});

    expect(screen.getByText("isi shell")).toBeTruthy();
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it("tetap merender isi shell walau rehidrasi gagal", async () => {
    vi.mocked(authApi.me).mockRejectedValueOnce(new Error("Sesi habis."));

    renderBootstrap({ token: "tok-stale" });

    await vi.waitFor(() => {
      expect(authApi.me).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("isi shell")).toBeTruthy();
    // Token tidak dibersihkan di sini: 401 ditangani interceptor (client.ts),
    // yang menghapus localStorage + redirect ke /login.
    expect(window.localStorage.getItem(AUTH_TOKEN_KEY)).toBe("tok-stale");
  });
});
