/**
 * wfhMonitoringSlice — state domain WFH Monitoring (modul wfh-monitoring).
 *
 * Kontrak (lihat `tasks/plan.md` Task 3):
 * - state `board { data, query, status, error }` (papan harian per tanggal
 *   + filter tim) dan `list { items, meta, query, status, error }` (list
 *   admin paginated + filter) — bentuk berbeda dari `wfhSlice` (personal) /
 *   `wfhTeamSlice` (team report), jadi domainnya terpisah;
 * - thunks memanggil modul `@/api/wfh-monitoring` (satu-satunya tempat yang
 *   tahu bentuk request), bukan axios langsung;
 * - reducer menyimpan query aktif (untuk refetch pasca-aksi) dan `page`
 *   dipisah dari filter agar pagination tak menyapu filter lunak yang belum
 *   dikomit;
 * - error fetch tersimpan sebagai pesan siap tampil (string `message`).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import * as wfhMonitoringApi from "@/api/wfh-monitoring";
import type {
  ListAdminReportsQuery,
  PaginationMeta,
  WfhMonitoringData,
  WfhReport,
} from "@/api/types";

export type WfhMonitoringFetchStatus = "idle" | "loading" | "succeeded" | "failed";

/** Query `GET /admin/wfh/monitoring` — keduanya opsional. */
export interface WfhBoardQuery {
  date?: string;
  team_id?: number;
}

export interface WfhBoardState {
  data: WfhMonitoringData | null;
  query: WfhBoardQuery;
  status: WfhMonitoringFetchStatus;
  error: string | null;
  /** requestId dispatch board terakhir — untuk membuang respons basi (race). */
  latestRequestId: string | null;
}

export interface WfhMonitoringListState {
  items: WfhReport[];
  meta: PaginationMeta | null;
  query: ListAdminReportsQuery;
  status: WfhMonitoringFetchStatus;
  error: string | null;
  /** requestId dispatch list terakhir — untuk membuang respons basi (race). */
  latestRequestId: string | null;
}

export interface WfhMonitoringState {
  board: WfhBoardState;
  list: WfhMonitoringListState;
}

export function initialWfhMonitoringState(): WfhMonitoringState {
  return {
    board: {
      data: null,
      query: {},
      status: "idle",
      error: null,
      latestRequestId: null,
    },
    list: {
      items: [],
      meta: null,
      query: {},
      status: "idle",
      error: null,
      latestRequestId: null,
    },
  };
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

/** Bentuk state minimal untuk membaca query aktif saat refetch pasca-mutasi. */
interface WithWfhMonitoring {
  wfhMonitoring: WfhMonitoringState;
}

// ── Thunks ──────────────────────────────────────────────────────────

/** GET /admin/wfh/monitoring — papan harian per tanggal + filter tim. */
export const fetchWfhBoard = createAsyncThunk<
  WfhMonitoringData,
  WfhBoardQuery | undefined
>(
  "wfhMonitoring/fetchBoard",
  async (query, { rejectWithValue }) => {
    try {
      return await wfhMonitoringApi.getWfhMonitoring(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /admin/wfh/reports — list paginated + filter (envelope paginated). */
export const fetchAdminReports = createAsyncThunk<
  { reports: WfhReport[]; meta: PaginationMeta },
  ListAdminReportsQuery | undefined
>(
  "wfhMonitoring/fetchAdminReports",
  async (query, { rejectWithValue }) => {
    try {
      return await wfhMonitoringApi.adminListWfhReports(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Slice ───────────────────────────────────────────────────────────

const slice = createSlice({
  name: "wfhMonitoring",
  initialState: initialWfhMonitoringState,
  reducers: {
    /** Ganti query tanggal/team filter board (tanpa menyentuh data/status). */
    setBoardQuery(state, action: PayloadAction<WfhBoardQuery>) {
      state.board.query = { ...state.board.query, ...action.payload };
    },
    /** Ganti SELURUH query filter list (bukan merge) — menghapus kunci basi
     *  saat "Terapkan"/ganti per-halaman. Dipakai sebelum fetch agar filter
     *  yang sudah dikosongkan tidak diam-diam terbawa ke pagination berikut. */
    setListQuery(state, action: PayloadAction<ListAdminReportsQuery>) {
      state.list.query = { ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Board ─────────────────────────────────────────────────
      .addCase(fetchWfhBoard.pending, (state, action) => {
        state.board.status = "loading";
        state.board.error = null;
        if (action.meta.arg) state.board.query = { ...state.board.query, ...action.meta.arg };
        state.board.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchWfhBoard.fulfilled, (state, action) => {
        if (state.board.latestRequestId !== action.meta.requestId) return;
        state.board.status = "succeeded";
        state.board.data = action.payload;
        state.board.error = null;
      })
      .addCase(fetchWfhBoard.rejected, (state, action) => {
        if (state.board.latestRequestId !== action.meta.requestId) return;
        state.board.status = "failed";
        state.board.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat papan.";
      })
      // ── List admin ────────────────────────────────────────────
      .addCase(fetchAdminReports.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        // GANTI (bukan merge): arg dispatch memuat SELURUH filter yang
        // diinginkan; merge akan meninggalkan kunci filter yang sudah
        // dikosongkan (regresi H1 ship-review wfh-monitoring).
        if (action.meta.arg) state.list.query = { ...action.meta.arg };
        state.list.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchAdminReports.fulfilled, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "succeeded";
        state.list.items = action.payload.reports;
        state.list.meta = action.payload.meta;
        state.list.error = null;
      })
      .addCase(fetchAdminReports.rejected, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "failed";
        state.list.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat daftar.";
      });
  },
});

export const { setBoardQuery, setListQuery } = slice.actions;

export const wfhMonitoringReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

export const selectWfhMonitoringBoard = (state: WithWfhMonitoring): WfhBoardState =>
  state.wfhMonitoring.board;
export const selectWfhMonitoringBoardData = (state: WithWfhMonitoring): WfhMonitoringData | null =>
  state.wfhMonitoring.board.data;
export const selectWfhMonitoringList = (state: WithWfhMonitoring): WfhMonitoringListState =>
  state.wfhMonitoring.list;
export const selectWfhMonitoringListItems = (state: WithWfhMonitoring): WfhReport[] =>
  state.wfhMonitoring.list.items;
export const selectWfhMonitoringListMeta = (state: WithWfhMonitoring): PaginationMeta | null =>
  state.wfhMonitoring.list.meta;
export const selectWfhMonitoringListQuery = (state: WithWfhMonitoring): ListAdminReportsQuery =>
  state.wfhMonitoring.list.query;