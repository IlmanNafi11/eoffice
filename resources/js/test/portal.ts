/**
 * Helper test untuk halaman yang memakai komponen portal animate-ui/Radix
 * (Select, Popover, Command — pola kit Task 9–13).
 *
 * Masalah: saat content portal tertutup, primitif animate-ui merestore
 * visibilitas app lewat animasi exit (`aria-hidden`, `inert`,
 * `pointer-events`). jsdom tidak pernah menyelesaikan animasi tersebut,
 * sehingga sisa state "closed" lengket di DOM dan semua query/accessibility
 * berikutnya melihat halaman tersembunyi.
 *
 * Pakai:
 * - `userEvent` dari file ini (bukan import langsung) — instance dengan
 *   `pointerEventsCheck: 0` supaya kunci `pointer-events` tidak menolak klik.
 * - panggil `await settlePortal()` setelah memilih opsi/menutup portal untuk
 *   mengembalikan state visibility app sebelum interaksi/query berikutnya.
 */
import { expect } from "vitest";
import userEventLib from "@testing-library/user-event";
import { waitFor } from "@testing-library/react";

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
