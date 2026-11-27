/**
 * wfhTeamSlice — state domain Laporan WFH Tim (modul wfh-team-reports +
 * modul wfh-team-report-detail).
 *
 * Kontrak (lihat `tasks/plan.md` Task 2 + Task 5):
 * - state `list { items, meta, query, status, error, actionError }` —
 *   dua kanal error terpisah: `error` untuk fetch daftar, `actionError`
 *   untuk mutasi create/approve/reject. Pemisahan ini adalah inti
 *   regresi `a602c46` (pesan 403/422 mutasi tak boleh lenyap saat refetch);
 * - state `detail { data, status, error }` — halaman `/team-reports/:id`;
 *   data selalu dari endpoint (deep-link/refresh aman), dan mutasi
 *   approve/reject pada laporan yang sedang dibuka me-refetch detail
 *   pasca-mutasi (bersama list);
 * - thunks memanggil modul `@/api/wfh-team` (satu-satunya tempat yang tahu
 *   bentuk request), bukan axios langsung;
 * - mutasi fulfilled → update baris di `list.items` (in-place) lalu refetch
 *   daftar dengan query aktif (sumber kebenaran = server pasca-mutasi);
 * - mutasi rejected → set `actionError` dan TIDAK refetch (akar `a602c46`).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { toUiError } from "@/lib/ui-errors";
import type { Messaged } from "@/api/client";
import * as wfhTeamApi from "@/api/wfh-team";
import type {
  CreateTeamReportInput,
  ListTeamReportsQuery,
  PaginationMeta,
  WfhTeamReport,
  WfhTeamReportDetail,
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

export interface WfhTeamDetailState {
  data: WfhTeamReportDetail | null;
  status: WfhTeamFetchStatus;
  error: string | null;
  /** requestId dispatch detail terakhir — membuang respons basi (race,
   *  selaras guard list). */
  latestRequestId: string | null;
}

export interface WfhTeamState {
  list: WfhTeamListState;
  detail: WfhTeamDetailState;
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
    detail: { data: null, status: "idle", error: null, latestRequestId: null },
  };
}

/**
 * Pesan error siap tampil lewat seam `toUiError` (detail transport tidak
 * pernah sampai ke UI; pesan domain server tetap diteruskan apa adanya).
 */
function messageOf(error: unknown): string {
  return toUiError(error).message;
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

/** GET /admin/wfh/team-reports/{id} — detail laporan tim + members[] live. */
export const fetchWfhTeamReportDetail = createAsyncThunk<
  WfhTeamReportDetail,
  number
>(
  "wfhTeam/fetchReportDetail",
  async (teamReportId, { rejectWithValue }) => {
    try {
      return await wfhTeamApi.getWfhTeamReport(teamReportId);
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
  mutate: () => Promise<Messaged<WfhTeamReport>>,
  refetch: () => Promise<unknown>,
  activeDetailId: number | undefined,
  refetchDetail: (teamReportId: number) => Promise<unknown>,
): Promise<Messaged<WfhTeamReport>> {
  const result = await mutate();
  await refetch(); // gagal refetch → list.error, bukan menggagalkan mutasi
  // Detail hanya di-refetch bila laporan yang dimutasi memang sedang dibuka
  // (mutasi dari halaman list tidak boleh memicu GET detail).
  if (result.id === activeDetailId) await refetchDetail(result.id);
  return result;
}

/** POST /admin/wfh/team-reports — server memaksa status=pending + created_by. */
export const createWfhTeamReport = createAsyncThunk<
  Messaged<WfhTeamReport>,
  CreateTeamReportInput,
  { state: WithWfhTeam }
>(
  "wfhTeam/createReport",
  async (input, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      const activeDetailId = state.wfhTeam.detail.data?.id;
      return await mutateAndRefetch(
        () => wfhTeamApi.createWfhTeamReport(input),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
        activeDetailId,
        (id) => dispatch(fetchWfhTeamReportDetail(id)),
      );
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /admin/wfh/team-reports/{id}/approve — payload kosong. */
export const approveWfhTeamReport = createAsyncThunk<
  Messaged<WfhTeamReport>,
  number,
  { state: WithWfhTeam }
>(
  "wfhTeam/approveReport",
  async (teamReportId, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      const activeDetailId = state.wfhTeam.detail.data?.id;
      return await mutateAndRefetch(
        () => wfhTeamApi.approveWfhTeamReport(teamReportId),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
        activeDetailId,
        (id) => dispatch(fetchWfhTeamReportDetail(id)),
      );
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /admin/wfh/team-reports/{id}/reject — alasan wajib. */
export const rejectWfhTeamReport = createAsyncThunk<
  Messaged<WfhTeamReport>,
  { teamReportId: number; reason: string },
  { state: WithWfhTeam }
>(
  "wfhTeam/rejectReport",
  async ({ teamReportId, reason }, { rejectWithValue, getState, dispatch }) => {
    try {
      const state = getState();
      const activeDetailId = state.wfhTeam.detail.data?.id;
      return await mutateAndRefetch(
        () => wfhTeamApi.rejectWfhTeamReport(teamReportId, { reason }),
        () => dispatch(fetchWfhTeamReports(state.wfhTeam.list.query)),
        activeDetailId,
        (id) => dispatch(fetchWfhTeamReportDetail(id)),
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
    /** Reset/ganti query filter list tanpa menyentuh items/status (dipakai
     *  mount). Reset PENUH, bukan merge: kunci yang tidak dikirim hilang,
     *  supaya sisa `page`/`per_page` navigasi sebelumnya tidak selamat dan
     *  refetch mutasi konsisten dengan fetch mount (ship review). */
    setTeamListQuery(state, action: PayloadAction<ListTeamReportsQuery>) {
      state.list.query = { ...action.payload };
    },
    /** Buang pesan mutasi lama (dipanggil saat dialog create dibuka ulang). */
    clearWfhTeamActionError(state) {
      state.list.actionError = null;
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
      // ── Fetch detail ──────────────────────────────────────────
      .addCase(fetchWfhTeamReportDetail.pending, (state, action) => {
        state.detail.status = "loading";
        state.detail.error = null;
        state.detail.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchWfhTeamReportDetail.fulfilled, (state, action) => {
        if (state.detail.latestRequestId !== action.meta.requestId) return;
        state.detail.status = "succeeded";
        state.detail.data = action.payload;
        state.detail.error = null;
      })
      .addCase(fetchWfhTeamReportDetail.rejected, (state, action) => {
        if (state.detail.latestRequestId !== action.meta.requestId) return;
        state.detail.status = "failed";
        state.detail.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          "Gagal memuat detail laporan tim.";
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
        (action): action is { type: string; payload: Messaged<WfhTeamReport> } =>
          WFH_TEAM_MUTATION_FULFILLED.test(action.type),
        (state, action) => {
          state.list.actionError = null;
          // `message` milik envelope toast — jangan bocor ke cache resource.
          const { message: _message, ...resource } = action.payload;
          const idx = state.list.items.findIndex((r) => r.id === resource.id);
          if (idx !== -1) state.list.items[idx] = resource;
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

/** Bersihkan pesan mutasi lama — dipanggil saat dialog create DIBUKA, agar
 * error 422 dari percobaan sebelumnya tidak muncul kembali di dialog baru
 * (ship#17: `openCreate` mereset pilihan form, bukan `actionError` redux). */
export const clearWfhTeamActionError = slice.actions.clearWfhTeamActionError;

export const { setTeamListQuery } = slice.actions;

export const selectWfhTeamDetail = (state: WithWfhTeam): WfhTeamDetailState =>
  state.wfhTeam.detail;

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