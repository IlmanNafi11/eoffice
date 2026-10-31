/**
 * Modul API auth (frontend-phase1).
 * Semua request lewat `api` (envelope sudah di-unwrap, error jadi `ApiError`).
 * Path & payload sesuai `postman/specs/openapi.yaml` — jangan mengubah bentuk
 * request tanpa menyamakan spec.
 *
 * Efek samping token: `login` menyimpan bearer token via `setAuthToken`
 * (persist ke localStorage), `logout` membersihkannya.
 */

import { api, setAuthToken } from "@/api/client";
import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  VerifyOtpRequest,
  ResetPasswordRequest,
} from "@/api/types";

/** Endpoint yang kontraknya menjamin `data` ada; envelope tanpa data = bug backend. */
function requireData<T>(value: T | null, endpoint: string): T {
  if (value === null) {
    throw new Error(`Respons ${endpoint} tidak berisi data.`);
  }
  return value;
}

/** POST /auth/login — sukses menyimpan token; gagal melempar ApiError tanpa menyimpan apa pun. */
export async function login(input: LoginRequest): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", input);
  const payload = requireData(res.data, "login");
  setAuthToken(payload.token);
  return payload;
}

/** POST /auth/logout — revoke token server-side lalu bersihkan token lokal. */
export async function logout(): Promise<void> {
  await api.post<null>("/auth/logout");
  setAuthToken(null);
}

/** GET /auth/me — data user sesi aktif; token tidak diubah di sini. */
export async function me(): Promise<AuthUser> {
  const res = await api.get<AuthUser>("/auth/me");
  return requireData(res.data, "auth/me");
}

/** POST /auth/change-password — terjangkau saat `must_change_password` aktif. */
export async function changePassword(input: ChangePasswordRequest): Promise<void> {
  await api.post<null>("/auth/change-password", input);
}

/** POST /auth/forgot-password — kirim kode OTP ke email. */
export async function forgotPassword(input: ForgotPasswordRequest): Promise<void> {
  await api.post<null>("/auth/forgot-password", input);
}

/** POST /auth/verify-otp — kode OTP valid mengembalikan `reset_token` 60-char. */
export async function verifyOtp(input: VerifyOtpRequest): Promise<{ reset_token: string }> {
  const res = await api.post<{ reset_token: string }>("/auth/verify-otp", input);
  return requireData(res.data, "auth/verify-otp");
}

/** POST /auth/reset-password — token sekali pakai, TTL 5 menit sejak verify-otp. */
export async function resetPassword(input: ResetPasswordRequest): Promise<void> {
  await api.post<null>("/auth/reset-password", input);
}
