/**
 * Pre-check upload di sisi client (plan Task 9 bagian 1 — upload-errors).
 *
 * Rule disalin SECARA LITERAL dari FormRequest backend:
 * - `AppendAttendanceRequest`        → ATTENDANCE_RULE (jpg/jpeg/png, 2MB)
 * - `UploadChangePackageAttachmentsRequest` → ATTACHMENT_RULE (10 berkas, 10MB)
 * - kontrak signature (`StoreSignatureRequest` / deskripsi Profil) → SIGNATURE_RULE
 *
 * Tujuan: menolak file yang sudah pasti salah SEBELUM request network dikirim;
 * server tetap otoritas final (magic-byte, dimensi, dsb.). Tipe dicek via
 * `file.type` + ekstensi nama file (jsdom tidak punya decoder magic-byte).
 */
export interface UploadRule {
  /** Batas ukuran per berkas dalam byte (inklusif). */
  maxBytes: number;
  /** MIME yang diterima; ekstensi nama file dipetakan dari tipe ini. */
  mimeTypes: string[];
  /** Batas jumlah berkas (hanya rule multi-file). */
  maxCount?: number;
  /** Label Indonesia untuk pesan ("Tanda tangan", "Foto absensi", …). */
  label: string;
}

/** Tanda tangan profil: PNG/JPG/JPEG, maksimal 2MB. */
export const SIGNATURE_RULE: UploadRule = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ["image/png", "image/jpeg"],
  label: "Tanda tangan",
};

/** Foto absensi per sesi: JPG/JPEG/PNG, maksimal 2MB. */
export const ATTENDANCE_RULE: UploadRule = {
  maxBytes: 2 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png"],
  label: "Foto absensi",
};

/** Lampiran paket perubahan: JPG/JPEG/PNG, maksimal 10MB, maksimal 10 berkas. */
export const ATTACHMENT_RULE: UploadRule = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ["image/jpeg", "image/png"],
  maxCount: 10,
  label: "Lampiran",
};

const ACCEPTED_EXTENSIONS = new Set(
  ["png", "jpg", "jpeg"].map((ext) => ext.toLowerCase()),
);

/** MB untuk pesan (`maxBytes` selalu kelipatan MB di rule yang ada). */
function maxMb(maxBytes: number): number {
  return maxBytes / (1024 * 1024);
}

/** Ekstensi nama file tanpa titik, huruf kecil; "" bila tak ada. */
function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Validasi daftar berkas terhadap satu rule.
 * Returns `null` bila lolos; `string` pesan Indonesia siap tampil untuk
 * pelanggaran PERTAMA (jumlah → ukuran → tipe) — pesan sudah memakai
 * `rule.label`, jadi kunci field internal tidak pernah bocor ke UI.
 */
export function validateUploads(files: File[], rule: UploadRule): string | null {
  if (rule.maxCount !== undefined && files.length > rule.maxCount) {
    return `Maksimal ${rule.maxCount} ${rule.label.toLowerCase()}.`;
  }

  for (const file of files) {
    if (file.size > rule.maxBytes) {
      return `Ukuran ${rule.label.toLowerCase()} maksimal ${maxMb(rule.maxBytes)}MB.`;
    }
    const ext = extensionOf(file.name);
    const mimeOk =
      file.type !== "" && rule.mimeTypes.includes(file.type.toLowerCase());
    const extOk = ext !== "" && ACCEPTED_EXTENSIONS.has(ext);
    if (!mimeOk && !extOk) {
      return `Format ${rule.label.toLowerCase()} harus JPG, JPEG, atau PNG.`;
    }
  }

  return null;
}
