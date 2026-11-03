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
  // Radix mirrors every SelectItem into a hidden native <option>
  // (SelectBubbleInput) and keeps exited content mounted (inert) until jsdom
  // completes the exit animation. Pick the visible Radix item inside the
  // active content only.
  const items = await screen.findAllByRole("option", { name: optionName });
  const item =
    items.find((el) => {
      const container = el.closest('[data-slot="select-content"], [role="listbox"]');
      const visible =
        container !== null && !container.hasAttribute("inert") && !container.hasAttribute("aria-hidden");
      return visible && el.getAttribute("data-slot") === "select-item";
    }) ?? items[items.length - 1]!;
  await userEvent.click(item);
  await settlePortal();
}

/**
 * Konten popover milik `trigger` tertentu.
 *
 * Radix memberi trigger `aria-controls` = id content-nya, jadi ini mengikat
 * helper ke popover yang benar walau halaman punya beberapa filter tanggal
 * (di jsdom popover lama tetap ter-mount karena animasi exit tak selesai).
 */
function popoverFor(trigger: HTMLElement): HTMLElement {
  const id = trigger.getAttribute("aria-controls");
  const own = id ? document.getElementById(id) : null;
  if (own) return own;
  const open = Array.from(
    document.querySelectorAll<HTMLElement>("[data-slot='popover-content']"),
  ).findLast((n) => !n.hasAttribute("inert"));
  if (!open) throw new Error("popover content not found for trigger");
  return open;
}

/**
 * Pilih tanggal dari popover `DateInput` lewat atribut `data-day` (bebas
 * locale). Kalender dibuka pada bulan berjalan; navigasi sampai sel target
 * ada (maks 24 bulan) supaya helper bebas tanggal sistem.
 */
export async function pickDate(trigger: HTMLElement, iso: string) {
  await userEvent.click(trigger);

  const nav = (dir: "prev" | "next") => {
    const host = popoverFor(trigger);
    const buttons = Array.from(host.querySelectorAll("button"));
    const target = buttons.find((b) =>
      (b.getAttribute("aria-label") ?? "").toLowerCase().includes(
        dir === "prev" ? "previous month" : "next month",
      ),
    );
    expect(target).toBeTruthy();
    return target as HTMLButtonElement;
  };

  for (let i = 0; i < 24; i += 1) {
    const host = popoverFor(trigger);
    if (host.querySelector(`[data-day="${iso}"]`)) break;
    const shown = host?.querySelector<HTMLElement>("[data-day]")?.dataset.day;
    const target = new Date(`${iso}T00:00:00`);
    const shownDate = shown ? new Date(`${shown}T00:00:00`) : new Date();
    await userEvent.click(nav(shownDate > target ? "prev" : "next"));
  }

  const host = popoverFor(trigger);
  const cell = host.querySelector<HTMLElement>(`[data-day="${iso}"]`);
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
    const host = popoverFor(trigger);
    const header = host.querySelector("[data-slot='month-input-grid']")
      ?.previousElementSibling;
    const shown = header?.textContent?.match(/(\d{4})/)?.[1];
    if (shown === undefined || Number(shown) === year) break;
    const dir = Number(shown) > year ? "tahun sebelumnya" : "tahun berikutnya";
    const btn = Array.from(host.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === dir,
    );
    expect(btn).toBeTruthy();
    await userEvent.click(btn as HTMLButtonElement);
  }
  const host = popoverFor(trigger);
  const pickBtn = Array.from(host.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === monthName,
  );
  expect(pickBtn).toBeTruthy();
  await userEvent.click(pickBtn as HTMLButtonElement);
  await settlePortal();
}
