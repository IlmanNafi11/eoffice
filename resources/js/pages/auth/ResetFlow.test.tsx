/**
 * Unit test alur Forgot → OTP → Reset password (frontend-phase1 Phase 3,
 * Slice 3, plan task "Forgot + OTP + Reset password flow").
 *
 * Kontrak yang dijaga:
 * - ForgotPasswordPage submit → thunk `forgotPassword({ email })`; sukses →
 *   navigasi `/verify-otp?email=…`. (openapi: selalu 200 generik — tidak ada
 *   cabang "email tidak terdaftar" di FE.)
 * - OtpVerificationPage submit → thunk `verifyOtp({ email, code })`; sukses →
 *   `reset_token` masuk sessionStorage, navigasi `/reset-password?email=…`.
 * - ResetPasswordPage submit → thunk `resetPassword({ reset_token, … })`;
 *   token diambil dari sessionStorage, dihapus setelah sukses, navigasi ke
 *   `/login`. Token hilang → kembali ke `/forgot-password` lewat tombol
 *   `Kirim OTP` (submit terblokir).
 * - Error envelope (422 OTP salah/kedaluwarsa, 429 throttle) tampil via
 *   `auth.error`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
import {
  ForgotPasswordPage,
} from "@/pages/auth/ForgotPasswordPage";
import {
  OtpVerificationPage,
  RESET_TOKEN_KEY,
} from "@/pages/auth/OtpVerificationPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { makeStore } from "@/store";
import type { AppStore } from "@/store";

/**
 * Render seluruh alur (forgot → otp → reset) dengan store nyata, sehingga
 * navigasi antar-halaman benar-benar terjadi — test membuktikan rantai.
 */
function renderFlow(initialPath: string): AppStore {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-otp" element={<OtpVerificationPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div data-testid="route-login">halaman login</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  sessionStorage.clear();
});

describe("ForgotPasswordPage", () => {
  it("submit me-dispatch forgotPassword dengan email lalu navigasi ke /verify-otp?email=…", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.forgotPassword).mockResolvedValueOnce(undefined);

    renderFlow("/forgot-password");
    await user.type(screen.getByLabelText(/email/i), "staf@kominfo.go.id");
    await user.click(screen.getByTestId("forgot-submit"));

    expect(authApi.forgotPassword).toHaveBeenCalledTimes(1);
    expect(authApi.forgotPassword).toHaveBeenCalledWith({
      email: "staf@kominfo.go.id",
    });
    expect(await screen.findByTestId("otp-submit")).toBeTruthy();
  });

  it("menampilkan error envelope (429 throttle) dan tetap di halaman forgot", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.forgotPassword).mockRejectedValueOnce(
      new Error("Terlalu banyak percobaan. Coba lagi nanti."),
    );

    renderFlow("/forgot-password");
    await user.type(screen.getByLabelText(/email/i), "staf@kominfo.go.id");
    await user.click(screen.getByTestId("forgot-submit"));

    expect(
      await screen.findByText(/terlalu banyak percobaan/i),
    ).toBeTruthy();
    expect(screen.getByTestId("forgot-submit")).toBeTruthy();
    expect(authApi.verifyOtp).not.toHaveBeenCalled();
  });

  it("menyediakan link kembali ke /login", async () => {
    const user = userEvent.setup();
    renderFlow("/forgot-password");

    await user.click(screen.getByRole("link", { name: /kembali ke login/i }));
    expect(screen.getByTestId("route-login")).toBeTruthy();
  });
});

describe("OtpVerificationPage", () => {
  it("prefill email dari query string dan submit verifyOtp; sukses menyimpan reset_token lalu ke /reset-password", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.verifyOtp).mockResolvedValueOnce({
      reset_token: "a".repeat(60),
    });

    renderFlow("/verify-otp?email=staf%40kominfo.go.id");
    // Email pra-isi dari `/forgot-password`.
    expect(
      (screen.getByLabelText(/email/i) as HTMLInputElement).value,
    ).toBe("staf@kominfo.go.id");

    await user.type(screen.getByLabelText(/kode otp/i), "123456");
    await user.click(screen.getByTestId("otp-submit"));

    expect(authApi.verifyOtp).toHaveBeenCalledTimes(1);
    expect(authApi.verifyOtp).toHaveBeenCalledWith({
      email: "staf@kominfo.go.id",
      code: "123456",
    });
    expect(await screen.findByTestId("reset-submit")).toBeTruthy();
    // Token diteruskan ke halaman reset via sessionStorage.
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBe("a".repeat(60));
  });

  it("email kosong bisa diisi manual (buka /verify-otp langsung)", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.verifyOtp).mockResolvedValueOnce({
      reset_token: "b".repeat(60),
    });

    renderFlow("/verify-otp");
    await user.type(screen.getByLabelText(/email/i), "staf@kominfo.go.id");
    await user.type(screen.getByLabelText(/kode otp/i), "654321");
    await user.click(screen.getByTestId("otp-submit"));

    expect(authApi.verifyOtp).toHaveBeenCalledWith({
      email: "staf@kominfo.go.id",
      code: "654321",
    });
    expect(await screen.findByTestId("reset-submit")).toBeTruthy();
  });

  it("menampilkan error envelope OTP salah (422) dan TIDAK menyimpan reset_token", async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.verifyOtp).mockRejectedValueOnce(
      new Error("Kode OTP tidak valid atau telah kedaluwarsa."),
    );

    renderFlow("/verify-otp?email=staf@kominfo.go.id");
    await user.type(screen.getByLabelText(/kode otp/i), "000000");
    await user.click(screen.getByTestId("otp-submit"));

    expect(
      await screen.findByText(/kode otp tidak valid/i),
    ).toBeTruthy();
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBeNull();
    expect(screen.getByTestId("otp-submit")).toBeTruthy();
  });
});

describe("ResetPasswordPage", () => {
  it("submit resetPassword dengan token dari sessionStorage; sukses menghapus token + ke /login", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(RESET_TOKEN_KEY, "c".repeat(60));
    vi.mocked(authApi.resetPassword).mockResolvedValueOnce(undefined);

    renderFlow("/reset-password?email=staf@kominfo.go.id");
    await user.type(screen.getByLabelText(/^password baru$/i), "password-baru-8");
    await user.type(screen.getByLabelText(/konfirmasi password/i), "password-baru-8");
    await user.click(screen.getByTestId("reset-submit"));

    expect(authApi.resetPassword).toHaveBeenCalledTimes(1);
    expect(authApi.resetPassword).toHaveBeenCalledWith({
      reset_token: "c".repeat(60),
      new_password: "password-baru-8",
      new_password_confirmation: "password-baru-8",
    });
    expect(await screen.findByTestId("route-login")).toBeTruthy();
    // Token sekali pakai: dibersihkan setelah sukses.
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBeNull();
  });

  it("token hilang dari sessionStorage → redirect kembali ke /forgot-password saat submit", async () => {
    const user = userEvent.setup();

    renderFlow("/reset-password");
    await user.type(screen.getByLabelText(/^password baru$/i), "password-baru-8");
    await user.type(screen.getByLabelText(/konfirmasi password/i), "password-baru-8");
    await user.click(screen.getByTestId("reset-submit"));

    expect(authApi.resetPassword).not.toHaveBeenCalled();
    expect(await screen.findByTestId("forgot-submit")).toBeTruthy();
  });

  it("menampilkan error envelope token kedaluwarsa (422) dan token tetap disimpan", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem(RESET_TOKEN_KEY, "d".repeat(60));
    vi.mocked(authApi.resetPassword).mockRejectedValueOnce(
      new Error("Token reset tidak valid atau telah kedaluwarsa."),
    );

    renderFlow("/reset-password");
    await user.type(screen.getByLabelText(/^password baru$/i), "password-baru-8");
    await user.type(screen.getByLabelText(/konfirmasi password/i), "password-baru-8");
    await user.click(screen.getByTestId("reset-submit"));

    expect(
      await screen.findByText(/token reset tidak valid/i),
    ).toBeTruthy();
    expect(screen.getByTestId("reset-submit")).toBeTruthy();
    // Token belum dikonsumsi (gagal = bisa dicoba ulang; hapus hanya saat sukses).
    expect(sessionStorage.getItem(RESET_TOKEN_KEY)).toBe("d".repeat(60));
  });
});
