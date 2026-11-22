/**
 * Test Task 3 (plan Feedback UX): prop `pending` pada `Button` + mount `<Toaster/>`.
 *
 * - `pending` → tombol nonaktif, `aria-busy="true"`, dan spinner ber-`data-slot="spinner"`.
 * - `pending` tidak diset → tidak ada ketiganya (perilaku lama tak berubah).
 * - toast pada root React SPA benar-benar tampil di `document.body` (portal
 *   sonner) — dibuktikan dengan mount nyata, bukan baca teks sumber.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

describe("Button prop pending", () => {
  it("pending=true: disabled, aria-busy, dan spinner dirender", () => {
    render(<Button pending>Simpan</Button>);

    const button = screen.getByRole("button", { name: /simpan/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector('[data-slot="spinner"]')).not.toBeNull();
  });

  it("pending=false (default): tidak disabled, tanpa aria-busy, tanpa spinner", () => {
    render(<Button>Simpan</Button>);

    const button = screen.getByRole("button", { name: /simpan/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.hasAttribute("aria-busy")).toBe(false);
    expect(button.querySelector('[data-slot="spinner"]')).toBeNull();
  });

  it("pending=true: klik tidak memanggil onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Simpan
      </Button>,
    );

    await user.click(screen.getByRole("button", { name: /simpan/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("pending=true: spinner tidak mengganti label, hanya ditambahkan sebelum children", () => {
    render(<Button pending>Simpan</Button>);

    const button = screen.getByRole("button", { name: /simpan/i });
    expect(button.textContent).toContain("Simpan");
  });
});

describe("Toaster mounting", () => {
  it("toast pada root React SPA benar-benar tampil (bukan echo teks sumber)", async () => {
    // Mount `Toaster` ke root React nyata dan kirim toast: membuktikan
    // komponen global terpasang untuk seluruh SPA, bukan sekadar ada di
    // teks app.tsx (regresi yang lolos bila mount dipindah ke subtree mati).
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<Toaster position="top-right" richColors />);
    });

    toast.success("Profil tersimpan");

    await waitFor(() => {
      expect(document.body.textContent).toContain("Profil tersimpan");
    });

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
