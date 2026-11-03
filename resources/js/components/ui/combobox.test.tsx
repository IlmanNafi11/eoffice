/**
 * Unit test `Combobox` (Task 5, plan ui-form-kit).
 *
 * Kontrak (D5): Command + Popover animate, generik `items {value,label,hint?}`,
 * single-select, searchable, nullable; menyalurkan `onValueChange`.
 *
 * Trigger = button `aria-haspopup="listbox"` berlabel; pencarian = `textbox`
 * milik `CommandInput` (cmdk) di dalam popover (portal).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Combobox } from "@/components/ui/combobox";

const items = [
  { value: "it", label: "Teknologi Informasi", hint: "Bidang IT" },
  { value: "hr", label: "Sumber Daya Manusia" },
  { value: "fin", label: "Keuangan" },
];

type ComboboxTestProps = Partial<
  Pick<
    React.ComponentProps<typeof Combobox>,
    | "items"
    | "value"
    | "onValueChange"
    | "placeholder"
    | "searchPlaceholder"
    | "emptyMessage"
    | "clearable"
    | "aria-label"
  >
>;

function renderCombobox(props: ComboboxTestProps = {}) {
  const onValueChange =
    props.onValueChange ?? ((_value: string | null) => undefined);
  const value = props.value ?? null;
  return render(
    <Combobox
      items={items}
      value={value}
      onValueChange={onValueChange}
      placeholder={props.placeholder ?? "Pilih evaluator"}
      searchPlaceholder={props.searchPlaceholder}
      emptyMessage={props.emptyMessage}
      clearable={props.clearable}
      aria-label={props["aria-label"] ?? "Evaluator"}
    />,
  );
}

describe("Combobox — generik single-select", () => {
  it("menampilkan placeholder saat value kosong", () => {
    renderCombobox({ value: null });
    expect(screen.getByRole("combobox", { name: "Evaluator" }).textContent).toContain(
      "Pilih evaluator",
    );
  });

  it("value penetapan parent menampilkan label item", () => {
    renderCombobox({ value: "fin" });
    expect(screen.getByRole("combobox", { name: "Evaluator" }).textContent).toContain(
      "Keuangan",
    );
  });

  it("buka → ketik filter → pilih opsi → onValueChange(value)", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderCombobox({ value: null, onValueChange });

    await user.click(screen.getByRole("combobox", { name: "Evaluator" }));

    const search = await screen.findByPlaceholderText(/cari/i);
    await user.type(search, "sumber");

    await waitFor(() =>
      expect(screen.queryByText("Keuangan")).toBeNull(),
    );
    await user.click(screen.getByText("Sumber Daya Manusia"));

    expect(onValueChange).toHaveBeenCalledWith("hr");
  });

  it("filter tanpa hasil menampilkan pesan kosong", async () => {
    const user = userEvent.setup();
    renderCombobox({ value: null });

    await user.click(screen.getByRole("combobox", { name: "Evaluator" }));
    await user.type(await screen.findByPlaceholderText(/cari/i), "zzz");

    await screen.findByText(/tidak ada hasil/i);
  });

  it("reset → onValueChange(null)", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderCombobox({ value: "it", onValueChange });

    await user.click(screen.getByRole("button", { name: /hapus pilihan/i }));
    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("tanpa value tidak ada tombol hapus", () => {
    renderCombobox({ value: null });
    expect(screen.queryByRole("button", { name: /hapus pilihan/i })).toBeNull();
  });

  it("keyboard: buka → ketik filter → Enter memilih item ter-highlight", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderCombobox({ value: null, onValueChange });

    await user.click(screen.getByRole("combobox", { name: "Evaluator" }));
    const search = await screen.findByPlaceholderText(/cari/i);
    await user.type(search, "sumber");
    await waitFor(() => expect(screen.queryByText("Keuangan")).toBeNull());

    // cmdk menyorot item pertama hasil filter; Enter memilihnya.
    await user.keyboard("{Enter}");

    expect(onValueChange).toHaveBeenCalledWith("hr");
  });

  it("keyboard: Escape menutup popover tanpa mengubah value", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderCombobox({ value: null, onValueChange });

    await user.click(screen.getByRole("combobox", { name: "Evaluator" }));
    await screen.findByPlaceholderText(/cari/i);
    await user.keyboard("{Escape}");

    await waitFor(() => {
      const triggers = screen.queryAllByRole("combobox", { name: "Evaluator" });
      const closed = triggers.some((t) => t.getAttribute("aria-expanded") === "false");
      expect(closed).toBe(true);
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
