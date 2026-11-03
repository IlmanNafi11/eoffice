/**
 * adminSlice — state domain RBAC admin (modul admin).
 *
 * - `users`: daftar paginated + query aktif (page/perPage) + `current` untuk
 *   prefill edit (pola `changePackageSlice.list`/`.current`);
 * - `roles`/`permissions`/`settings`: cache fetch-once-per-session
 *   (pola `fetchChangeTypes` `condition`) — roles/permissions konsumen bersama
 *   RolesPage + UserFormPage, settings hanya SettingsPage;
 * - mutasi dengan `messageOf` + matcher; `delete` menghapus baris list;
 *   `syncRolePermissions` memperbarui baris cache roles; `updateSetting`
 *   memperbarui map cache settings; `importUsers` menyimpan hasil + error list.
 *
 * Pelajaran `a602c46` ditegakkan di level slice: `pending` TIDAK membersihkan
 * `error` — error bertahan sampai fetch/mutasi sukses (refetch pasca-mutasi
 * gagal tak boleh melenyapkan pesan 422/403).
 */
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  deleteUser,
  getUserById,
  importUsers,
  listPermissions,
  listRoles,
  listSettings,
  listUsers,
  updateRolePermissions,
  updateSetting,
} from "@/api/admin";
import type {
  AdminPermission,
  AdminRole,
  AdminUser,
  ImportResult,
  ListUsersQuery,
  PaginationMeta,
  SettingsMap,
} from "@/api/types";

export type AdminFetchStatus = "idle" | "loading" | "succeeded" | "failed";

export interface AdminUsersListState {
  items: AdminUser[];
  meta: PaginationMeta | null;
  status: AdminFetchStatus;
  error: string | null;
  /** Query aktif (dispatch terakhir) — dipertahankan pagination. */
  page: number;
  perPage: number | null;
  /** requestId dispatch list terakhir — untuk membuang respons basi (race). */
  latestRequestId: string | null;
}

export interface AdminCurrentState {
  data: AdminUser | null;
  status: AdminFetchStatus;
  error: string | null;
  /** requestId dispatch detail terakhir — respons basi (id lama) dibuang. */
  latestRequestId: string | null;
}

/** Cache fetch-once: `items` null sampai pernah succeeded. */
export interface AdminCacheState<T> {
  items: T | null;
  status: AdminFetchStatus;
  error: string | null;
}

export interface AdminState {
  users: AdminUsersListState;
  current: AdminCurrentState;
  roles: AdminCacheState<AdminRole[]>;
  permissions: AdminCacheState<AdminPermission[]>;
  settings: AdminCacheState<SettingsMap>;
  /** Hasil import terakhir — panel hasil {imported, skipped, errors[]}. */
  import: ImportResult | null;
}

export function initialAdminState(): AdminState {
  return {
    users: {
      items: [],
      meta: null,
      status: "idle",
      error: null,
      page: 1,
      perPage: null,
      latestRequestId: null,
    },
    current: { data: null, status: "idle", error: null, latestRequestId: null },
    roles: { items: null, status: "idle", error: null },
    permissions: { items: null, status: "idle", error: null },
    settings: { items: null, status: "idle", error: null },
    import: null,
  };
}

/** Pesan error siap tampil; `ApiError`/`Error` sama-sama punya `message`. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Terjadi kesalahan. Coba lagi.";
}

/** Bentuk state minimal untuk kondisi cache (`getState(): WithAdmin`). */
interface WithAdmin {
  admin: AdminState;
}

// ── Fetch ───────────────────────────────────────────────────────────

/** GET /admin/users — daftar paginated + query aktif. */
export const fetchUsers = createAsyncThunk<
  { users: AdminUser[]; meta: PaginationMeta },
  ListUsersQuery | undefined
>(
  "admin/fetchUsers",
  async (query, { rejectWithValue }) => {
    try {
      return await listUsers(query ?? {});
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /admin/users/{id} — prefill edit. */
export const fetchUser = createAsyncThunk<AdminUser, number>(
  "admin/fetchUser",
  async (userId, { rejectWithValue }) => {
    try {
      return await getUserById(userId);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** GET /admin/roles — cache sekali per sesi. */
export const fetchRoles = createAsyncThunk<AdminRole[], void, { state: WithAdmin }>(
  "admin/fetchRoles",
  async (_, { rejectWithValue }) => {
    try {
      return await listRoles();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
  {
    condition: (_arg, { getState }) => getState().admin.roles.status !== "succeeded",
  },
);

/** GET /admin/permissions — cache sekali per sesi. */
export const fetchPermissions = createAsyncThunk<AdminPermission[], void, { state: WithAdmin }>(
  "admin/fetchPermissions",
  async (_, { rejectWithValue }) => {
    try {
      return await listPermissions();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
  {
    condition: (_arg, { getState }) => getState().admin.permissions.status !== "succeeded",
  },
);

/** GET /admin/settings — map cache sekali per sesi. */
export const fetchSettings = createAsyncThunk<SettingsMap, void, { state: WithAdmin }>(
  "admin/fetchSettings",
  async (_, { rejectWithValue }) => {
    try {
      return await listSettings();
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
  {
    condition: (_arg, { getState }) => getState().admin.settings.status !== "succeeded",
  },
);

// ── Mutasi ──────────────────────────────────────────────────────────

// (create/update user dipanggil langsung dari UserFormPage via api/admin.ts —
// tanpa thunk; state `current` untuk prefill edit diisi fetchUser saja.)

/** DELETE /admin/users/{id} — kembalikan pesan sukses. */
export const deleteUserThunk = createAsyncThunk<string, number>(
  "admin/deleteUser",
  async (userId, { rejectWithValue }) => {
    try {
      return (await deleteUser(userId)) ?? "User berhasil dihapus.";
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** POST /admin/users/import — multipart file; hasil {imported, skipped, errors[]}. */
export const importUsersThunk = createAsyncThunk<ImportResult, File>(
  "admin/importUsers",
  async (file, { rejectWithValue }) => {
    try {
      return await importUsers(file);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** PUT /admin/roles/{id}/permissions — sync penuh. */
export const syncRolePermissionsThunk = createAsyncThunk<
  AdminRole,
  { roleId: number; permissions: string[] }
>(
  "admin/syncRolePermissions",
  async ({ roleId, permissions }, { rejectWithValue }) => {
    try {
      return await updateRolePermissions(roleId, permissions);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

/** PUT /admin/settings/{key} — value scalar atau array (backend menerima array). */
export const updateSettingThunk = createAsyncThunk<
  { key: string; value: unknown },
  { key: string; value: string | number | boolean | (string | number)[] }
>(
  "admin/updateSetting",
  async ({ key, value }, { rejectWithValue }) => {
    try {
      return await updateSetting(key, value);
    } catch (error) {
      return rejectWithValue(messageOf(error));
    }
  },
);

const slice = createSlice({
  name: "admin",
  initialState: initialAdminState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // ── List users ───────────────────────────────────────────
      .addCase(fetchUsers.pending, (state, action) => {
        // Jangan bersihkan error: refetch pasca-mutasi gagal tak boleh
        // melenyapkan pesan (a602c46).
        state.users.status = "loading";
        const q = action.meta.arg ?? {};
        state.users.page = q.page ?? 1;
        state.users.perPage = q.per_page ?? null;
        state.users.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        if (state.users.latestRequestId !== action.meta.requestId) return;
        state.users.status = "succeeded";
        state.users.items = action.payload.users;
        state.users.meta = action.payload.meta;
        // Sinkron `per_page` efektif (server clamp, ClampsPerPage) supaya
        // refetch pasca-mutasi/pagination tak mengirim nilai yang di-clamp.
        if (action.payload.meta.per_page != null) {
          state.users.perPage = action.payload.meta.per_page;
        }
        state.users.error = null;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        if (state.users.latestRequestId !== action.meta.requestId) return;
        state.users.status = "failed";
        state.users.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat daftar user.";
      })
      // ── User detail (prefill edit) ───────────────────────────
      .addCase(fetchUser.pending, (state, action) => {
        // Error tak dibersihkan saat pending (a602c46).
        state.current.status = "loading";
        const requestedId = action.meta.arg;
        if (state.current.data && state.current.data.id !== requestedId) {
          state.current.data = null;
        }
        state.current.latestRequestId = action.meta.requestId;
      })
      .addCase(fetchUser.fulfilled, (state, action) => {
        if (state.current.latestRequestId !== action.meta.requestId) return;
        state.current.status = "succeeded";
        state.current.data = action.payload;
        state.current.error = null;
      })
      .addCase(fetchUser.rejected, (state, action) => {
        if (state.current.latestRequestId !== action.meta.requestId) return;
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat user.";
      })
      // ── Delete ───────────────────────────────────────────────
      .addCase(deleteUserThunk.pending, (state) => {
        state.users.status = "loading";
      })
      .addCase(deleteUserThunk.fulfilled, (state, action) => {
        state.users.status = "succeeded";
        const id = action.meta.arg;
        state.users.items = state.users.items.filter((u) => u.id !== id);
        if (state.current.data?.id === id) state.current.data = null;
        state.users.error = null;
      })
      .addCase(deleteUserThunk.rejected, (state, action) => {
        state.users.status = "failed";
        state.users.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal menghapus user.";
      })
      // ── Import ───────────────────────────────────────────────
      .addCase(importUsersThunk.pending, (state) => {
        state.users.status = "loading";
      })
      .addCase(importUsersThunk.fulfilled, (state, action) => {
        state.users.status = "succeeded";
        state.import = action.payload;
        state.users.error = null;
      })
      .addCase(importUsersThunk.rejected, (state, action) => {
        state.users.status = "failed";
        state.users.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Import gagal.";
      })
      // ── Cache roles / permissions / settings ─────────────────
      .addCase(fetchRoles.pending, (state) => {
        state.roles.status = "loading";
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.roles.status = "succeeded";
        state.roles.items = action.payload;
        state.roles.error = null;
      })
      .addCase(fetchRoles.rejected, (state, action) => {
        state.roles.status = "failed";
        state.roles.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat role.";
      })
      .addCase(fetchPermissions.pending, (state) => {
        state.permissions.status = "loading";
      })
      .addCase(fetchPermissions.fulfilled, (state, action) => {
        state.permissions.status = "succeeded";
        state.permissions.items = action.payload;
        state.permissions.error = null;
      })
      .addCase(fetchPermissions.rejected, (state, action) => {
        state.permissions.status = "failed";
        state.permissions.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat permission.";
      })
      .addCase(fetchSettings.pending, (state) => {
        state.settings.status = "loading";
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.settings.status = "succeeded";
        state.settings.items = action.payload;
        state.settings.error = null;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.settings.status = "failed";
        state.settings.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal memuat setting.";
      })
      // ── syncRolePermissions: update baris cache roles ─────────
      .addCase(syncRolePermissionsThunk.pending, (state) => {
        state.current.status = "loading";
      })
      .addCase(syncRolePermissionsThunk.fulfilled, (state, action) => {
        const updated = action.payload;
        if (state.roles.items) {
          const idx = state.roles.items.findIndex((r) => r.id === updated.id);
          if (idx !== -1) state.roles.items[idx] = updated;
        }
        state.current.status = "succeeded";
        state.current.error = null;
      })
      .addCase(syncRolePermissionsThunk.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal menyimpan role.";
      })
      // ── updateSetting: update map cache settings ──────────────
      .addCase(updateSettingThunk.pending, (state) => {
        state.current.status = "loading";
      })
      .addCase(updateSettingThunk.fulfilled, (state, action) => {
        const { key, value } = action.payload;
        if (state.settings.items) {
          state.settings.items[key] = value;
        }
        state.current.status = "succeeded";
        state.current.error = null;
      })
      .addCase(updateSettingThunk.rejected, (state, action) => {
        state.current.status = "failed";
        state.current.error =
          (action.payload as string | undefined) ?? action.error.message ?? "Gagal menyimpan setting.";
      });
  },
});

export const adminReducer = slice.reducer;

// ── Selectors ───────────────────────────────────────────────────────

export const selectAdminUsersList = (state: WithAdmin): AdminUsersListState => state.admin.users;
export const selectAdminUsersItems = (state: WithAdmin): AdminUser[] => state.admin.users.items;
export const selectAdminUsersMeta = (state: WithAdmin): PaginationMeta | null =>
  state.admin.users.meta;
export const selectAdminUsersPage = (state: WithAdmin): number => state.admin.users.page;
export const selectAdminCurrentUser = (state: WithAdmin): AdminCurrentState => state.admin.current;
export const selectAdminCurrentUserData = (state: WithAdmin): AdminUser | null =>
  state.admin.current.data;
export const selectAdminRoles = (state: WithAdmin): AdminRole[] | null => state.admin.roles.items;
export const selectAdminPermissions = (state: WithAdmin): AdminPermission[] | null =>
  state.admin.permissions.items;
export const selectAdminSettings = (state: WithAdmin): SettingsMap | null =>
  state.admin.settings.items;
export const selectAdminImport = (state: WithAdmin): ImportResult | null => state.admin.import;