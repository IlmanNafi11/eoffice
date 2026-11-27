/**
 * Test ThemeToggle — modul `theme-modes` (Task 8).
 *
 * Kontrak yang dijaga (spec §theme-modes):
 * - Toggle membuka dropdown Terang/Gelap/Sistem dengan `data-testid="theme-toggle"`.
 * - Memilih Gelap menambah class `dark` pada `documentElement`, Terang
 *   menghapusnya, Sistem mengikuti `prefers-color-scheme` (via `matchMedia`
 *   polyfill `matches: false` → terang).
 * - Item tema aktif ditandai (`aria-checked` / `data-state="checked"`).
 * - Pilihan disimpan ke localStorage `theme` sehingga bertahan setelah reload.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/layout/theme-toggle";

/** Render toggle di dalam ThemeProvider dengan konfigurasi produksi (app.tsx). */
function renderToggle() {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="theme"
      disableTransitionOnChange
    >
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("ThemeToggle — pemilihan tema", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("memilih Gelap men-set class dark pada documentElement", async () => {
    renderToggle();

    await userEvent.click(screen.getByTestId("theme-toggle"));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /gelap/i }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("memilih Terang menghapus class dark", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await userEvent.click(screen.getByTestId("theme-toggle"));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /terang/i }),
    );

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("memilih Sistem mengikuti prefers-color-scheme (terang saat matches false)", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await userEvent.click(screen.getByTestId("theme-toggle"));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /sistem/i }),
    );

    // Polyfill matchMedia di test/setup.ts melaporkan `matches: false`
    // (prefers light) → class `dark` tidak boleh ada.
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("menyimpan pilihan ke localStorage key `theme`", async () => {
    renderToggle();

    await userEvent.click(screen.getByTestId("theme-toggle"));
    await userEvent.click(
      screen.getByRole("menuitemradio", { name: /gelap/i }),
    );

    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  /** Ship review #22: jalur Sistem saat `prefers-color-scheme: dark`
   *  (polyfill di-overrides ke matches: true) → class `dark` harus muncul. */
  it("memilih Sistem mengikuti prefers-color-scheme (gelap saat matches true)", async () => {
    const realMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("dark"),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    });

    try {
      renderToggle();
      await userEvent.click(screen.getByTestId("theme-toggle"));
      await userEvent.click(
        screen.getByRole("menuitemradio", { name: /sistem/i }),
      );

      expect(document.documentElement.classList.contains("dark")).toBe(true);
    } finally {
      window.matchMedia = realMatchMedia;
    }
  });

  it("menandai item tema aktif di dropdown", async () => {
    window.localStorage.setItem("theme", "dark");
    renderToggle();

    await userEvent.click(screen.getByTestId("theme-toggle"));

    const gelap = screen.getByRole("menuitemradio", { name: /gelap/i });
    expect(
      gelap.getAttribute("aria-checked") === "true" ||
        gelap.getAttribute("data-state") === "checked",
    ).toBe(true);
  });

  it("merender trigger dengan aria-label Tema", () => {
    renderToggle();

    expect(
      screen.getByTestId("theme-toggle").getAttribute("aria-label"),
    ).toMatch(/tema/i);
  });
});
