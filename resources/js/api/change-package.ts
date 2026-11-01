/**
 * Modul API domain Change Package (modul change-package).
 *
 * Kontrak `postman/specs/openapi.yaml` tag `Change Package` (12 op): list
 * (`GET /changes`), create (`POST /changes`), show (`GET /changes/{id}`),
 * update (`PUT /changes/{id}`), delete (`DELETE /changes/{id}`), submit
 * (`POST /changes/{id}/submit`), approve/reject (`POST /changes/{id}/approve|reject`),
 * upload lampiran (`POST /changes/{id}/attachments`, multipart), export PDF
 * inisiasi/implementasi (`GET /changes/{id}/pdf/*`), dan referensi
 * `GET /change-types`.
 *
 * Disiplin envelope: 10 op JSON lewat `api` (unwrap interceptor); list =
 * `ApiResponse::paginated` (`{data[], meta}`) → `{ packages, meta }` (pola
 * a78e547), sisanya envelope `{data}` lewat `requireData`. 2 op PDF binary
 * lewat `httpClient` blob — bypass unwrap. Approve/reject TANPA dialog alasan
 * (Resolved #4): body `{}` — `DecidePackageRequest.rules()` kosong.
 *
 * Lampiran multipart memakai kunci `files[]` persis cara parsing array PHP
 * (`UploadChangePackageAttachmentsRequest`).
 */
import { api, ApiError, httpClient, requireData } from "@/api/client";
import {
  ChangePackage,
  ChangeType,
  ListPackagesQuery,
  PackageDraftInput,
  PackageSubmitInput,
  PaginationMeta,
} from "@/api/types";

/** GET /changes — daftar paginated + meta dari `Unwrapped.meta`. */
export async function listPackages(
  query: ListPackagesQuery = {},
): Promise<{ packages: ChangePackage[]; meta: PaginationMeta }> {
  const params: Record<string, unknown> = {};
  if (query.per_page !== undefined) params.per_page = query.per_page;
  if (query.page !== undefined) params.page = query.page;
  if (query.status !== undefined) params.status = query.status;
  if (query.field_id !== undefined) params.field_id = query.field_id;

  const res = await api.get<ChangePackage[]>(
    "/changes",
    Object.keys(params).length > 0 ? { params } : {},
  );
  const meta = res.meta;
  return {
    packages: res.data ?? [],
    meta: {
      current_page: meta?.current_page ?? 1,
      last_page: meta?.last_page ?? 1,
      per_page: meta?.per_page,
      total: meta?.total ?? 0,
    },
  };
}

/** POST /changes — buat draft (initiation + implementation opsional). */
export async function createPackage(input: PackageDraftInput): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>("/changes", input);
  return requireData(res.data, "createPackage");
}

/** GET /changes/{id} — detail (relasi `change_types`/`attachments` di-load). */
export async function showPackage(packageId: number): Promise<ChangePackage> {
  const res = await api.get<ChangePackage>(`/changes/${packageId}`);
  return requireData(res.data, "showPackage");
}

/** PUT /changes/{id} — perbarui draft (owner only, status draft). */
export async function updatePackage(
  packageId: number,
  input: PackageDraftInput,
): Promise<ChangePackage> {
  const res = await api.put<ChangePackage>(`/changes/${packageId}`, input);
  return requireData(res.data, "updatePackage");
}

/** DELETE /changes/{id} — `SuccessResponse` tanpa `data`; kembalikan message. */
export async function deletePackage(packageId: number): Promise<string> {
  const res = await api.del(`/changes/${packageId}`);
  return res.message ?? "";
}

/** POST /changes/{id}/submit — full-payload; server persisten form + status pending. */
export async function submitPackage(
  packageId: number,
  input: PackageSubmitInput,
): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>(`/changes/${packageId}/submit`, input);
  return requireData(res.data, "submitPackage");
}

/** POST /changes/{id}/approve — body kosong (tanpa reason, Resolved #4). */
export async function approvePackage(packageId: number): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>(`/changes/${packageId}/approve`, {});
  return requireData(res.data, "approvePackage");
}

/** POST /changes/{id}/reject — body kosong (tanpa reason, Resolved #4). */
export async function rejectPackage(packageId: number): Promise<ChangePackage> {
  const res = await api.post<ChangePackage>(`/changes/${packageId}/reject`, {});
  return requireData(res.data, "rejectPackage");
}

/**
 * POST /changes/{id}/attachments — multipart `files[]`, max 10 file.
 * Envelope `{data: AttachmentResource[]}` → array lampiran yang tersimpan.
 */
export async function uploadPackageAttachments(
  packageId: number,
  files: File[],
): Promise<{ id: number; url: string; sort_order: number }[]> {
  const form = new FormData();
  files.forEach((file, i) => form.append(`files[${i}]`, file));
  const res = await api.postForm<{ id: number; url: string; sort_order: number }[]>(
    `/changes/${packageId}/attachments`,
    form,
  );
  return requireData(res.data, "uploadPackageAttachments");
}

/**
 * GET /changes/{id}/pdf/initiation — binary `application/pdf` (non-envelope).
 * Tidak melewati unwrap interceptor: ambil Blob langsung dari `httpClient`.
 * Pada 4xx interceptor memberi `ApiError.responseBody` = Blob; decode pesan
 * server (422 tanda tangan belum diatur) agar sampai UI.
 */
export async function exportInitiationPdf(packageId: number): Promise<Blob> {
  return exportPackagePdf(`/changes/${packageId}/pdf/initiation`);
}

/** GET /changes/{id}/pdf/implementation — binary `application/pdf`. */
export async function exportImplementationPdf(packageId: number): Promise<Blob> {
  return exportPackagePdf(`/changes/${packageId}/pdf/implementation`);
}

/** GET /change-types — referensi dropdown, tanpa permission gate (hanya auth). */
export async function listChangeTypes(): Promise<ChangeType[]> {
  const res = await api.get<ChangeType[]>("/change-types");
  return requireData(res.data, "listChangeTypes");
}

/** Bersama 2 op PDF: ambil blob, dekode pesan error dari body JSON bila 4xx. */
async function exportPackagePdf(url: string): Promise<Blob> {
  try {
    const res = await httpClient.get<Blob>(url, { responseType: "blob" });
    return res.data;
  } catch (error) {
    if (error instanceof ApiError && error.responseBody instanceof Blob) {
      throw new ApiError(error.kind, await blobMessage(error.responseBody), {
        status: error.status,
        errors: error.errors,
      });
    }
    throw error;
  }
}

/** Ambil `message` dari body Blob (envelope JSON error), fallback teks raw.
 *  `FileReader` (bukan `blob.text()`) agar juga jalan di jsdom (test). */
async function blobMessage(blob: Blob): Promise<string> {
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsText(blob);
  });
  try {
    const parsed = JSON.parse(text) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message) return parsed.message;
  } catch {
    // teks non-JSON — jatuh ke raw text di bawah.
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : "Gagal mengunduh PDF.";
}