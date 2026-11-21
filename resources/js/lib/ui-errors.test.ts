/**
 * Unit test seam abstraksi error UI (spec `SPEC-ui-feedback.md` S3–S4, plan Task 1).
 *
 * Kontrak:
 * - toUiError menerima ApiError dari lapisan api/ dan memetakan ke kind UI + copy aman;
 * - pesan domain server terkurasi diteruskan apa adanya;
 * - teks transport teknis tidak pernah sampai ke UI;
 * - field error dipetakan ke pesan pertama, fieldMessage mengembalikan null bila tak ada.
 */
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/client";
import { UI_ERROR_COPY, fieldMessage, toUiError } from "@/lib/ui-errors";

describe("toUiError — abstraksi error", () => {
  it("422 dengan errors → kind validation, fields dipetakan", () => {
    const ui = toUiError(
      new ApiError("validation", "Data yang diberikan tidak valid.", {
        status: 422,
        errors: { photo: ["Ukuran foto maksimal 2MB."] },
      }),
    );

    expect(ui.kind).toBe("validation");
    expect(ui.message).toBe("Data yang diberikan tidak valid.");
    expect(ui.fields).toEqual({ photo: "Ukuran foto maksimal 2MB." });
  });

  it("message axios teknis pada http tanpa body → copy per kind", () => {
    const ui = toUiError(
      new ApiError("http", "Request failed with status code 500", { status: 500 }),
    );

    expect(ui.message).toBe(UI_ERROR_COPY.server);
    expect(ui.message).not.toMatch(/Request failed/);
  });

  it("pesan domain server terkurasi diteruskan apa adanya", () => {
    const ui = toUiError(
      new ApiError("http", "Hanya paket pending yang dapat disetujui.", { status: 422 }),
    );

    expect(ui.message).toBe("Hanya paket pending yang dapat disetujui.");
  });

  it("401 → kind auth dengan copy sesi berakhir", () => {
    const ui = toUiError(new ApiError("http", "Unauthenticated.", { status: 401 }));

    expect(ui.kind).toBe("auth");
    expect(ui.message).toBe(UI_ERROR_COPY.auth);
  });

  it("403 → forbidden; 404 → notFound; 429 → rateLimited", () => {
    expect(toUiError(new ApiError("http", "x", { status: 403 })).kind).toBe("forbidden");
    expect(toUiError(new ApiError("http", "x", { status: 404 })).kind).toBe("notFound");
    expect(toUiError(new ApiError("http", "x", { status: 429 })).kind).toBe("rateLimited");
  });

  it("network → kind network dengan copy koneksi", () => {
    const ui = toUiError(new ApiError("network", "Network Error"));

    expect(ui.kind).toBe("network");
    expect(ui.message).toBe(UI_ERROR_COPY.network);
  });

  it("error non-ApiError (Error biasa / undefined) → unknown, tanpa detail", () => {
    const fromError = toUiError(new Error("stack internal rahasia"));
    expect(fromError.kind).toBe("unknown");
    expect(fromError.message).toBe(UI_ERROR_COPY.unknown);

    expect(toUiError(undefined).kind).toBe("unknown");
    expect(toUiError(undefined).message).toBe(UI_ERROR_COPY.unknown);
  });

  it("fieldMessage: field dikenal → pesannya; field tak ada → null", () => {
    const ui = toUiError(
      new ApiError("validation", "invalid", {
        status: 422,
        errors: { "files.0": ["Format file harus PNG, JPG, atau JPEG."] },
      }),
    );

    expect(fieldMessage(ui, "files.0")).toBe("Format file harus PNG, JPG, atau JPEG.");
    expect(fieldMessage(ui, "files.9")).toBeNull();
  });
});
