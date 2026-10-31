/**
 * Unit test `pdf-download` (frontend-phase2 — modul wfh-reports).
 * Kontrak yang dijaga (plan Task "Primitives shared", spec §Risks):
 * - Blob → `URL.createObjectURL` → anchor klik → `URL.revokeObjectURL`;
 * - sumber blob = callback `getBlob` (helper `exportWfhReportPdf`), komponen
 *   tidak menanamkan path;
 * - klik beruntun tidak bocor: object URL sebelumnya di-revoke;
 * - getBlob gagal → pesan error tampil, tidak unhandled rejection.
 * jsdom tidak punya createObjectURL/revokeObjectURL → stub seperti
 * ProfilePage.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PdfDownloadButton } from "./pdf-download";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  anchorClick.mockClear();
});
afterAll(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
  anchorClick.mockRestore();
});

describe("PdfDownloadButton", () => {
  it("klik → blob jadi object URL → anchor klik → revoke", async () => {
    const getBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    render(<PdfDownloadButton getBlob={getBlob} filename="laporan.pdf">Unduh PDF</PdfDownloadButton>);

    await userEvent.click(screen.getByRole("button", { name: /unduh pdf/i }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it("klik kedua berhasil setelah yang pertama (tidak compact error state)", async () => {
    const getBlob = vi.fn().mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    render(<PdfDownloadButton getBlob={getBlob} filename="laporan.pdf">Unduh PDF</PdfDownloadButton>);

    await userEvent.click(screen.getByRole("button", { name: /unduh pdf/i }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /unduh pdf/i }));
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2));
  });

  it("getBlob gagal → pesan error tampil, tidak melempar", async () => {
    const getBlob = vi.fn().mockRejectedValue(new Error("jaringan putus"));
    render(<PdfDownloadButton getBlob={getBlob} filename="laporan.pdf">Unduh PDF</PdfDownloadButton>);

    await userEvent.click(screen.getByRole("button", { name: /unduh pdf/i }));

    await waitFor(() =>
      expect(screen.getByText(/gagal mengunduh pdf/i)).toBeTruthy(),
    );
  });
});