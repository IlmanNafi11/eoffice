/**
 * Unit test VerifyPage (modul verification — Task 2).
 *
 * Kontrak yang dijaga (SPEC-verification.md, plan Task 2):
 * - halaman publik: merender TANPA AppShell/Sidebar/dispatch (tanpa Provider
 *   Redux dan tanpa bearer token di localStorage);
 * - on-mount fetch sekali `verifyQrToken(token)` dari `useParams()`;
 * - hasil 200 → card: doc_type, doc_number, report_date (HANYA bila ada),
 *   status (badge), message;
 * - 404 & 429 → pesan server tersaji dengan `role="alert"`;
 * - token salah bentuk (bukan `^[a-f0-9]{64}$`) → pesan
 *   "Token verifikasi tidak valid." TANPA panggilan API (dipanggil 0×).
 *
 * NB: tidak ada matcher jest-dom — pakai plain chai (`expect(el).toBeTruthy()`,
 * `el.textContent`, `screen.queryBy*` null check), konvensi module admin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/api/client";
import type { QrVerification } from "@/api/types";

vi.mock("@/api/verification", () => ({
  verifyQrToken: vi.fn(),
}));

import { verifyQrToken } from "@/api/verification";
import { VerifyPage } from "@/pages/verification/VerifyPage";

const mockedVerify = verifyQrToken as unknown as Mock;

/** Contoh kontrak openapi `QrVerificationResponse.data` (WFH Report). */
const wfhResult: QrVerification = {
  doc_type: "WFH Report",
  doc_number: "WFH-7",
  report_date: "2026-10-30",
  status: "terverifikasi",
  message: "Dokumen terverifikasi.",
};

function renderAt(token: string) {
  render(
    <MemoryRouter initialEntries={[`/verify/${token}`]}>
      <Routes>
        <Route path="/verify/:token" element={<VerifyPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const TOKEN = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("VerifyPage — guard bentuk token (klien, tanpa API)", () => {
  it("token salah bentuk → pesan 'tidak valid' tanpa panggilan API", async () => {
    renderAt("abc");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Token verifikasi tidak valid.");
    expect(mockedVerify).not.toHaveBeenCalled();
  });
});

describe("VerifyPage — hasil 200", () => {
  it("menampilkan doc_type, doc_number, report_date, status, message", async () => {
    mockedVerify.mockResolvedValue(wfhResult);

    renderAt(TOKEN);

    expect(await screen.findByText("WFH Report")).toBeTruthy();
    expect(screen.queryByText("WFH-7")).toBeTruthy();
    expect(screen.queryByText("2026-10-30")).toBeTruthy();
    expect(screen.queryByText("terverifikasi")).toBeTruthy();
    expect(screen.queryByText("Dokumen terverifikasi.")).toBeTruthy();
  });

  it("TIDAK merender report_date bila tidak ada (Change Initiation)", async () => {
    mockedVerify.mockResolvedValue({
      doc_type: "Change Initiation",
      doc_number: "CP-3",
      status: "terverifikasi",
      message: "Dokumen terverifikasi.",
    });

    renderAt(TOKEN);

    expect(await screen.findByText("Change Initiation")).toBeTruthy();
    expect(screen.queryByText("CP-3")).toBeTruthy();
    // Tanggal WFH test lain tidak boleh bocor; label tanggal tak ada.
    expect(screen.queryByText("2026-10-30")).toBeNull();
  });
});

describe("VerifyPage — error server tersaji (404 & 429)", () => {
  it("404 → pesan server dengan role=alert", async () => {
    mockedVerify.mockRejectedValue(
      new ApiError("api", "Token verifikasi tidak ditemukan.", { status: 404 }),
    );

    renderAt(TOKEN);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Token verifikasi tidak ditemukan.");
  });

  it("429 → pesan throttle server tersaji role=alert", async () => {
    mockedVerify.mockRejectedValue(
      new ApiError("http", "Too Many Attempts.", { status: 429 }),
    );

    renderAt(TOKEN);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Too Many Attempts.");
  });
});

describe("VerifyPage — halaman publik", () => {
  it("merender tanpa AppShell dan fetch tetap jalan tanpa bearer", async () => {
    mockedVerify.mockResolvedValue(wfhResult);

    renderAt(TOKEN);

    await waitFor(() => {
      expect(mockedVerify).toHaveBeenCalledWith(TOKEN);
    });
    expect(await screen.findByText("WFH Report")).toBeTruthy();
    // Publik: tanpa shell — tidak ada landmark navigasi AppShell.
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});