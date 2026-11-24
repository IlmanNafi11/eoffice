/**
 * Unit test `upload-validate` (plan Task 9 bagian 1 — upload-errors).
 *
 * Pre-check client menyalin rule backend SECARA LITERAL (FormRequest
 * `AppendAttendanceRequest` + `UploadChangePackageAttachmentsRequest`):
 * - signature  : PNG/JPG/JPEG, maksimal 2MB;
 * - attendance : JPG/JPEG/PNG, maksimal 2MB;
 * - attachment : JPG/JPEG/PNG, maksimal 10MB, maksimal 10 berkas.
 *
 * Kontrak: `validateUploads(files, rule)` → `null` = lolos; `string` = pesan
 * Indonesia siap tampil (toast + inline). Backend tetap final gate.
 */
import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_RULE,
  ATTENDANCE_RULE,
  SIGNATURE_RULE,
  validateUploads,
  type UploadRule,
} from "./upload-validate";

function fileOfSize(bytes: number, name: string, type: string): File {
  return new File([new ArrayBuffer(bytes)], name, { type });
}

describe("validateUploads — ukuran", () => {
  it("menolak file > maxBytes dengan pesan label (2MB signature)", () => {
    const big = fileOfSize(3 * 1024 * 1024, "s.png", "image/png");
    expect(validateUploads([big], SIGNATURE_RULE)).toBe(
      "Ukuran tanda tangan maksimal 2MB.",
    );
  });

  it("menolak file tepat di atas batas attachment 10MB", () => {
    const big = fileOfSize(10 * 1024 * 1024 + 1, "doc.png", "image/png");
    expect(validateUploads([big], ATTACHMENT_RULE)).toBe(
      "Ukuran lampiran maksimal 10MB.",
    );
  });

  it("file tepat maxBytes lolos (boundary inklusif, sama dengan backend max:2048KB)", () => {
    const exact = fileOfSize(2 * 1024 * 1024, "s.png", "image/png");
    expect(validateUploads([exact], SIGNATURE_RULE)).toBeNull();
  });
});

describe("validateUploads — tipe", () => {
  // ship#17: kedua rule multi-file harus diuji TIPE-nya. ATTENDANCE_RULE
  // saja tidak mengunci ATTACHMENT_RULE — kalau mimes lampiran bergeser
  // (mis. PDF diterima), seluruh suite tetap hijau padahal backend 422.
  const typeRules = [
    { rule: ATTENDANCE_RULE, label: "foto absensi" },
    { rule: ATTACHMENT_RULE, label: "lampiran" },
  ] as const;

  for (const { rule, label } of typeRules) {
    it(`[${label}] menolak tipe salah via MIME (image/gif)`, () => {
      const gif = fileOfSize(8, "x.gif", "image/gif");
      expect(validateUploads([gif], rule)).toBe(
        `Format ${label} harus JPG, JPEG, atau PNG.`,
      );
    });

    it(`[${label}] menolak tipe salah via ekstensi nama file saat MIME kosong`, () => {
      // Beberapa browser/agent mengirim MIME kosong; ekstensi tetap dicek
      // agar .gif tidak lolos pre-check (kontrak backend tetap final gate).
      const gif = fileOfSize(8, "x.gif", "");
      expect(validateUploads([gif], rule)).toBe(
        `Format ${label} harus JPG, JPEG, atau PNG.`,
      );
    });

    it(`[${label}] menolak file dengan ekstensi benar tapi MIME palsu di luar allowlist`, () => {
      // evil.png dengan type palsu tidak boleh lolos pre-check hanya karena
      // ekstensinya benar (ship review #13: pre-check harus mirror server).
      const evil = fileOfSize(8, "evil.png", "application/x-httpd-php");
      expect(validateUploads([evil], rule)).toBe(
        `Format ${label} harus JPG, JPEG, atau PNG.`,
      );
    });

    it(`[${label}] menerima file dengan ekstensi benar dan MIME kosong`, () => {
      const png = fileOfSize(8, "foto.png", "");
      expect(validateUploads([png], rule)).toBeNull();
    });

    it(`[${label}] menolak file tanpa ekstensi walau MIME benar`, () => {
      const noExt = fileOfSize(8, "foto", "image/png");
      expect(validateUploads([noExt], rule)).toBe(
        `Format ${label} harus JPG, JPEG, atau PNG.`,
      );
    });

    it(`[${label}] menerima jpg/jpeg/png (ketiga varian)`, () => {
      expect(
        validateUploads(
          [
            fileOfSize(8, "a.jpg", "image/jpeg"),
            fileOfSize(8, "b.jpeg", "image/jpeg"),
            fileOfSize(8, "c.png", "image/png"),
          ],
          rule,
        ),
      ).toBeNull();
    });
  }
});

describe("validateUploads — jumlah (attachment)", () => {
  it("menolak 11 file (max 10)", () => {
    const files = Array.from({ length: 11 }, (_, i) =>
      fileOfSize(8, `f${i}.png`, "image/png"),
    );
    expect(validateUploads(files, ATTACHMENT_RULE)).toBe(
      "Maksimal 10 lampiran.",
    );
  });

  it("menerima tepat 10 file", () => {
    const files = Array.from({ length: 10 }, (_, i) =>
      fileOfSize(8, `f${i}.png`, "image/png"),
    );
    expect(validateUploads(files, ATTACHMENT_RULE)).toBeNull();
  });
});

describe("validateUploads — kontrak", () => {
  it("lolos → null", () => {
    const ok = fileOfSize(8, "ok.png", "image/png");
    expect(validateUploads([ok], ATTENDANCE_RULE)).toBeNull();
  });

  it("melaporkan pelanggaran PERTAMA (size dicek sebelum tipe)", () => {
    const bad = fileOfSize(3 * 1024 * 1024, "x.gif", "image/gif");
    expect(validateUploads([bad], SIGNATURE_RULE)).toBe(
      "Ukuran tanda tangan maksimal 2MB.",
    );
  });

  it("rule tanpa maxCount tidak membatasi jumlah", () => {
    const rule: UploadRule = {
      maxBytes: 1024,
      mimeTypes: ["image/png"],
      label: "Berkas",
    };
    const files = Array.from({ length: 25 }, (_, i) =>
      fileOfSize(8, `f${i}.png`, "image/png"),
    );
    expect(validateUploads(files, rule)).toBeNull();
  });
});
