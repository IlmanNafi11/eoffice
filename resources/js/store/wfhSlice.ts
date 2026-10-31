/**
 * wfhSlice — state domain Laporan WFH personal (frontend-phase2).
 *
 * Kontrak (lihat `tasks/plan.md` Task "wfhSlice"):
 * - state `list { items, meta, query, status, error }`,
 *   `current { report, status, error }` — status fetch per-domain;
 * - thunks memanggil modul `@/api/wfh` (satu-satunya tempat yang tahu
 *   bentuk request), bukan axios langsung;
 * - mutasi transisi/metadata meng-update `current.report` DAN baris
 *   yang cocok di `list.items` (in-place, posisi terjaga) agar halaman
 *   list & detail selalu konsisten tanpa refetch paksa;
 * - `deleteWfhReport` menghapus baris di list dan membersihkan
 *   `current.report` bila id-nya sama (detail yang terhapus jangan tertampil).
 */

import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import * as wfhApi from "@/api/wfh";
import type {
  ListWfhReportsQuery,
  PaginationMeta,
  WfhReport,
} from "@/api/types";

export type WfhFetchStatus = "idle" | "loading" | "succeeded" | "failed";

export interface WfhListState {
  items: WfhReport[];
  meta: PaginationMeta | null;
  query: ListWfhReportsQuery;
  status: WfhFetchStatus;
  error: string | null;
}

export interface WfhCurrentState {
  report: WfhReport | null;
  status: WfhFetchStatus;
  error: string | null;
}

export interface WfhState {
  list: WfhListState;
  current: WfhCurrentState;
}

export function initialWfhState(): WfhState {
  return {
    list: { items: [], meta: null, query: {}, status: "idle", error: null },
    current: { report: null, status: "idle", error: null },
  };
}

/** Pesan error siap tampil; `ApiError`/`Error` sama-sama punya `message`. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

// ── Thunks ──────────────────────────────────────────────────────────

/** GET /wfh/reports — simpan items+meta dan query aktif (untuk paginate/filter). */
export const fetchWfhReports = createAsyncThunk<
  { reports: WfhReport[]; meta: PaginationMeta | null },
  ListWfhReportsQuery | undefined
>(
  "wfh/fetchReports",
  async (query, { rejectWithValue }) => {
    try {
      return await wfhApi.listWfhReports(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /wfh/reports/{report} — detail dengan attendances. */
export const fetchWfhReport = createAsyncThunk<WfhReport, number>(
  "wfh/fetchReport",
  async (reportId, { rejectWithValue }) => {
    try {
      return await wfhApi.getWfhReport(reportId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Mutasi: hasilnya resource WfhReport → update current + baris list ──

/** POST /wfh/reports/{report}/submit. */
export const submitWfhReport = createAsyncThunk<WfhReport, number>(
  "wfh/submitReport",
  async (reportId, { rejectWithValue }) => {
    try {
      return await wfhApi.submitWfhReport(reportId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /wfh/reports/{report}/approve. */
export const approveWfhReport = createAsyncThunk<WfhReport, number>(
  "wfh/approveReport",
  async (reportId, { rejectWithValue }) => {
    try {
      return await wfhApi.approveWfhReport(reportId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /wfh/reports/{report}/reject — alasan wajib (argumen berpasangan). */
export const rejectWfhReport = createAsyncThunk<WfhReport, { reportId: number; reason: string }>(
  "wfh/rejectReport",
  async ({ reportId, reason }, { rejectWithValue }) => {
    try {
      return await wfhApi.rejectWfhReport(reportId, reason);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /wfh/reports/{report}/revise. */
export const reviseWfhReport = createAsyncThunk<WfhReport, number>(
  "wfh/reviseReport",
  async (reportId, { rejectWithValue }) => {
    try {
      return await wfhApi.reviseWfhReport(reportId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** PUT /wfh/reports/{report} — metadata only. */
export const updateWfhReportMetadata = createAsyncThunk<
  WfhReport,
  { reportId: number; reportDate: string }
>(
  "wfh/updateReportMetadata",
  async ({ reportId, reportDate }, { rejectWithValue }) => {
    try {
      return await wfhApi.updateWfhReportMetadata(reportId, reportDate);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** DELETE /wfh/reports/{report} — void; reducer yang membersihkan state. */
export const deleteWfhReport = createAsyncThunk<number, number>(
  "wfh/deleteReport",
  async (reportId, { rejectWithValue }) => {
    try {
      await wfhApi.deleteWfhReport(reportId);
      return reportId;
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Slice ───────────────────────────────────────────────────────────

/**
 * Regex tipe aksi mutasi yang fulfilled-nya membawa `WfhReport` — dipakai
 * `addMatcher` sehingga satu handler melayani submit/approve/reject/revise/
 * metadata (semuanya mengembalikan resource yang sama, update response).
 */
const WFH_MUTATION_FULFILLED =
  /^wfh\/(submit|approve|reject|revise)Report\/fulfilled$|^wfh\/updateReportMetadata\/fulfilled$/;
const WFH_MUTATION_SETTLED =
  /^wfh\/(submit|approve|reject|revise)Report\/(pending|rejected)$|^wfh\/updateReportMetadata\/(pending|rejected)$/;

/** Aksi mutasi settled (pending|rejected) — payload adalah message string. */
interface WfhMutationSettled {
  type: string;
  payload?: unknown;
  error?: { message?: string };
}

const slice = createSlice({
  name: "wfh",
  initialState: initialWfhState,
  reducers: {
    /** Ganti query filter list tanpa menyentuh items/status. */
    setListQuery(state, action: PayloadAction<ListWfhReportsQuery>) {
      state.list.query = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Semua addCase lebih dulu; addMatcher HARUS setelahnya (aturan RTK).
    builder
      // ── List ──────────────────────────────────────────────────
      .addCase(fetchWfhReports.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        if (action.meta.arg) state.list.query = { ...state.list.query, ...action.meta.arg };
      })
      .addCase(fetchWfhReports.fulfilled, (state, action) => {
        state.list.status = "succeeded";
        state.list.items = action.payload.reports;
        state.list.meta = action.payload.meta;
        state.list.error = null;
      })
      .addCase(fetchWfhReports.rejected, (state, action) => {
        state.list.status = "failed";
        state.list.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat daftar.";
      })
      // ── Detail ────────────────────────────────────────────────
      .addCase(fetchWfhReport.pending, (state) => {
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(fetchWfhReport.fulfilled, (state, action) => {
        state.current.status = "succeeded";
        state.current.report = action.payload;
        state.current.error = null;
      })
      .addCase(fetchWfhReport.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat laporan.";
      })
      // ── Delete ────────────────────────────────────────────────
      .addCase(deleteWfhReport.pending, (state) => {
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(deleteWfhReport.fulfilled, (state, action) => {
        state.current.status = "succeeded";
        const idx = state.list.items.findIndex((r) => r.id === action.payload);
        if (idx !== -1) state.list.items.splice(idx, 1);
        if (state.current.report?.id === action.payload) state.current.report = null;
        state.current.error = null;
      })
      .addCase(deleteWfhReport.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal menghapus laporan.";
      })
      // ── Mutasi WfhReport: update current + baris list yang cocok ──
      .addMatcher(
        (action): action is { type: string; payload: WfhReport } =>
          WFH_MUTATION_FULFILLED.test(action.type),
        (state, action) => {
          state.current.status = "succeeded";
          state.current.report = action.payload;
          state.current.error = null;
          const idx = state.list.items.findIndex((r) => r.id === action.payload.id);
          if (idx !== -1) state.list.items[idx] = action.payload;
        },
      )
      .addMatcher(
        (action): action is WfhMutationSettled => WFH_MUTATION_SETTLED.test(action.type),
        (state, action) => {
          if (action.type.endsWith("/pending")) {
            state.current.status = "loading";
            state.current.error = null;
          } else {
            state.current.status = "failed";
            state.current.error =
              (action.payload as string | undefined) ?? action.error?.message ?? "Aksi gagal.";
          }
        },
      );
  },
});

export const { setListQuery } = slice.actions;
export const wfhReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

/** Bentuk state minimal yang dibutuhkan selector (aman untuk RootState penuh). */
interface WithWfh {
  wfh: WfhState;
}

export const selectWfhList = (state: WithWfh): WfhListState => state.wfh.list;
export const selectWfhListItems = (state: WithWfh): WfhReport[] => state.wfh.list.items;
export const selectWfhListMeta = (state: WithWfh): PaginationMeta | null => state.wfh.list.meta;
export const selectWfhListQuery = (state: WithWfh): ListWfhReportsQuery => state.wfh.list.query;
export const selectWfhCurrent = (state: WithWfh): WfhCurrentState => state.wfh.current;
export const selectWfhCurrentReport = (state: WithWfh): WfhReport | null => state.wfh.current.report;