/**
 * Unit test `FileInput` (Task 4, plan ui-form-kit).
 *
 * Kontrak (D4): Button animate + input file visually-hidden + nama file;
 * `onFileChange(File | null)`. Empat consumer tinggal ganti elemen.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FileInput } from "@/components/ui/file-input";

describe("FileInput — kontrak onFileChange", () => {
  it("tanpa file menampilkan placeholder", () => {
    render(<FileInput onFileChange={vi.fn()} aria-label="Lampiran" />);
    expect(screen.getByText(/pilih file|belum ada file/i)).toBeTruthy();
  });

  it("memilih file → onFileChange(File) dan nama tampil", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    render(<FileInput onFileChange={onFileChange} aria-label="Lampiran" />);

    const file = new File(["isi"], "laporan.pdf", { type: "application/pdf" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();

    await user.upload(input, file);

    expect(onFileChange).toHaveBeenCalledWith(file);
    await screen.findByText("laporan.pdf");
  });

  it("mengganti file → onFileChange(File) dengan file baru", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    render(<FileInput onFileChange={onFileChange} aria-label="Lampiran" />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, new File(["a"], "pertama.txt", { type: "text/plain" }));
    await user.upload(input, new File(["b"], "kedua.txt", { type: "text/plain" }));

    expect(onFileChange).toHaveBeenCalledTimes(2);
    expect(onFileChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "kedua.txt" }),
    );
    await screen.findByText("kedua.txt");
  });

  it("tombol hapus file → onFileChange(null) dan kembali ke placeholder", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    render(<FileInput onFileChange={onFileChange} aria-label="Lampiran" />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, new File(["x"], "hapus.txt", { type: "text/plain" }));
    await screen.findByText("hapus.txt");

    await user.click(screen.getByRole("button", { name: /hapus file/i }));
    expect(onFileChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText(/pilih file|belum ada file/i)).toBeTruthy();
  });

  it("value terkontrol eksternal: parent mengganti file → nama tampil", () => {
    const file = new File(["y"], "eksternal.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    render(<FileInput onFileChange={vi.fn()} file={file} aria-label="Lampiran" />);
    expect(screen.getByText("eksternal.docx")).toBeTruthy();
  });
});