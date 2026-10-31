/**
 * Unit test `pagination` (frontend-phase2 — modul wfh-reports).
 * Kontrak yang dijaga (plan Task "Primitives shared"):
 * - generic: menerima `current_page` / `last_page` / `total`, tidak menanamkan
 *   domain WFH;
 * - "Halaman X dari Y" + total; tombol previous/next nonaktif di ujung;
 * - tanpa `meta` → tidak merender apa pun (aman dipakai list yang belum memuat).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PaginationMeta } from "@/api/types";
import { Pagination } from "./pagination";

function meta(partial: Partial<PaginationMeta> & { current_page: number; last_page: number; total: number }): PaginationMeta {
  return partial;
}

describe("Pagination", () => {
  it("menampilkan 'Halaman X dari Y' dan total", () => {
    render(<Pagination meta={meta({ current_page: 2, last_page: 4, total: 37 })} onPageChange={() => {}} />);
    expect(screen.getByText(/Halaman 2 dari 4/)).toBeTruthy();
    expect(screen.getByText(/37/)).toBeTruthy();
  });

  it("memanggil onPageChange dengan halaman berikutnya saat klik 'Berikutnya'", async () => {
    const onPageChange = vi.fn();
    render(<Pagination meta={meta({ current_page: 1, last_page: 3, total: 30 })} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("memanggil onPageChange dengan halaman sebelumnya saat klik 'Sebelumnya'", async () => {
    const onPageChange = vi.fn();
    render(<Pagination meta={meta({ current_page: 3, last_page: 3, total: 30 })} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /sebelumnya/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("menonaktifkan 'Sebelumnya' di halaman pertama", () => {
    render(<Pagination meta={meta({ current_page: 1, last_page: 3, total: 30 })} onPageChange={() => {}} />);
    expect((screen.getByRole("button", { name: /sebelumnya/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("menonaktifkan 'Berikutnya' di halaman terakhir", () => {
    render(<Pagination meta={meta({ current_page: 3, last_page: 3, total: 30 })} onPageChange={() => {}} />);
    expect((screen.getByRole("button", { name: /berikutnya/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("tanpa meta tidak merender apa pun", () => {
    render(<Pagination meta={null} onPageChange={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});