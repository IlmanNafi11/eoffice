/**
 * dashboardSlice — state domain Dashboard Beranda (modul dashboard).
 *
 * Kontrak (lihat `tasks/plan.md` Task 5):
 * - state `{ data, status, error, generatedAt }` — bentuknya satu endpoint
 *   tunggal, jadi tidak dipecah per-seksi seperti `wfhMonitoringSlice`;
 * - thunk memanggil modul `@/api/dashboard` (satu-satunya tempat yang tahu
 *   bentuk request), bukan axios langsung;
 * - `generatedAt` dipisah dari `data` agar skeleton/refetch-on-focus bisa
 *   membaca timestamp payload terakhir tanpa membongkar objek data;
 * - fulfilled menolak respons BASI: bila `generated_at` respons lebih lama
 *   dari yang sudah tersimpan (dua fetch tumpang tindih — mount + focus —
 *   lalu resolve tak berurutan), data baru jangan menimpa yang lebih segar
 *   (ship review #20: race out-of-order).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { toUiError } from "@/lib/ui-errors";
import * as dashboardApi from "@/api/dashboard";
import type { DashboardData } from "@/api/types";

export type DashboardFetchStatus = "idle" | "loading" | "succeeded" | "failed";

export interface DashboardState {
  data: DashboardData | null;
  status: DashboardFetchStatus;
  /** Pesan error siap tampil; `null` saat tidak ada kegagalan aktif. */
  error: string | null;
  /** `generated_at` payload terakhir yang berhasil dimuat. */
  generatedAt: string | null;
}

export function initialDashboardState(): DashboardState {
  return { data: null, status: "idle", error: null, generatedAt: null };
}

/** Pesan error siap tampil lewat seam `toUiError` (detail transport tak pernah sampai ke UI). */
function messageOf(error: unknown): string {
  return toUiError(error).message;
}

/** Bentuk state minimal untuk membaca state dashboard dari komponen. */
interface WithDashboard {
  dashboard: DashboardState;
}

// ── Thunk ───────────────────────────────────────────────────────────

/** GET /dashboard — beranda per-permission (seksi sesuai role diputuskan backend). */
export const fetchDashboard = createAsyncThunk<DashboardData, void>(
  "dashboard/fetch",
  async (_, { rejectWithValue }) => {
    try {
      return await dashboardApi.getDashboard();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Slice ───────────────────────────────────────────────────────────

const slice = createSlice({
  name: "dashboard",
  initialState: initialDashboardState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        const incoming = action.payload.generated_at;
        if (state.generatedAt !== null && incoming <= state.generatedAt) {
          // Respons lebih lama dari data yang sudah tampil — abaikan.
          state.status = "succeeded";
          return;
        }
        state.status = "succeeded";
        state.data = action.payload;
        state.generatedAt = incoming;
        state.error = null;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          "Gagal memuat dashboard.";
        // `data` lama sengaja dipertahankan — refetch gagal tidak blank.
      });
  },
});

export const dashboardReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

export const selectDashboard = (state: WithDashboard): DashboardState => state.dashboard;
export const selectDashboardData = (state: WithDashboard): DashboardData | null =>
  state.dashboard.data;
