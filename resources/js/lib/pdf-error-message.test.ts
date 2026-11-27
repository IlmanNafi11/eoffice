/**
 * Unit test `pdfErrorMessage` — seam pesan bersama MonitoringPage,
 * TeamReportsPage, dan TeamReportDetailPage (ship review: helper hasil
 * ekstraksi belum punya uji langsung, khususnya cabang fallback non-Error).
 */
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client";
import { pdfErrorMessage } from "@/lib/pdf-error-message";

describe("pdfErrorMessage", () => {
  it("meneruskan pesan domain ApiError apa adanya", () => {
    expect(pdfErrorMessage(new ApiError("api", "Andi belum mengatur tanda tangan."))).toBe(
      "Andi belum mengatur tanda tangan.",
    );
  });

  it("memakai pesan Error generik bila ada", () => {
    expect(pdfErrorMessage(new Error("Jaringan terputus."))).toBe("Jaringan terputus.");
  });

  it("fallback copy aman untuk non-Error", () => {
    expect(pdfErrorMessage("bukan error")).toBe("Gagal mengunduh PDF. Coba lagi.");
    expect(pdfErrorMessage(null)).toBe("Gagal mengunduh PDF. Coba lagi.");
    expect(pdfErrorMessage(new Error(""))).toBe("Gagal mengunduh PDF. Coba lagi.");
  });
});
