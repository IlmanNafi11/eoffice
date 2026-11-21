/**
 * Test Task 3 (plan Feedback UX): prop `pending` pada `Button` + mount `<Toaster/>`.
 *
 * - `pending` → tombol nonaktif, `aria-busy="true"`, dan spinner ber-`data-slot="spinner"`.
 * - `pending` tidak diset → tidak ada ketiganya (perilaku lama tak berubah).
 * - `<Toaster/>` ter-mount tepat satu kali di `app.tsx`; toast dirender ke
 *   `document.body` via portal sonner.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

const root = resolve(import.meta.dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

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
  it("app.tsx me-mount <Toaster position top-right richColors> tepat satu kali", () => {
    const app = read("resources/js/app.tsx");
    const mounts = app.match(/<Toaster\b/g) ?? [];
    expect(mounts).toHaveLength(1);
    expect(app).toContain('position="top-right"');
    expect(app).toContain("richColors");
  });

  it("toast.success dirender ke document.body lewat portal", async () => {
    render(<Toaster position="top-right" richColors />);

    toast.success("Profil tersimpan");

    await waitFor(() => {
      expect(document.body.textContent).toContain("Profil tersimpan");
    });
  });
});
