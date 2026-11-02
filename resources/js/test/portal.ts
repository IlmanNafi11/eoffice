/**
 * Helper test untuk halaman yang memakai komponen portal animate-ui/Radix
 * (Select, Popover, Command, DateInput, MonthInput — pola kit Task 9–13).
 *
 * Masalah yang ditutup helper ini:
 * - Portal Radix mengunci `body { pointer-events: none }` selama content
 *   terbuka; animasi exit-nya tidak pernah selesai di jsdom sehingga kunci
 *   bocor. Instance `userEvent` di sini memakai `pointerEventsCheck: 0`.
 * - Setelah content tertutup, app wrapper bisa tetap `aria-hidden="true"` /
 *   `inert` karena animasi exit tak selesai — semua query berikutnya melihat
 *   halaman tersembunyi. `settlePortal()` melepas sisa atribut itu.
 */
import { expect } from "vitest";
import userEventLib from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";

export const userEvent = userEventLib.setup({ pointerEventsCheck: 0 });

export async function settlePortal() {
  // Tunggu konten portal tertutup (data-state closed)…
  await waitFor(() => {
    const open = document.querySelector(
      "[role='listbox'][data-state='open'], [role='dialog'][data-state='open'], [data-slot='popover-content'][data-state='open']",
    );
    expect(open).toBeNull();
  });
  // …lalu buang sisa aria-hidden/inert/pointer-events yang seharusnya dilepas
  // animasi exit (di jsdom animasi exit tidak pernah selesai).
  for (const el of Array.from(document.querySelectorAll("[aria-hidden='true']"))) {
    if (el.closest("[data-slot='select-content'], [data-slot='popover-content'], [role='listbox'], [role='dialog']")) {
      continue;
    }
    if (el.closest("svg") || el.tagName.toLowerCase() === "svg") {
      continue;
    }
    el.removeAttribute("aria-hidden");
  }
  for (const el of Array.from(document.querySelectorAll("[inert]"))) {
    if (el.closest("[data-slot='select-content'], [data-slot='popover-content'], [role='listbox'], [role='dialog']")) {
      continue;
    }
    el.removeAttribute("inert");
  }
  document.body.style.pointerEvents = "";
}

/** Pilih opsi `Select` (Radix) lewat trigger berlabel, lalu settle portal. */
export async function pickSelect(label: string | RegExp, optionName: string | RegExp) {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(await screen.findByRole("option", { name: optionName }));
  await settlePortal();
}

/**
 * Pilih tanggal dari popover `DateInput` lewat atribut `data-day` (bebas
 * locale). Kalender dibuka pada bulan berjalan; navigasi sampai sel target
 * ada (maks 24 bulan) supaya helper bebas tanggal sistem.
 */
export async function pickDate(trigger: HTMLElement, iso: string) {
  await userEvent.click(trigger);
  await screen.findByRole("button", { name: /go to the next month/i });

  for (let i = 0; i < 24; i += 1) {
    if (document.body.querySelector(`[data-day="${iso}"]`)) break;
    const target = new Date(`${iso}T00:00:00`);
    const shown = document.body.querySelector<HTMLElement>("[data-day]")?.dataset.day;
    const shownDate = shown ? new Date(`${shown}T00:00:00`) : new Date();
    const back = shownDate > target;
    await userEvent.click(
      screen.getByRole("button", {
        name: back ? /go to the previous month/i : /go to the next month/i,
      }),
    );
  }

  const cell = document.body.querySelector<HTMLElement>(`[data-day="${iso}"]`);
  expect(cell).toBeTruthy();
  await userEvent.click(cell!.querySelector("button") as HTMLButtonElement);
  await settlePortal();
}

/** Pilih bulan dari popover `MonthInput` (grid nama bulan Indonesia). */
export async function pickMonth(
  trigger: HTMLElement,
  year: number,
  monthName: string,
) {
  await userEvent.click(trigger);
  for (let guard = 0; guard < 24; guard += 1) {
    const header =
      document.querySelector("[data-slot='month-input-grid']")?.previousElementSibling;
    const shown = header?.textContent?.match(/(\d{4})/)?.[1];
    if (shown === undefined || Number(shown) === year) break;
    const dir = Number(shown) > year ? "tahun sebelumnya" : "tahun berikutnya";
    await userEvent.click(screen.getByRole("button", { name: dir }));
  }
  await userEvent.click(screen.getByRole("button", { name: monthName }));
  await settlePortal();
}