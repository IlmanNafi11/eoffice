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

/**
 * jsdom tidak menyediakan `ResizeObserver`; internal animasi `@animate-ui/react`
 * (`internal/value-swap`, dipakai primitif Select) memakainya saat mount untuk
 * mengawasi teks value. Stub minimal: constructor no-op dengan observe/
 * unobserve/disconnect — cukup karena test tidak mengukur layout.
 */
if (!window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    writable: true,
    value: ResizeObserverStub,
  });
}

/**
 * Radix primitives (Select/Popover/Command) memakai pointer capture + scroll
 * lock saat konten terbuka; jsdom tidak menyediakan `hasPointerCapture`/
 * `setPointerCapture`/`releasePointerCapture` maupun `Element.scrollIntoView`.
 * Stub no-op: cukup untuk membuka portal & mengklik opsi di test.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

/**
 * Primitif animate-ui memakai Web Animations API untuk stagger content (Select/
 * Popover/Command) dan `SVGGeometryElement` untuk mode stroke indikator check.
 * jsdom tidak menyediakan keduanya. Stub minimal: `animate` mengembalikan
 * `finished: Promise.resolve()` sehingga `staggerRows` langsung settle; test
 * tidak mengukur animasi, hanya interaksi buka → pilih.
 */
if (!Element.prototype.animate) {
  Element.prototype.animate = function animate(
    _keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    const opts =
      typeof options === "number" ? { duration: options } : (options ?? {});
    // Cast: stub hanya memenuhi permukaan yang dipakai animate-ui (finished,
    // finish, effect.getComputedTiming, dst.) — bukan Animation penuh.
    return {
      id: (opts as KeyframeAnimationOptions).id ?? "",
      playState: "finished" as const,
      currentTime: opts.duration ?? 0,
      finished: Promise.resolve(this),
      effect: {
        getComputedTiming: () => ({ endTime: opts.duration ?? 0 }),
      },
      finish() {},
      cancel() {},
      pause() {},
      play() {},
    } as unknown as Animation;
  };
}
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}
if (typeof window.SVGGeometryElement === "undefined") {
  // jsdom menyediakan SVGElement; alias cukup agar `el instanceof
  // SVGGeometryElement` aman (memilih mode "fade" untuk elemen non-SVG).
  Object.defineProperty(window, "SVGGeometryElement", {
    configurable: true,
    writable: true,
    value: window.SVGElement ?? Object,
  });
}


afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
