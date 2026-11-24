/**
 * Kamus label role — satu sumber tampilan human-friendly (plan Task 5,
 * spec cross-module-fixes; pola `PERMISSION_META`).
 *
 * Role tak dikenal SELALU jatuh ke nama mentah (fallback): grid RBAC dan
 * daftar user harus mencerminkan data server apa pun isinya, agar admin tak
 * pernah buta terhadap role baru.
 */

import type { AdminRoleName } from "@/api/types";

export const ROLE_LABELS: Record<AdminRoleName, string> = {
  admin: "Admin",
  kepala_bidang: "Kepala Bidang",
  kepala_tim: "Kepala Tim",
  staf: "Staf",
};
