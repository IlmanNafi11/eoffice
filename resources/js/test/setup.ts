// Global test setup: jsdom cleanup between tests.
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * jsdom tidak menyediakan `window.matchMedia`; `hooks/use-mobile` (dependency
 * `components/ui/sidebar`) memanggilnya saat mount. Polyfill minimal dengan
 * `matches: false` → shell dirender sebagai desktop di semua test.
 */
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
