/**
 * Modul API domain admin (modul admin) — 11 operasi `openapi.yaml`:
 * tag User Management (6 op), RBAC Management (3 op), Settings (2 op).
 *
 * `listTeams` (tag Organization) adalah op PINJAMAN dari `api/wfh-team.ts`
 * dan tidak diduplikasi di sini.
 *
 * Disiplin envelope: list = `ApiResponse::paginated` (`{data[], meta}`) untuk
 * `listUsers`; aksi berkontrak `data` lewat `requireData`; `deleteUser`
 * mengembalikan pesan envelope (tanpa `data`).
 */
import { api, requireData } from "@/api/client";
import {
  AdminPermission,
  AdminRole,
  AdminUser,
  ImportResult,
  ListUsersQuery,
  PaginationMeta,
  SettingsMap,
  StoreUserInput,
  UpdateUserInput,
} from "@/api/types";

/**
 * GET /admin/users — envelope `ApiResponse::paginated` → `{ users, meta }`
 * (pola `a78e547` `listWfhTeamReports`, bukan paginator raw). Query
 * `per_page`/`page` dikirim hanya bila terisi.
 */
export async function listUsers(
  query: ListUsersQuery = {},
): Promise<{ users: AdminUser[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;

  const res = await api.get<AdminUser[]>(
    "/admin/users",
    Object.keys(params).length > 0 ? { params } : {},
  );
  const meta = res.meta;
  return {
    users: res.data ?? [],
    meta: {
      current_page: meta?.current_page ?? 1,
      last_page: meta?.last_page ?? 1,
      per_page: meta?.per_page,
      total: meta?.total ?? 0,
    },
  };
}

/** POST /admin/users — 201; password kosong → server injek default dari Settings. */
export async function createUser(input: StoreUserInput): Promise<AdminUser> {
  const res = await api.post<AdminUser>("/admin/users", input);
  return requireData(res.data, "createUser");
}

/** GET /admin/users/{id} — 404 "User tidak ditemukan." dipisah server dari 403. */
export async function getUserById(userId: number): Promise<AdminUser> {
  const res = await api.get<AdminUser>(`/admin/users/${userId}`);
  return requireData(res.data, "getUserById");
}

/** PUT /admin/users/{id} — semua opsional; `permissions` sync penuh bila dikirim. */
export async function updateUser(userId: number, input: UpdateUserInput): Promise<AdminUser> {
  const res = await api.put<AdminUser>(`/admin/users/${userId}`, input);
  return requireData(res.data, "updateUser");
}

/** DELETE /admin/users/{id} — mengembalikan pesan envelope "User berhasil dihapus.". */
export async function deleteUser(userId: number): Promise<string | null> {
  const res = await api.del<null>(`/admin/users/${userId}`);
  return res.message;
}

/** POST /admin/users/import — multipart `file`; hasil `{imported, skipped, errors[]}`. */
export async function importUsers(file: File): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.postForm<ImportResult>("/admin/users/import", form);
  return requireData(res.data, "importUsers");
}

/** GET /admin/roles — daftar role + permission masing-masing. */
export async function listRoles(): Promise<AdminRole[]> {
  const res = await api.get<AdminRole[]>("/admin/roles");
  return requireData(res.data, "listRoles");
}

/** PUT /admin/roles/{id}/permissions — sync penuh; 422 lockout dirender apa adanya. */
export async function updateRolePermissions(
  roleId: number,
  permissions: string[],
): Promise<AdminRole> {
  const res = await api.put<AdminRole>(`/admin/roles/${roleId}/permissions`, { permissions });
  return requireData(res.data, "updateRolePermissions");
}

/** GET /admin/permissions — daftar `{id, name}`. */
export async function listPermissions(): Promise<AdminPermission[]> {
  const res = await api.get<AdminPermission[]>("/admin/permissions");
  return requireData(res.data, "listPermissions");
}

/** GET /admin/settings — map flat `{key: value}` (nilai ter-decode). */
export async function listSettings(): Promise<SettingsMap> {
  const res = await api.get<SettingsMap>("/admin/settings");
  return requireData(res.data, "listSettings");
}

/** PUT /admin/settings/{key} — `value` selalu string + `encodeURIComponent(key)`. */
export async function updateSetting(
  key: string,
  value: string,
): Promise<{ key: string; value: unknown }> {
  const res = await api.put<{ key: string; value: unknown }>(
    `/admin/settings/${encodeURIComponent(key)}`,
    { value },
  );
  return requireData(res.data, "updateSetting");
}