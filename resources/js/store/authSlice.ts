/**
 * authSlice — sumber kebenaran sesi di sisi klien.
 *
 * Kontrak (lihat `tasks/plan.md` Task "Redux store + authSlice"):
 * - state `{ token, user, status, error }`;
 * - token dipersist ke localStorage lewat `setAuthToken` sehingga request
 *   interceptor (`@/api/client`) memakai sumber yang sama;
 * - `login`/`logout` memanggil modul `@/api/auth` (satu-satunya tempat yang
 *   tahu bentuk request), bukan axios langsung;
 * - 401 memaksa sesi dibersihkan: `onUnauthorized` di `@/store` mengarah ke sini.
 */

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { setAuthToken } from "@/api/client";
import * as authApi from "@/api/auth";
import type {
  AuthUser,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  ResetPasswordRequest,
  VerifyOtpRequest,
} from "@/api/types";

export type AuthStatus = "idle" | "loading" | "succeeded" | "failed";

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
}

/**
 * State awal: token dibaca dari localStorage agar refresh tidak memaksa login
 * ulang. `user` sengaja null — diisi `fetchMe` setelah shell mount.
 */
export function initialAuthState(): AuthState {
  return {
    token: null,
    user: null,
    status: "idle",
    error: null,
  };
}

/** Pesan error siap tampil; `ApiError`/`Error` sama-sama punya `message`. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

// ── Thunks ──────────────────────────────────────────────────────────

/** POST /auth/login — modul API sudah menyimpan token; slice menyamakan state. */
export const login = createAsyncThunk<LoginResponse, LoginRequest>(
  "auth/login",
  async (input, { rejectWithValue }) => {
    try {
      return await authApi.login(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/**
 * POST /auth/logout — revoke server-side bersifat best-effort: token lokal
 * tetap dibersihkan meski request gagal (mis. jaringan mati).
 */
export const logout = createAsyncThunk<void, void>(
  "auth/logout",
  async (_arg) => {
    try {
      await authApi.logout();
    } catch {
      // Abaikan: pembersihan lokal tetap dijalankan oleh reducer fulfilled.
    }
  },
);

/** GET /auth/me — dipakai setelah mount untuk menyegarkan user & permission. */
export const fetchMe = createAsyncThunk<AuthUser, void>(
  "auth/fetchMe",
  async (_arg, { rejectWithValue }) => {
    try {
      return await authApi.me();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /auth/change-password — sukses menurunkan flag `must_change_password`. */
export const changePassword = createAsyncThunk<void, ChangePasswordRequest>(
  "auth/changePassword",
  async (input, { rejectWithValue }) => {
    try {
      await authApi.changePassword(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /auth/forgot-password — kirim OTP ke email user. */
export const forgotPassword = createAsyncThunk<void, ForgotPasswordRequest>(
  "auth/forgotPassword",
  async (input, { rejectWithValue }) => {
    try {
      await authApi.forgotPassword(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /auth/verify-otp — mengembalikan `reset_token` untuk langkah reset. */
export const verifyOtp = createAsyncThunk<{ reset_token: string }, VerifyOtpRequest>(
  "auth/verifyOtp",
  async (input, { rejectWithValue }) => {
    try {
      return await authApi.verifyOtp(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /auth/reset-password — token sekali pakai, TTL 5 menit. */
export const resetPassword = createAsyncThunk<void, ResetPasswordRequest>(
  "auth/resetPassword",
  async (input, { rejectWithValue }) => {
    try {
      await authApi.resetPassword(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Slice ───────────────────────────────────────────────────────────

const slice = createSlice({
  name: "auth",
  initialState: initialAuthState,
  reducers: {
    /** Simpan token hasil login manual (mis. dari alur non-thunk). */
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
      setAuthToken(action.payload);
    },
    /** Ganti user (mis. setelah PUT /profile). */
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
    },
    /** Bersihkan sesi: token, user, error, status — dipakai logout & 401. */
    clearToken(state) {
      state.token = null;
      state.user = null;
      state.error = null;
      state.status = "idle";
      setAuthToken(null);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.error = null;
        // Sinkron dengan penulisan di `@/api/auth` — idempoten, menjaga
        // invariant "token di state == token di localStorage" bahkan saat
        // modul API dimock (test) atau alur login berbeda.
        setAuthToken(action.payload.token);
      })
      .addCase(login.rejected, (state, action) => {
        state.status = "failed";
        state.error = (action.payload as string | undefined) ?? action.error.message ?? "Login gagal.";
      })
      .addCase(logout.fulfilled, (state) => {
        state.token = null;
        state.user = null;
        state.status = "idle";
        state.error = null;
        setAuthToken(null);
      })
      .addCase(fetchMe.pending, (state) => {
        // `status = "loading"` adalah kontrak guard double-dispatch di
        // `SessionBootstrap` (menahan efek selama request berjalan) — tanpa
        // reducer ini guard itu false-invariant (ship review #4).
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.user = action.payload;
      })
      .addCase(fetchMe.rejected, (state, action) => {
        // Sesi tidak diakhiri di sini: 401 sudah ditangani interceptor
        // (hapus token + redirect); error non-401 (jaringan mati) tidak boleh
        // mengakhiri sesi yang masih valid — efek bootstrap menyala ulang dan
        // mencoba lagi saat jaringan pulih, jadi status kembali ke "idle".
        state.status = "idle";
        state.error = (action.payload as string | undefined) ?? action.error.message ?? null;
      })
      .addCase(changePassword.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(changePassword.fulfilled, (state) => {
        state.status = "succeeded";
        state.error = null;
        if (state.user) state.user.must_change_password = false;
      })
      .addCase(changePassword.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal mengubah kata sandi.";
      })
      // Alur reset publik: pending men-set status loading (men-disable tombol
      // submit dan mengaktifkan guard double-submit di halaman); pending dan
      // fulfilled membersihkan error agar pesan langkah sebelumnya tidak bocor
      // ke halaman berikutnya — keempat halaman publik berbagi satu
      // `auth.status`/`auth.error`.
      .addCase(forgotPassword.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(forgotPassword.fulfilled, (state) => {
        state.status = "succeeded";
        state.error = null;
      })
      .addCase(forgotPassword.rejected, (state, action) => {
        state.status = "failed";
        state.error = (action.payload as string | undefined) ?? action.error.message ?? null;
      })
      .addCase(verifyOtp.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(verifyOtp.fulfilled, (state) => {
        state.status = "succeeded";
        state.error = null;
      })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.status = "failed";
        state.error = (action.payload as string | undefined) ?? action.error.message ?? null;
      })
      .addCase(resetPassword.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(resetPassword.fulfilled, (state) => {
        state.status = "succeeded";
        state.error = null;
      })
      .addCase(resetPassword.rejected, (state, action) => {
        state.status = "failed";
        state.error = (action.payload as string | undefined) ?? action.error.message ?? null;
      });
  },
});

export const { setToken, setUser, clearToken } = slice.actions;
export const authReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

/** Bentuk state minimal yang dibutuhkan selector (aman untuk RootState penuh). */
interface WithAuth {
  auth: AuthState;
}

export const selectAuth = (state: WithAuth): AuthState => state.auth;
export const selectToken = (state: WithAuth): string | null => state.auth.token;
export const selectUser = (state: WithAuth): AuthUser | null => state.auth.user;
