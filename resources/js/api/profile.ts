/**
 * Modul API profile (frontend-phase1).
 * GET/PUT /profile memakai `UserResource` yang sama dengan auth (ProfileData = AuthUser).
 * Upload signature memakai FormData — axios menyetel header multipart otomatis;
 * jangan set `Content-Type` manual (perlu boundary yang dibuat browser).
 */

import { api, httpClient } from "@/api/client";
import type { ProfileData, UpdateProfileRequest } from "@/api/types";

/** `#/components/schemas/SignatureUploadResponse` */
export interface SignatureUploadResponse {
  signature_path: string;
  signature_url: string;
}

/** Endpoint yang kontraknya menjamin `data` ada; envelope tanpa data = bug backend. */
function requireData<T>(value: T | null, endpoint: string): T {
  if (value === null) {
    throw new Error(`Respons ${endpoint} tidak berisi data.`);
  }
  return value;
}

/** GET /profile — profil user sesi aktif. */
export async function getProfile(): Promise<ProfileData> {
  const res = await api.get<ProfileData>("/profile");
  return requireData(res.data, "profile");
}

/** PUT /profile — field opsional; `null` untuk mengosongkan. */
export async function updateProfile(input: UpdateProfileRequest): Promise<ProfileData> {
  const res = await api.put<ProfileData>("/profile", input);
  return requireData(res.data, "profile");
}

/** POST /profile/signature — PNG/JPG/JPEG, max 2MB / 2000x2000px (divalidasi backend). */
export async function uploadSignature(signature: FormData): Promise<SignatureUploadResponse> {
  const res = await api.postForm<SignatureUploadResponse>("/profile/signature", signature);
  return requireData(res.data, "profile/signature");
}

/**
 * Ambil bytes tanda tangan lewat client ber-otorisasi, lalu jadikan object URL.
 *
 * `signature_url` menunjuk `/api/signatures/{user}` yang wajib bearer token.
 * `<img src={signature_url}>` TIDAK membawa header `Authorization`, jadi
 * permintaan itu dijawab 401 dan preview tampil kosong. Karena itu bytes diambil
 * lewat axios (interceptor menempelkan token), bukan dengan mengandalkan
 * elemen gambar.
 */
export async function fetchSignatureObjectUrl(url: string): Promise<string> {
  const res = await httpClient.get<Blob>(url, { responseType: "blob" });
  return URL.createObjectURL(res.data);
}
