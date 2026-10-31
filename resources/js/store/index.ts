/**
 * Store tingkat aplikasi (frontend-phase1).
 *
 * - Reducer tunggal `auth` untuk fase ini; bertambah seiring fitur.
 * - Token awal dibaca dari localStorage agar refresh tidak memaksa login ulang.
 * - Interceptor 401 (`@/api/client`) sudah menghapus token dari localStorage
 *   dan redirect ke `/login`; yang kurang hanya state Redux, jadi
 *   `makeStore` mendaftarkan handler yang memanggil `clearToken`.
 */

import { configureStore } from "@reduxjs/toolkit";
import type { ThunkDispatch } from "@reduxjs/toolkit";
import type { Store, UnknownAction } from "redux";
import { onUnauthorized, AUTH_TOKEN_KEY } from "@/api/client";
import type { AuthState } from "@/store/authSlice";
import { authReducer, clearToken, initialAuthState } from "@/store/authSlice";

// ── Tipe store (named — bukan ReturnType) ───────────────────────────

/** Bentuk state root — bertambah saat reducer baru dipasang. */
export type RootState = { auth: AuthState };

/** Dispatch dengan middleware thunk default RTK. */
export type AppDispatch = ThunkDispatch<RootState, undefined, UnknownAction>;

/** Store aplikasi: `Store` Redux dengan dispatch yang menerima thunk. */
export interface AppStore extends Store<RootState, UnknownAction> {
  dispatch: AppDispatch;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Buat store baru dan sambungkan ke interceptor 401.
 * Dipanggil sekali di `app.tsx`; test memanggilnya untuk store terisolasi.
 */
export function makeStore(): AppStore {
  const storedToken = window.localStorage.getItem(AUTH_TOKEN_KEY);

  const store: AppStore = configureStore({
    reducer: { auth: authReducer },
    preloadedState: storedToken
      ? { auth: { ...initialAuthState(), token: storedToken } }
      : undefined,
  });

  // 401: localStorage & redirect sudah ditangani client; di sini hanya state.
  onUnauthorized(() => store.dispatch(clearToken()));

  return store;
}

/** Store tunggal untuk aplikasi (dipakai `app.tsx` via Provider). */
export const store = makeStore();
