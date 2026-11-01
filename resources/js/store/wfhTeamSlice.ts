/**
 * wfhTeamSlice — state domain Laporan WFH Tim (modul wfh-team-reports).
 *
 * Kontrak (lihat `tasks/plan.md` Task 2):
 * - state `list { items, meta, query, status, error, actionError }` —
 *   dua kanal error terpisah: `error` untuk fetch daftar, `actionError`
 *   untuk mutasi create/approve/reject. Pemisahan ini adalah inti
 *   regresi `a602c46` (pesan 403/422 mutasi tak boleh lenyap saat refetch);
 * - thunks memanggil modul `@/api/wfh-team` (satu-satunya tempat yang tahu
 *   bentuk request), bukan axios langsung;
 * - mutasi fulfilled → update baris di `list.items` (in-place) lalu refetch
 *   daftar dengan query aktif (sumber kebenaran = server pasca-mutasi);
 * - mutasi rejected → set `actionError` dan TIDAK refetch (akar `a602c46`).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import * as wfhTeamApi from "@/api/wfh-team";
import type {
  CreateTeamReportInput,
  ListTeamReportsQuery,
  PaginationMeta,
  WfhTeamReport,
} from "@/api/types";

export type WfhTeamFetchStatus = "idle" | "loading" | "succeeded" | "failed";

export interface WfhTeamListState {
  items: WfhTeamReport[];
  meta: PaginationMeta | null;
  query: ListTeamReportsQuery;
  status: WfhTeamFetchStatus;
  /** Pesan error fetch daftar — dikelola hanya oleh thunk `fetch*`. */
  error: string | null;
  /** Pesan error mutasi (create/approve/reject) — tidak disentuh refetch. */
  actionError: string | null;
  /** requestId dispatch list terakhir — untuk membuang respons basi (race). */
  latestRequestId: string | null;
}

export interface WfhTeamState {
  list: WfhTeamListState;
}

export function initialWfhTeamState(): WfhTeamState {
  return {
    list: {
      items: [],
      meta: null,
      query: {},
      status: "idle",
      error: null,
      actionError: null,
      latestRequestId: null,
    },
  };
}

/** Pesan error siap tampil; `ApiError`/`Error` sama-sama punya `message`. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

/** Bentuk state minimal untuk membaca query aktif saat refetch pasca-mutasi. */
interface WithWfhTeam {
  wfhTeam: WfhTeamState;
}

// ── Thunks ──────────────────────────────────────────────────────────

/** GET /admin/wfh/team-reports — simpan items+meta dan query aktif. */
export const fetchWfhTeamReports = createAsyncThunk<
  { reports: WfhTeamReport[]; meta: PaginationMeta },
  ListTeamReportsQuery | undefined
>(
  "wfhTeam/fetchReports",
  async (query, { rejectWithValue }) => {
    try {
      return await wfhTeamApi.listWfhTeamReports(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/**
 * Mutasi yang mengembalikan `WfhTeamReport`. Setelah sukses, daftar di-refetch
 * dengan query aktif. `fetchWfhTeamReports` menangkap error-nya sendiri (`rejectWithValue`),
 * jadi `dispatch(...)` tidak pernah reject — kegagalan refetch masuk ke `list.error`,
 * terpisah dari hasil mutasi yang sudah berhasil.
 */
async function mutateAndRefetch(
  mutate: () => Promise<WfhTeamReport>,
  refetch: () => Promise<unknown>,
): Promise<WfhTeamReport> {
  const report = await mutate();
  await refetch(); // gagal refetch → list.error, bukan menggagalkan mutasi
  return report;
}

/** POST /admin/wfh/team-reports — server memaksa status=pending + created_by. */
export const createWfhTeamReport = createAsyncThunk<
  WfhTeamReport,
  CreateTeamReportInput,
  { state: WithWfhTeam }
>(
  "wfhTeam/createReport",
  async (input, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      return await mutateAndRefetch(
        () => wfhTeamApi.createWfhTeamReport(input),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
      );
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /admin/wfh/team-reports/{id}/approve — payload kosong. */
export const approveWfhTeamReport = createAsyncThunk<
  WfhTeamReport,
  number,
  { state: WithWfhTeam }
>(
  "wfhTeam/approveReport",
  async (teamReportId, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      return await mutateAndRefetch(
        () => wfhTeamApi.approveWfhTeamReport(teamReportId),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
      );
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /admin/wfh/team-reports/{id}/reject — alasan wajib. */
export const rejectWfhTeamReport = createAsyncThunk<
  WfhTeamReport,
  { teamReportId: number; reason: string },
  { state: WithWfhTeam }
>(
  "wfhTeam/rejectReport",
  async ({ teamReportId, reason }, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      return await mutateAndRefetch(
        () => wfhTeamApi.rejectWfhTeamReport(teamReportId, { reason }),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
      );
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

// ── Slice ───────────────────────────────────────────────────────────

/** Tipe aksi mutasi yang fulfilled-nya membawa `WfhTeamReport`. */
const WFH_TEAM_MUTATION_FULFILLED = /^wfhTeam\/(create|approve|reject)Report\/fulfilled$/;
const WFH_TEAM_MUTATION_PENDING = /^wfhTeam\/(create|approve|reject)Report\/pending$/;
const WFH_TEAM_MUTATION_REJECTED = /^wfhTeam\/(create|approve|reject)Report\/rejected$/;

/** Aksi mutasi settled (pending|rejected) — payload adalah message string. */
interface WfhTeamMutationSettled {
  type: string;
  payload?: unknown;
  error?: { message?: string };
}

const slice = createSlice({
  name: "wfhTeam",
  initialState: initialWfhTeamState,
  reducers: {
    /** Reset/ganti query filter list tanpa menyentuh items/status (dipakai mount). */
    setTeamListQuery(state, action: PayloadAction<ListTeamReportsQuery>) {
      state.list.query = { ...state.list.query, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      // ── Fetch daftar ──────────────────────────────────────────
      .addCase(fetchWfhTeamReports.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        // actionError TIDAK disentuh — pesan mutasi selamat dari refetch
        // (regresi a602c46: refetch tak boleh menyapu pesan 403/422).
        if (action.meta.arg) state.list.query = { ...state.list.query, ...action.meta.arg };
        state.list.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchWfhTeamReports.fulfilled, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "succeeded";
        state.list.items = action.payload.reports;
        state.list.meta = action.payload.meta;
        state.list.error = null;
      })
      .addCase(fetchWfhTeamReports.rejected, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "failed";
        state.list.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat daftar.";
      })
      // ── Mutasi create/approve/reject ──────────────────────────
      .addMatcher(
        (action): action is { type: string } => WFH_TEAM_MUTATION_PENDING.test(action.type),
        (state) => {
          // Mutasi baru dimulai → bersihkan pesan mutasi lama (bukan error fetch).
          state.list.actionError = null;
        },
      )
      .addMatcher(
        (action): action is { type: string; payload: WfhTeamReport } =>
          WFH_TEAM_MUTATION_FULFILLED.test(action.type),
        (state, action) => {
          state.list.actionError = null;
          const idx = state.list.items.findIndex((r) => r.id === action.payload.id);
          if (idx !== -1) state.list.items[idx] = action.payload;
        },
      )
      .addMatcher(
        (action): action is WfhTeamMutationSettled =>
          WFH_TEAM_MUTATION_REJECTED.test(action.type),
        (state, action) => {
          state.list.actionError =
            (action.payload as string | undefined) ?? action.error?.message ?? "Aksi gagal.";
        },
      );
  },
});

export const { setTeamListQuery } = slice.actions;

export const wfhTeamReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

export const selectWfhTeamList = (state: WithWfhTeam): WfhTeamListState => state.wfhTeam.list;
export const selectWfhTeamListItems = (state: WithWfhTeam): WfhTeamReport[] =>
  state.wfhTeam.list.items;
export const selectWfhTeamListMeta = (state: WithWfhTeam): PaginationMeta | null =>
  state.wfhTeam.list.meta;
export const selectWfhTeamListQuery = (state: WithWfhTeam): ListTeamReportsQuery =>
  state.wfhTeam.list.query;
export const selectWfhTeamActionError = (state: WithWfhTeam): string | null =>
  state.wfhTeam.list.actionError;