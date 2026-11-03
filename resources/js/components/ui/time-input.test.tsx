/**
 * Unit test `TimeInput` (adapter jam, pola D3 seperti `MonthInput`).
 *
 * Kontrak: state form tetap `string` `HH:mm` 24-jam atau `""` — call-site
 * tidak berubah bentuk. Trigger menampilkan `HH:mm` atau placeholder; pilih
 * jam/menit dari popover → `onChange("HH:mm")`; clear → `onChange("")`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@/test/portal";
import { TimeInput } from "@/components/ui/time-input";

describe("TimeInput — kontrak string HH:mm", () => {
  it("kosong menampilkan placeholder", () => {
    render(<TimeInput value="" onChange={vi.fn()} placeholder="Pilih jam" />);
    expect(screen.getByRole("button", { name: /pilih jam/i })).toBeTruthy();
  });

  it("nilai terisi → label HH:mm terbaca", () => {
    render(<TimeInput value="08:15" onChange={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /08:15/i }).textContent,
    ).toContain("08:15");
  });

  it("pilih jam + menit dari popover → onChange('HH:mm')", async () => {
    const onChange = vi.fn();
    render(<TimeInput value="" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /pilih jam/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^jam 08$/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^menit 15$/i }));

    expect(onChange).toHaveBeenLastCalledWith("08:15");
  });

  it("tombol hapus → onChange('')", async () => {
    const onChange = vi.fn();
    render(<TimeInput value="08:15" onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /hapus jam/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });
});