/**
 * Modul API domain QR Verification (modul verification) — operasi publik
 * `GET /api/verify/{token}` (`operationId: verifyQrToken`, `security: []`
 * di openapi.yaml; tanpa login). Response envelope `QrVerificationResponse`
 * di-unwrap via `requireData`; pesan error 404/429 tersaji lewat `ApiError`.
 */
import { api, requireData } from "@/api/client";
import type { QrVerification } from "@/api/types";

/** GET /verify/{token} — status verifikasi dokumen via token QR (publik). */
export async function verifyQrToken(token: string): Promise<QrVerification> {
  const unwrapped = await api.get<QrVerification>(
    `/verify/${encodeURIComponent(token)}`,
  );
  return requireData(unwrapped.data, "/verify/{token}");
}
