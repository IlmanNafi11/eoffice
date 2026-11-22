/**
 * Satu seam abstraksi error untuk lapisan UI (spec `SPEC-ui-feedback.md` S3–S4).
 *
 * Halaman/slice hanya boleh melihat `UiError`: detail transport (status HTTP,
 * teks axios, kelas ApiError) berhenti di sini. Pesan domain terkurasi dari
 * server diteruskan apa adanya; teks teknis diganti copy yang aman.
 */

import { ApiError } from "@/api/client";

/** Label Indonesia untuk kunci field internal yang dikenal UI (spec ui-feedback S6). */
export const FIELD_LABELS: Record<string, string> = {
  photo: "Foto absensi",
  signature: "Tanda tangan",
  files: "Lampiran",
  session: "Sesi absensi",
  value: "Nilai setting",
  name: "Nama",
  email: "Email",
  nip: "NIP",
  role: "Peran",
  phone: "Telepon",
  position: "Jabatan",
  rank: "Pangkat",
  team_id: "Tim",
  // Label unik per kunci: `FIELD_KEYS` memetakan balik label → kunci, jadi
  // dua kunci berlabel sama akan saling menimpa.
  roles: "Daftar peran",
  permissions: "Permission",
  password: "Kata sandi",
};


/**
 * Kebalikan `FIELD_LABELS` untuk pemetaan balik label → kunci internal (halaman
 * memegang state field-error dengan kunci server, label hanya untuk tampilan).
 */
export const FIELD_KEYS: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([key, label]) => [label, key]),
);

/**
 * `UiError.fields` (berlabel Indonesia) → `{kunci internal: pesan}` untuk
 * komponen form yang merender error per field. Bentuk `"Lampiran N"` dipulihkan
 * ke `files.N-1` agar tetap cocok dengan validator server.
 */
export function fieldErrorsByKey(
  fields: Record<string, string> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [label, message] of Object.entries(fields ?? {})) {
    const indexed = /^Lampiran (\d+)$/.exec(label);
    if (indexed?.[1]) {
      out[`files.${Number(indexed[1]) - 1}`] = message;
    } else {
      const key = FIELD_KEYS[label];
      if (key) out[key] = message;
    }
  }
  return out;
}
/** Ambil pesan pertama tiap field; entri tanpa pesan dijatuhkan. */
function firstMessages(errors: Record<string, string[]> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors ?? {})) {
    // Pertahanan: nilai non-array (body malformed) dilewati, bukan diindeks.
    const first = Array.isArray(messages) ? messages[0] : undefined;
    if (typeof first === "string" && first) out[field] = first;
  }
  return out;
}

/**
 * Kunci field internal → label manusia. `files.N` → "Lampiran N+1"; kunci
 * tidak dikenal DIBUANG (tidak diteruskan mentah ke UI — spec ui-feedback S6).
 */
export function fieldErrorMessages(
  errors: Record<string, string[]> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(firstMessages(errors))) {
    const indexed = /^(.+)\.(\d+)$/.exec(field);
    if (indexed) {
      const [, base, index] = indexed;
      const label = base ? FIELD_LABELS[base] : undefined;
      if (label && index) out[`${label} ${Number(index) + 1}`] = message;
    } else {
      const label = FIELD_LABELS[field];
      if (label) out[label] = message;
    }
  }
  return out;
}

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
  // 401 pada login membawa pesan domain ("Email atau password salah."); hanya
  // pesan teknis/generik yang diganti copy sesi. `Unauthenticated.` adalah
  // default Laravel, bukan pesan terkurasi.
  const genericAuth = error.status === 401 &&
    (!error.message || error.message === "Unauthenticated.");
  const message =
    technical || genericAuth || kind === "network"
      ? UI_ERROR_COPY[kind]
      : error.message;

  // Kunci internal → label Indonesia (spec ui-feedback S6): `files.0` →
  // "Lampiran 1", kunci tak dikenal DIJATUHKAN — tidak pernah diteruskan
  // mentah ke UI. Bila semua kunci tak dikenal, `fields` tidak diset.
  const labeled = fieldErrorMessages(error.errors);
  const fields =
    Object.keys(labeled).length > 0 ? labeled : undefined;

  return fields ? { kind, message, fields } : { kind, message };
}

