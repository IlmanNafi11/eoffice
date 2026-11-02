/**
 * Unit test `MonthInput` (adapter bulan, pola D3 seperti `DateInput`).
 *
 * Kontrak: state form tetap `string` `yyyy-MM` atau `""` — call-site tidak
 * berubah bentuk. Trigger menampilkan label bulan terformat (locale id) atau
 * placeholder; pilih bulan → `onChange("yyyy-MM")`; clear → `onChange("")`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { MonthInput } from "@/components/ui/month-input";

describe("MonthInput — kontrak string yyyy-MM", () => {
  it("kosong menampilkan placeholder", () => {
    render(<MonthInput value="" onChange={vi.fn()} placeholder="Pilih bulan" />);
    expect(screen.getByRole("button", { name: /pilih bulan/i })).toBeTruthy();
  });

  it("nilai terisi → label bulan Indonesia terbaca", () => {
    render(<MonthInput value="2026-09" onChange={vi.fn()} />);
    // Trigger memuat label; tombol hapus bersarang punya nama aksesibel sendiri.
    expect(
      screen.getByRole("button", { name: /September 2026/i }).textContent,
    ).toContain("September 2026");
  });

  it("pilih bulan dari popover → onChange('yyyy-MM')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthInput value="" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /pilih bulan/i }));
    // Grid 12 bulan: klik "Maret" pada tahun yang ditampilkan.
    await user.click(await screen.findByRole("button", { name: "Maret" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-03$/),
    );
  });

  it("tahun bisa dimundurkan sebelum memilih bulan", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthInput value="2026-09" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /September 2026/i }));
    await user.click(screen.getByRole("button", { name: /tahun sebelumnya/i }));
    expect(screen.getByText("2025")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Januari" }));
    expect(onChange).toHaveBeenCalledWith("2025-01");
  });

  it("tombol hapus → onChange('')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MonthInput value="2026-09" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /hapus bulan/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});