/**
 * Unit test store/adminSlice (modul admin).
 * Reducer + thunk diuji dengan mock modul `@/api/admin` (vi.mock), mengikuti
 * pola `changePackageSlice.test.ts`. Kontrak yang dijaga:
 * - `fetchUsers` mengisi `users.items` + `users.meta` + mempertahankan query
 *   aktif (`page`/`perPage`); error TIDAK lenyap saat pending (regresi
 *   `a602c46` — hanya sukses yang membersihkan error);
 * - `fetchUser` mengisi `current.data` untuk prefill edit; pending tak
 *   menghapus `current.error`;
 * - cache roles/permissions/settings fetch SEKALI per sesi (condition) —
 *   dispatch ulang no-op;
 * - mutasi: create/update → `current.data`; delete → hapus baris list;
 *   import → hasil `{imported, skipped, errors[]}` + error di list;
 *   syncRolePermissions → update baris cache roles; updateSetting → update
 *   map cache settings;
 * - respons fetch basi (out-of-order) dibuang via `latestRequestId` (race).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type {
  AdminPermission,
  AdminRole,
  AdminUser,
  ImportResult,
  PaginationMeta,
  SettingsMap,
} from "@/api/types";

vi.mock("@/api/admin", () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  importUsers: vi.fn(),
  listRoles: vi.fn(),
  updateRolePermissions: vi.fn(),
  listPermissions: vi.fn(),
  listSettings: vi.fn(),
  updateSetting: vi.fn(),
}));

import * as adminApi from "@/api/admin";
import {
  fetchUsers,
  fetchUser,
  fetchRoles,
  fetchPermissions,
  fetchSettings,
  createUserThunk,
  updateUserThunk,
  deleteUserThunk,
  importUsersThunk,
  syncRolePermissionsThunk,
  updateSettingThunk,
  selectAdminUsersList,
  selectAdminUsersItems,
  selectAdminUsersMeta,
  selectAdminUsersPage,
  selectAdminCurrentUser,
  selectAdminCurrentUserData,
  selectAdminRoles,
  selectAdminPermissions,
  selectAdminSettings,
  initialAdminState,
} from "@/store/adminSlice";
import { makeStore } from "@/store";

const mockedListUsers = adminApi.listUsers as unknown as Mock;
const mockedCreate = adminApi.createUser as unknown as Mock;
const mockedUser = adminApi.getUserById as unknown as Mock;
const mockedUpdate = adminApi.updateUser as unknown as Mock;
const mockedDelete = adminApi.deleteUser as unknown as Mock;
const mockedImport = adminApi.importUsers as unknown as Mock;
const mockedListRoles = adminApi.listRoles as unknown as Mock;
const mockedSyncRoles = adminApi.updateRolePermissions as unknown as Mock;
const mockedListPermissions = adminApi.listPermissions as unknown as Mock;
const mockedListSettings = adminApi.listSettings as unknown as Mock;
const mockedUpdateSetting = adminApi.updateSetting as unknown as Mock;

const meta: PaginationMeta = { current_page: 2, last_page: 3, per_page: 15, total: 32 };

const adminUser: AdminUser = {
  id: 12,
  name: "Dewi Lestari",
  nip: "199503152024011002",
  email: "dewi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.attendance.create", "wfh.report.create"],
};

const role: AdminRole = {
  id: 2,
  name: "kepala_bidang",
  permissions: ["wfh.report.approve", "wfh.report.reject"],
};

const permission: AdminPermission = { id: 7, name: "wfh.report.approve" };

const settingsMap: SettingsMap = { password_default_user: "user1234", wfh_allowed_days: [1, 2, 3] };

describe("adminSlice — initial state", () => {
  it("state awal bersih: users kosong, current null, cache kosong", () => {
    const state = initialAdminState();
    expect(state.users.items).toEqual([]);
    expect(state.users.meta).toBeNull();
    expect(state.users.page).toBe(1);
    expect(state.users.perPage).toBeNull();
    expect(state.users.status).toBe("idle");
    expect(state.users.error).toBeNull();
    expect(state.current.data).toBeNull();
    expect(state.current.status).toBe("idle");
    expect(state.current.error).toBeNull();
    expect(state.roles.items).toBeNull();
    expect(state.roles.status).toBe("idle");
    expect(state.roles.error).toBeNull();
    expect(state.permissions.items).toBeNull();
    expect(state.settings.items).toBeNull();
  });
});

describe("adminSlice — fetchUsers (list)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi items + meta + query aktif (page/perPage)", async () => {
    mockedListUsers.mockResolvedValueOnce({ users: [adminUser], meta });
    const store = makeStore();

    await store.dispatch(fetchUsers({ page: 2, per_page: 15 }));

    expect(selectAdminUsersList(store.getState()).status).toBe("succeeded");
    expect(selectAdminUsersList(store.getState()).error).toBeNull();
    expect(selectAdminUsersItems(store.getState())).toEqual([adminUser]);
    expect(selectAdminUsersMeta(store.getState())).toEqual(meta);
    expect(selectAdminUsersPage(store.getState())).toBe(2);
    expect(mockedListUsers).toHaveBeenCalledWith({ page: 2, per_page: 15 });
  });

  it("query kosong → page 1, perPage null", async () => {
    mockedListUsers.mockResolvedValueOnce({ users: [], meta });
    const store = makeStore();

    await store.dispatch(fetchUsers({}));

    expect(selectAdminUsersPage(store.getState())).toBe(1);
    expect(selectAdminUsersList(store.getState()).perPage).toBeNull();
  });

  it("gagal → status failed + error siap tampil", async () => {
    mockedListUsers.mockRejectedValueOnce(new Error("403 unauthorized"));
    const store = makeStore();

    await store.dispatch(fetchUsers({}));

    const list = selectAdminUsersList(store.getState());
    expect(list.status).toBe("failed");
    expect(list.error).toBe("403 unauthorized");
    expect(list.items).toEqual([]);
  });

  it("pending TIDAK membersihkan error (a602c46) — error bertahan sampai sukses", async () => {
    mockedListUsers.mockRejectedValueOnce(new Error("422 validation"));
    const store = makeStore();
    await store.dispatch(fetchUsers({}));
    expect(selectAdminUsersList(store.getState()).error).toBe("422 validation");

    let resolveNext!: (v: { users: AdminUser[]; meta: PaginationMeta }) => void;
    mockedListUsers.mockReturnValueOnce(
      new Promise<{ users: AdminUser[]; meta: PaginationMeta }>((r) => {
        resolveNext = r;
      }),
    );
    const pending = store.dispatch(fetchUsers({}));
    // Masih pending: error lama tidak boleh hilang.
    expect(selectAdminUsersList(store.getState()).error).toBe("422 validation");

    resolveNext({ users: [adminUser], meta });
    await pending;
    expect(selectAdminUsersList(store.getState()).error).toBeNull();
    expect(selectAdminUsersItems(store.getState())).toEqual([adminUser]);
  });

  it("respons basi (out-of-order) tidak menimpa hasil terbaru", async () => {
    let resolveSlow!: (v: { users: AdminUser[]; meta: PaginationMeta }) => void;
    const slow = new Promise<{ users: AdminUser[]; meta: PaginationMeta }>((r) => {
      resolveSlow = r;
    });
    mockedListUsers.mockReturnValueOnce(slow);
    mockedListUsers.mockResolvedValueOnce({ users: [adminUser], meta: { ...meta, current_page: 1 } });
    const store = makeStore();

    const first = store.dispatch(fetchUsers({ page: 2 }));
    const second = store.dispatch(fetchUsers({ page: 1 }));
    await second;
    resolveSlow({ users: [], meta: { ...meta, current_page: 2 } });
    await first;

    expect(selectAdminUsersMeta(store.getState())?.current_page).toBe(1);
    expect(selectAdminUsersItems(store.getState())).toEqual([adminUser]);
  });
});

describe("adminSlice — fetchUser (prefill edit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi current.data", async () => {
    mockedUser.mockResolvedValueOnce(adminUser);
    const store = makeStore();

    await store.dispatch(fetchUser(12));

    expect(selectAdminCurrentUserData(store.getState())).toEqual(adminUser);
    expect(selectAdminCurrentUser(store.getState()).status).toBe("succeeded");
    expect(selectAdminCurrentUser(store.getState()).error).toBeNull();
    expect(mockedUser).toHaveBeenCalledWith(12);
  });

  it("pending TIDAK membersihkan current.error (a602c46)", async () => {
    mockedUser.mockRejectedValueOnce(new Error("User tidak ditemukan."));
    const store = makeStore();
    await store.dispatch(fetchUser(12));
    expect(selectAdminCurrentUser(store.getState()).error).toBe("User tidak ditemukan.");

    let resolveNext!: (u: AdminUser) => void;
    mockedUser.mockReturnValueOnce(
      new Promise<AdminUser>((r) => {
        resolveNext = r;
      }),
    );
    const pending = store.dispatch(fetchUser(12));
    expect(selectAdminCurrentUser(store.getState()).error).toBe("User tidak ditemukan.");

    resolveNext(adminUser);
    await pending;
    expect(selectAdminCurrentUser(store.getState()).error).toBeNull();
    expect(selectAdminCurrentUserData(store.getState())).toEqual(adminUser);
  });
});

describe("adminSlice — cache roles/permissions/settings (sekali per sesi)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchRoles sukses mengisi cache; dispatch ulang no-op (condition)", async () => {
    mockedListRoles.mockResolvedValue([role]);
    const store = makeStore();

    await store.dispatch(fetchRoles());
    await store.dispatch(fetchRoles());

    expect(selectAdminRoles(store.getState())).toEqual([role]);
    expect(mockedListRoles).toHaveBeenCalledTimes(1);
  });

  it("fetchPermissions sukses mengisi cache; dispatch ulang no-op", async () => {
    mockedListPermissions.mockResolvedValue([permission]);
    const store = makeStore();

    await store.dispatch(fetchPermissions());
    await store.dispatch(fetchPermissions());

    expect(selectAdminPermissions(store.getState())).toEqual([permission]);
    expect(mockedListPermissions).toHaveBeenCalledTimes(1);
  });

  it("fetchSettings sukses mengisi map cache; dispatch ulang no-op", async () => {
    mockedListSettings.mockResolvedValue(settingsMap);
    const store = makeStore();

    await store.dispatch(fetchSettings());
    await store.dispatch(fetchSettings());

    expect(selectAdminSettings(store.getState())).toEqual(settingsMap);
    expect(mockedListSettings).toHaveBeenCalledTimes(1);
  });

  it("cache gagal → error tersimpan; dispatch ulang RETRY (status belum succeeded)", async () => {
    mockedListRoles.mockRejectedValueOnce(new Error("403"));
    const store = makeStore();

    await store.dispatch(fetchRoles());
    expect(store.getState().admin.roles.error).toBe("403");

    mockedListRoles.mockResolvedValueOnce([role]);
    await store.dispatch(fetchRoles());
    expect(selectAdminRoles(store.getState())).toEqual([role]);
    expect(mockedListRoles).toHaveBeenCalledTimes(2);
  });
});

describe("adminSlice — mutasi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createUserThunk fulfilled → current.data + error null", async () => {
    mockedCreate.mockResolvedValueOnce(adminUser);
    const store = makeStore();

    await store.dispatch(
      createUserThunk({ name: "Dewi", nip: "199503152024011002", email: "dewi@kominfo.go.id", roles: ["staf"] }),
    );

    expect(selectAdminCurrentUserData(store.getState())).toEqual(adminUser);
    expect(selectAdminCurrentUser(store.getState()).error).toBeNull();
    expect(mockedCreate).toHaveBeenCalledWith({
      name: "Dewi",
      nip: "199503152024011002",
      email: "dewi@kominfo.go.id",
      roles: ["staf"],
    });
  });

  it("updateUserThunk rejected → current.error berisi pesan 422", async () => {
    mockedUpdate.mockRejectedValueOnce(new Error("The nip has already been taken."));
    const store = makeStore();

    await store.dispatch(updateUserThunk({ userId: 12, input: { permissions: [] } }));

    expect(selectAdminCurrentUser(store.getState()).status).toBe("failed");
    expect(selectAdminCurrentUser(store.getState()).error).toBe("The nip has already been taken.");
  });


  it("deleteUserThunk fulfilled → hapus baris dari users.items", async () => {
    mockedDelete.mockResolvedValueOnce("User berhasil dihapus.");
    const store = makeStore();
    mockedListUsers.mockResolvedValueOnce({ users: [adminUser], meta });
    await store.dispatch(fetchUsers({}));
    expect(selectAdminUsersItems(store.getState())).toEqual([adminUser]);

    const result = await store.dispatch(deleteUserThunk(12)).unwrap();

    expect(result).toBe("User berhasil dihapus.");
    expect(selectAdminUsersItems(store.getState())).toEqual([]);
  });

  it("importUsersThunk fulfilled → hasil {imported, skipped, errors[]}", async () => {
    const result: ImportResult = { imported: 3, skipped: 1, errors: ["Baris 4: NIP sudah terdaftar."] };
    mockedImport.mockResolvedValueOnce(result);
    const store = makeStore();

    const file = new File(["x"], "u.csv", { type: "text/csv" });
    const out = await store.dispatch(importUsersThunk(file)).unwrap();

    expect(out).toEqual(result);
    expect(mockedImport).toHaveBeenCalledWith(file);
  });
  it("importUsersThunk rejected → users.error siap tampil", async () => {
    mockedImport.mockRejectedValueOnce(new Error("Import gagal. Silakan periksa format file."));
    const store = makeStore();

    await store.dispatch(importUsersThunk(new File(["x"], "u.csv", { type: "text/csv" })));

    expect(selectAdminUsersList(store.getState()).error).toBe(
      "Import gagal. Silakan periksa format file.",
    );
  });

  it("syncRolePermissionsThunk fulfilled → update baris cache roles", async () => {
    mockedListRoles.mockResolvedValueOnce([role]);
    const store = makeStore();
    await store.dispatch(fetchRoles());

    const updated: AdminRole = { ...role, permissions: ["wfh.report.approve"] };
    mockedSyncRoles.mockResolvedValueOnce(updated);

    await store.dispatch(syncRolePermissionsThunk({ roleId: 2, permissions: ["wfh.report.approve"] }));

    expect(selectAdminRoles(store.getState())).toEqual([updated]);
    expect(mockedSyncRoles).toHaveBeenCalledWith(2, ["wfh.report.approve"]);
  });

  it("updateSettingThunk fulfilled → update map cache settings", async () => {
    mockedListSettings.mockResolvedValueOnce(settingsMap);
    const store = makeStore();
    await store.dispatch(fetchSettings());

    mockedUpdateSetting.mockResolvedValueOnce({ key: "password_default_user", value: "BaruUser123!" });
    await store.dispatch(
      updateSettingThunk({ key: "password_default_user", value: "BaruUser123!" }),
    );

    expect(mockedUpdateSetting).toHaveBeenCalledWith("password_default_user", "BaruUser123!");
    expect(selectAdminSettings(store.getState())?.password_default_user).toBe("BaruUser123!");
  });
});