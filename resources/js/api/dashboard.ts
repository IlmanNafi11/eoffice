/**
 * Modul API domain Dashboard (modul dashboard).
 *
 * Kontrak `postman/specs/openapi.yaml` tag `Dashboard` (1 op):
 * `GET /dashboard` (auth:sanctum, envelope `DashboardResponse`).
 *
 * Disiplin envelope: lewat `requireData` (pola `getWfhMonitoring`) —
 * envelope tanpa `data` = bug backend dan harus gagal-nyata, bukan `null`
 * yang diam-diam dirender UI.
 */
import { api, requireData } from "@/api/client";
import type { DashboardData } from "@/api/types";

/**
 * GET /dashboard — beranda per-permission. Seksi opsional (`queue`/`trend`/
 * `attention`) hanya ada bila peminta berhak; keputusan di backend.
 */
export async function getDashboard(): Promise<DashboardData> {
  const res = await api.get<DashboardData>("/dashboard");
  return requireData(res.data, "getDashboard");
}
