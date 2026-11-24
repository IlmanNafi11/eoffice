/**
 * Unit test `pending-attachment-list` — pratinjau berkas terpilih SEBELUM
 * paket perubahan disimpan (create mode).
 *
 * Kontrak yang dijaga:
 * - Setiap `File` dirender sebagai item bernama berkasnya sendiri.
 * - Berkas gambar (`type` image/*) memakai objectURL lokal (`blob:`) — tanpa
 *   request jaringan, karena byte belum ada di server.
 * - Klik thumbnail membuka lightbox react-photo-view (`.PhotoView-Portal`).
 * - Tombol `Hapus Lampiran#N` memanggil `onRemove(file)` dengan berkas yang tepat.
 * - Unmount me-revoke semua objectURL yang dibuat.
 *
 * jsdom tak punya createObjectURL → stub (pola attachment-list.test.tsx).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PendingAttachmentList } from "@/components/changes/pending-attachment-list";

const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeEach(() => {
  URL.createObjectURL = vi.fn(
    () => `blob:stub-${Math.random().toString(36).slice(2)}`,
  );
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

const png = new File(["png-bytes"], "hasil-uji.png", { type: "image/png" });
const pdf = new File(["%PDF-1.4"], "laporan.pdf", { type: "application/pdf" });

describe("PendingAttachmentList", () => {
  it("gambar terpilih dirender thumbnail objectURL lokal + nama berkas", () => {
    render(<PendingAttachmentList files={[png]} onRemove={vi.fn()} />);

    const img = screen.getByAltText("hasil-uji.png");
    expect(img.getAttribute("src")).toMatch(/^blob:stub-/);
    expect(screen.getByText("hasil-uji.png")).toBeTruthy();
  });

  it("klik thumbnail membuka lightbox react-photo-view", async () => {
    const user = userEvent.setup();
    render(<PendingAttachmentList files={[png]} onRemove={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /pratinjau hasil-uji\.png/i }),
    );

    await waitFor(() => {
      expect(document.querySelector(".PhotoView-Portal")).toBeTruthy();
    });
  });

  it("tombol hapus memanggil onRemove dengan berkas yang tepat", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<PendingAttachmentList files={[png, pdf]} onRemove={onRemove} />);

    await user.click(screen.getByRole("button", { name: "Hapus Lampiran#2" }));

    expect(onRemove).toHaveBeenCalledWith(pdf);
  });

  it("tombol hapus tidak menyertakan nama berkas", () => {
    render(<PendingAttachmentList files={[pdf]} onRemove={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Hapus Lampiran#1" })).toBeTruthy();
  });

  /** ship#18 (b0d3bb2): dua berkas bernama sama dari folder berbeda harus
   * dirender sebagai DUA baris terpisah, dan tombol hapus menunjuk berkas
   * yang tepat — bukan bentrok pada `key`/`data-testid` nama berkas. */
  it("dua berkas bernama sama → dua baris; hapus menunjuk File yang tepat", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const buktiA = new File(["a-bytes"], "bukti.png", { type: "image/png" });
    const buktiB = new File(["b-bytes"], "bukti.png", { type: "image/png" });
    render(<PendingAttachmentList files={[buktiA, buktiB]} onRemove={onRemove} />);

    expect(screen.getAllByText("bukti.png")).toHaveLength(2);

    const removeButtons = screen.getAllByRole("button", { name: /^Hapus Lampiran#\d+$/ });
    expect(removeButtons).toHaveLength(2);
    await user.click(removeButtons[1] as Element);

    expect(onRemove).toHaveBeenCalledTimes(1);
    // Referensi eksak: `toHaveBeenCalledWith(File)` membandingkan field, dan
    // dua File bernama sama berukuran sama identik field-nya — identitas
    // referensi yang membuktikan baris KEDUA yang dihapus.
    expect(onRemove.mock.calls[0]?.[0]).toBe(buktiB);
  });

  it("berkas non-gambar tidak dirender sebagai thumbnail img", () => {
    render(<PendingAttachmentList files={[pdf]} onRemove={vi.fn()} />);

    expect(screen.queryByAltText("laporan.pdf")).toBeNull();
    expect(screen.getByText("laporan.pdf")).toBeTruthy();
  });

  it("unmount me-revoke objectURL yang pernah dibuat", () => {
    const view = render(
      <PendingAttachmentList files={[png]} onRemove={vi.fn()} />,
    );

    view.unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
