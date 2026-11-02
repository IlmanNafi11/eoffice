/**
 * changePackageSlice — state domain Paket Perubahan (modul change-package).
 *
 * Kontrak (lihat `tasks/plan.md` Task 3):
 * - state `list { items, meta, status, error, statusFilter, page, perPage }`
 *   (tabel paginated + filter status), `current { data, status, error }`
 *   (detail + mutasi), dan `changeTypes { items, status }` (referensi cache);
 * - thunks memanggil modul `@/api/change-package` (satu-satunya tempat yang
 *   tahu bentuk request), bukan axios langsung;
 * - pagination mempertahankan filter aktif — `statusFilter`/`perPage` disimpan
 *   terpisah dari `page` agar pindah halaman tak menyapu filter yang dipilih;
 * - error simpan sebagai pesan siap tampil (string `message`); `fetchPackage`
 *   TIDAK membersihkan `current.error` saat pending agar refetch pasca-mutasi
 *   gagal tidak melenyapkan pesan 422 (pelajaran `a602c46`);
 * - `fetchChangeTypes` di-cache — sekali sukses, dispatch ulang no-op
 *   (referensi statis, seeder tak berubah di sesi).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import * as changePackageApi from "@/api/change-package";
import type {
  ChangePackage,
  ChangePackageStatus,
  ChangeType,
  ListPackagesQuery,
  PackageDraftInput,
  PackageSubmitInput,
  PaginationMeta,
} from "@/api/types";

export type ChangePackageFetchStatus = "idle" | "loading" | "succeeded" | "failed";

export interface ChangePackageListState {
  items: ChangePackage[];
  meta: PaginationMeta | null;
  status: ChangePackageFetchStatus;
  error: string | null;
  /** Filter status aktif (dari dispatch terakhir) — dipertahankan pagination. */
  statusFilter: ChangePackageStatus | null;
  page: number;
  perPage: number | null;
  /** requestId dispatch list terakhir — untuk membuang respons basi (race). */
  latestRequestId: string | null;
}

export interface ChangePackageCurrentState {
  data: ChangePackage | null;
  status: ChangePackageFetchStatus;
  error: string | null;
  /** requestId dispatch detail terakhir — respons basi (id lama/out-of-order) dibuang. */
  latestRequestId: string | null;
}

export interface ChangeTypesState {
  items: ChangeType[];
  status: ChangePackageFetchStatus;
}

export interface ChangePackageState {
  list: ChangePackageListState;
  current: ChangePackageCurrentState;
  changeTypes: ChangeTypesState;
}

export function initialChangePackageState(): ChangePackageState {
  return {
    list: {
      items: [],
      meta: null,
      status: "idle",
      error: null,
      statusFilter: null,
      page: 1,
      perPage: null,
      latestRequestId: null,
    },
    current: { data: null, status: "idle", error: null, latestRequestId: null },
    changeTypes: { items: [], status: "idle" },
  };
}

/** Pesan error siap tampil; `ApiError`/`Error` sama-sama punya `message`. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

/** Bentuk state minimal untuk membaca query aktif saat refetch pasca-mutasi. */
interface WithChangePackage {
  changePackage: ChangePackageState;
}

// ── Fetch ─────────────────────────────────────────────────────────

/** GET /changes — daftar paginated + filter status. */
export const fetchPackages = createAsyncThunk<
  { packages: ChangePackage[]; meta: PaginationMeta },
  ListPackagesQuery | undefined
>(
  "changePackage/fetchPackages",
  async (query, { rejectWithValue }) => {
    try {
      return await changePackageApi.listPackages(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /changes/{id} — detail (relasi change_types/attachments di-load). */
export const fetchPackage = createAsyncThunk<ChangePackage, number>(
  "changePackage/fetchPackage",
  async (packageId, { rejectWithValue }) => {
    try {
      return await changePackageApi.showPackage(packageId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /change-types — referensi dropdown, cache sekali per sesi. */
export const fetchChangeTypes = createAsyncThunk<
  ChangeType[],
  void,
  { state: WithChangePackage }
>(
  "changePackage/fetchChangeTypes",
  async (_, { rejectWithValue }) => {
    try {
      return await changePackageApi.listChangeTypes();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
  // Cache: bila sudah pernah succeeded, dispatch ulang adalah no-op —
  // thunk dibatalkan sebelum request dikirim (condition RTK).
  {
    condition: (_arg, { getState }) =>
      getState().changePackage.changeTypes.status !== "succeeded",
  },
);

// ── Mutasi: hasilnya resource ChangePackage → update current + baris list ──

/** POST /changes — buat draft. */
export const createPackageThunk = createAsyncThunk<ChangePackage, PackageDraftInput>(
  "changePackage/createPackage",
  async (input, { rejectWithValue }) => {
    try {
      return await changePackageApi.createPackage(input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** PUT /changes/{id} — perbarui draft. */
export const updatePackageThunk = createAsyncThunk<
  ChangePackage,
  { packageId: number; input: PackageDraftInput }
>(
  "changePackage/updatePackage",
  async ({ packageId, input }, { rejectWithValue }) => {
    try {
      return await changePackageApi.updatePackage(packageId, input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** DELETE /changes/{id} — kembalikan message sukses untuk feed UI. */
export const deletePackageThunk = createAsyncThunk<string, number>(
  "changePackage/deletePackage",
  async (packageId, { rejectWithValue }) => {
    try {
      return await changePackageApi.deletePackage(packageId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /changes/{id}/submit — full-payload, status pending. */
export const submitPackageThunk = createAsyncThunk<
  ChangePackage,
  { packageId: number; input: PackageSubmitInput }
>(
  "changePackage/submitPackage",
  async ({ packageId, input }, { rejectWithValue }) => {
    try {
      return await changePackageApi.submitPackage(packageId, input);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /changes/{id}/approve|reject — `approve` pilih op; body kosong. */
export const decidePackageThunk = createAsyncThunk<
  ChangePackage,
  { packageId: number; approve: boolean }
>(
  "changePackage/decidePackage",
  async ({ packageId, approve }, { rejectWithValue }) => {
    try {
      return approve
        ? await changePackageApi.approvePackage(packageId)
        : await changePackageApi.rejectPackage(packageId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /changes/{id}/attachments — multipart; halaman refetch detail setelahnya. */
export const uploadAttachmentsThunk = createAsyncThunk<
  { id: number; url: string; sort_order: number }[],
  { packageId: number; files: File[] }
>(
  "changePackage/uploadAttachments",
  async ({ packageId, files }, { rejectWithValue }) => {
    try {
      return await changePackageApi.uploadPackageAttachments(packageId, files);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** Aksi mutasi yang fulfilled-nya membawa `ChangePackage` — update current + baris. */
const CHANGE_PACKAGE_MUTATION_FULFILLED =
  /^changePackage\/(create|update|submit|decide)Package\/fulfilled$/;
/** Aksi mutasi yang settled (pending|rejected) — payload message string. */
const CHANGE_PACKAGE_MUTATION_SETTLED =
  /^changePackage\/(create|update|submit|decide)Package\/(pending|rejected)$/;

/** Aksi mutasi settled (pending|rejected) — payload message string. */
interface ChangePackageMutationSettled {
  type: string;
  payload?: unknown;
  error?: { message?: string };
}

const slice = createSlice({
  name: "changePackage",
  initialState: initialChangePackageState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // ── List ─────────────────────────────────────────────────
      .addCase(fetchPackages.pending, (state, action) => {
        state.list.status = "loading";
        state.list.error = null;
        const q = action.meta.arg ?? {};
        // GANTI (bukan merge): arg dispatch adalah query final — filter yang
        // dikosongkan tidak boleh diam-diam terbawa ke pagination berikut.
        state.list.statusFilter = q.status ?? null;
        state.list.page = q.page ?? 1;
        state.list.perPage = q.per_page ?? null;
        state.list.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchPackages.fulfilled, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "succeeded";
        state.list.items = action.payload.packages;
        state.list.meta = action.payload.meta;
        state.list.error = null;
      })
      .addCase(fetchPackages.rejected, (state, action) => {
        if (state.list.latestRequestId !== action.meta.requestId) return;
        state.list.status = "failed";
        state.list.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat daftar.";
      })
      // ── Detail ────────────────────────────────────────────────
      .addCase(fetchPackage.pending, (state, action) => {
        // Jangan bersihkan error: refetch pasca-mutasi gagal tak boleh
        // melenyapkan pesan 422 (a602c46) — error bertahan sampai fetch sukses.
        state.current.status = "loading";
        const requestedId = action.meta.arg;
        // Kosongkan `data` hanya saat pindah paket (id berbeda) — refetch paket
        // yang sama (pasca-mutasi) mempertahankan data agar tak flash loading.
        if (state.current.data && state.current.data.initiation.id !== requestedId) {
          state.current.data = null;
        }
        state.current.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchPackage.fulfilled, (state, action) => {
        if (state.current.latestRequestId !== action.meta.requestId) return;
        state.current.status = "succeeded";
        state.current.data = action.payload;
        state.current.error = null;
      })
      .addCase(fetchPackage.rejected, (state, action) => {
        if (state.current.latestRequestId !== action.meta.requestId) return;
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat paket.";
      })
      // ── Delete ────────────────────────────────────────────────
      .addCase(deletePackageThunk.pending, (state) => {
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(deletePackageThunk.fulfilled, (state, action) => {
        state.current.status = "succeeded";
        const id = action.meta.arg;
        state.list.items = state.list.items.filter(
          (p) => p.initiation.id !== id,
        );
        if (state.current.data?.initiation.id === id) state.current.data = null;
      })
      .addCase(deletePackageThunk.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal menghapus paket.";
      })
      // ── Upload lampiran: bukan resource utama → jalur tunggal ──
      .addCase(uploadAttachmentsThunk.pending, (state) => {
        state.current.status = "loading";
        state.current.error = null;
      })
      .addCase(uploadAttachmentsThunk.fulfilled, (state) => {
        state.current.status = "succeeded";
        state.current.error = null;
      })
      .addCase(uploadAttachmentsThunk.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal mengunggah lampiran.";
      })
      // ── Change-types (cache) ──────────────────────────────────
      .addCase(fetchChangeTypes.pending, (state) => {
        state.changeTypes.status = "loading";
      })
      .addCase(fetchChangeTypes.fulfilled, (state, action) => {
        state.changeTypes.status = "succeeded";
        state.changeTypes.items = action.payload;
      })
      .addCase(fetchChangeTypes.rejected, (state) => {
        state.changeTypes.status = "failed";
      })
      // ── Mutasi ChangePackage: update current + baris list yang cocok ──
      .addMatcher(
        (action): action is { type: string; payload: ChangePackage } =>
          CHANGE_PACKAGE_MUTATION_FULFILLED.test(action.type),
        (state, action) => {
          state.current.status = "succeeded";
          state.current.data = action.payload;
          state.current.error = null;
          const id = action.payload.initiation.id;
          const idx = state.list.items.findIndex((p) => p.initiation.id === id);
          if (idx !== -1) state.list.items[idx] = action.payload;
        },
      )
      .addMatcher(
        (action): action is ChangePackageMutationSettled =>
          CHANGE_PACKAGE_MUTATION_SETTLED.test(action.type),
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

export const changePackageReducer = slice.reducer;

// ── Selectors ─────────────────────────────────────────────────────

export const selectChangePackageList = (state: WithChangePackage): ChangePackageListState =>
  state.changePackage.list;
export const selectChangePackageListItems = (state: WithChangePackage): ChangePackage[] =>
  state.changePackage.list.items;
export const selectChangePackageListMeta = (state: WithChangePackage): PaginationMeta | null =>
  state.changePackage.list.meta;
export const selectChangePackageListStatusFilter = (
  state: WithChangePackage,
): ChangePackageStatus | null => state.changePackage.list.statusFilter;
export const selectChangePackageListPage = (state: WithChangePackage): number =>
  state.changePackage.list.page;
export const selectChangePackageCurrent = (state: WithChangePackage): ChangePackageCurrentState =>
  state.changePackage.current;
export const selectChangePackageCurrentData = (state: WithChangePackage): ChangePackage | null =>
  state.changePackage.current.data;
export const selectChangePackageChangeTypes = (state: WithChangePackage): ChangeTypesState =>
  state.changePackage.changeTypes;