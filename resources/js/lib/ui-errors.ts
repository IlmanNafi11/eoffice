/**
 * Satu seam abstraksi error untuk lapisan UI (spec `SPEC-ui-feedback.md` S3–S4).
 *
 * Halaman/slice hanya boleh melihat `UiError`: detail transport (status HTTP,
 * teks axios, kelas ApiError) berhenti di sini. Pesan domain terkurasi dari
 * server diteruskan apa adanya; teks teknis diganti copy yang aman.
 */

import { ApiError } from "@/api/client";

export type UiErrorKind =
  | "validation"
  | "auth"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "rateLimited"
  | "server"
  | "network"
  | "unknown";

export interface UiError {
  kind: UiErrorKind;
  message: string;
  fields?: Record<string, string>;
}

/** Copy final per kind (dari spec; jangan diubah tanpa keputusan desain baru). */
export const UI_ERROR_COPY: Record<UiErrorKind, string> = {
  validation: "Permintaan tidak valid.",
  auth: "Sesi berakhir, silakan masuk kembali.",
  forbidden: "Anda tidak memiliki izin.",
  notFound: "Data tidak ditemukan.",
  conflict: "Terjadi konflik, muat ulang lalu coba lagi.",
  rateLimited: "Terlalu banyak permintaan.",
  server: "Terjadi kesalahan pada server.",
  network: "Koneksi bermasalah, coba lagi.",
  unknown: "Terjadi kesalahan. Coba lagi.",
};

const STATUS_KIND: Record<number, UiErrorKind> = {
  401: "auth",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  429: "rateLimited",
};

const TECHNICAL_MESSAGE = /^Request failed with status code \d+$/;

function kindFor(error: ApiError): UiErrorKind {
  if (error.kind === "validation" || error.status === 422) return "validation";
  if (error.kind === "network") return "network";
  if (error.status !== null) {
    if (error.status >= 500) return "server";
    const mapped = STATUS_KIND[error.status];
    if (mapped) return mapped;
  }
  return "unknown";
}

/** Ubah errorTransport menjadi bentuk yang aman untuk toast/banner. */
export function toUiError(error: unknown): UiError {
  if (!(error instanceof ApiError)) {
    return { kind: "unknown", message: UI_ERROR_COPY.unknown };
  }

  const kind = kindFor(error);
  const technical =
    TECHNICAL_MESSAGE.test(error.message) || error.message === "Network Error";
  const message =
    technical || kind === "auth" || kind === "network"
      ? UI_ERROR_COPY[kind]
      : error.message;

  const entries = Object.entries(error.errors ?? {})
    .map(([field, messages]) => [field, messages[0]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const fields = entries.length > 0 ? Object.fromEntries(entries) : undefined;

  return fields ? { kind, message, fields } : { kind, message };
}

/** Pesan field yang sudah diamankan, atau null bila field tidak dikirim server. */
export function fieldMessage(ui: UiError, field: string): string | null {
  return ui.fields?.[field] ?? null;
}
