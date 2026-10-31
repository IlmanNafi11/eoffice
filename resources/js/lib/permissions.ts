/**
 * `can` / `hasRole` — satu pintu pengecekan RBAC di sisi klien.
 *
 * Kontrak backend tetap sumber kebenaran: `permissions` pada payload user
 * (login, `/auth/me`, `/profile`) sudah berupa role + direct permission
 * gabungan (lihat `postman/specs/openapi.yaml` → `AuthUser.permissions`).
 * Frontend hanya membaca daftar itu — tidak ada grant implisit per nama role,
 * tidak ada cache permission terpisah.
 *
 * Semua fungsi menerima user yang mungkin belum terisi (null/undefined saat
 * shell render sebelum `GET /auth/me` selesai) dan menjawab `false`.
 */

/** Bentuk minimal user yang diperlukan — cukup `AuthUser` penuh maupun slice-nya. */
interface PermissionUser {
  permissions?: string[] | null;
}

/** Bentuk minimal user untuk `hasRole` — cukup `AuthUser` penuh maupun slice-nya. */
interface RoleUser {
  roles?: string[] | null;
}

type MaybeUser<T> = T | null | undefined;

/** True bila user memegang permission persis ini (string sama dengan seeder). */
export function can(
  user: MaybeUser<PermissionUser>,
  permission: string,
): boolean {
  return user?.permissions?.includes(permission) ?? false;
}

/** True bila user memegang salah satu role di daftar. */
export function hasRole(user: MaybeUser<RoleUser>, role: string): boolean {
  return user?.roles?.includes(role) ?? false;
}
