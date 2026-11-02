/**
 * Modul API organisasi — endpoint non-admin-scoped pemilihan user
 * (picker evaluator). `GET /users` (operationId `listUsersForPicker`):
 * membaca daftar user aktif satu bidang (non-admin, `field_id` diabaikan)
 * atau seluruh bidang aktif (admin/`user.manage`, opsi `field_id`).
 * Respons `Envelope<UserResource[]>` non-paginated.
 */
import { api } from "@/api/client";
import type { ListFieldUsersQuery, PickerUser } from "@/api/types";


/**
 * GET /users — daftar user aktif untuk dropdown picker.
 * Tidak ter-paginasi; non-admin ter-scope bidang sendiri.
 */
export async function listFieldUsers(
  query: ListFieldUsersQuery = {},
): Promise<PickerUser[]> {
  const params: Record<string, unknown> = {};
  if (query.field_id !== undefined) params.field_id = query.field_id;

  const res = await api.get<PickerUser[]>(
    "/users",
    Object.keys(params).length > 0 ? { params } : {},
  );
  return res.data ?? [];
}