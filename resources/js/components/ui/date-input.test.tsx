/**
 * Unit test adapter `DateInput` (Task 3, plan ui-form-kit).
 *
 * Kontrak (D3): value form tetap `string` `yyyy-MM-dd`/`""` — call-site TIDAK
 * mengubah state shape. Komponen mengubah ke `Date` untuk Calendar, label
 * via date-fns (locale id), clear-able.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DateInput } from "@/components/ui/date-input";

/**
 * Query hari di grid Calendar secara deterministik: `data-day` = ISO date
 * (react-day-picker selalu menulis atribut ini di cell; bebas locale/label).
 */
function dayButton(iso: string): HTMLButtonElement {
  // Calendar dirender di Popover (portal → document.body), bukan dalam container.
  const cell = document.body.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  const btn = cell?.querySelector("button");
  if (!btn) throw new Error(`day button not found for ${iso}`);
  return btn as HTMLButtonElement;
}

describe("DateInput — kontrak string", () => {
  it("value kosong menampilkan placeholder 'Pilih tanggal'", () => {
    render(<DateInput value="" onChange={vi.fn()} />);
    expect(screen.getByText("Pilih tanggal")).toBeTruthy();
  });

  it("value terisi menampilkan tanggal terformat locale id (12 Agustus 2026)", () => {
    render(<DateInput value="2026-08-12" onChange={vi.fn()} />);
    expect(screen.getByText("12 Agustus 2026")).toBeTruthy();
  });

  it("memilih tanggal → onChange string yyyy-MM-dd", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DateInput value="2026-08-12" onChange={onChange} />);
    // Calendar dibuka pada bulan value (Agustus 2026) — defaultMonth ter-pin.
    await user.click(screen.getByText("12 Agustus 2026"));

    await user.click(dayButton("2026-08-15"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("2026-08-15"),
    );
  });

  it("clear → onChange('')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <DateInput value="2026-08-12" onChange={onChange} clearable />,
    );

    await user.click(screen.getByRole("button", { name: "hapus tanggal" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("pick menutup popover & label berubah setelah state naik", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <DateInput value="2026-08-12" onChange={onChange} />,
    );

    await user.click(screen.getByText("12 Agustus 2026"));
    await user.click(dayButton("2026-08-15"));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith("2026-08-15"),
    );
    rerender(<DateInput value="2026-08-15" onChange={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText("15 Agustus 2026")).toBeTruthy(),
    );
    // Popover closed secara logis (exit animation jsdom tak menyelesaikan
    // animationend → content Radix tetap ter-mount; assert state, bukan unmount).
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /15 Agustus 2026/ })).toBeTruthy(),
    );
    const trigger = screen.getByRole("button", { name: /15 Agustus 2026/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});