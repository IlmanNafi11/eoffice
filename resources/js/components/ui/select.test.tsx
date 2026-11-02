/**
 * Smoke test komponen `Select` hasil generate shadcn + animate-ui.
 *
 * Tujuan (bukan test perilaku bisnis, melainkan bukti R1 dari plan):
 * primitif Radix `Select` dari `@animate-ui/react/primitives/radix-ui` membuka
 * content via Portal dan menerima klik opsi di jsdom — pola yang akan dipakai
 * semua migrasi select (Task 9–12) dan combobox (Task 8).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function renderSelect(onValueChange = vi.fn(), value?: string) {
  return render(
    <Select onValueChange={onValueChange} value={value}>
      <SelectTrigger aria-label="Pilih tim">
        <SelectValue placeholder="Pilih tim" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="it">Teknologi</SelectItem>
        <SelectItem value="hr">SDM</SelectItem>
      </SelectContent>
    </Select>,
  );
}

describe("Select (animate-ui primitive)", () => {
  it("membuka content lewat portal lalu memanggil onValueChange saat opsi diklik", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderSelect(onChange);

    // trigger menampilkan placeholder sebelum ada pilihan.
    const trigger = screen.getByRole("combobox", { name: "Pilih tim" });
    expect(trigger.textContent).toContain("Pilih tim");

    await user.click(trigger);

    // option hidup di dalam Portal; queried dari seluruh document.
    const option = await screen.findByRole("option", { name: "SDM" });
    await user.click(option);

    expect(onChange).toHaveBeenCalledWith("hr");
  });
});