/**
 * Unit test `activities-editor` (frontend-phase2 — modul wfh-reports).
 * Kontrak yang dijaga (plan Task "Primitives shared", spec §Code Style):
 * - satu editor controlled: `activities` + `onChange(next[])` (orang tua yang
 *   mempersisten ke API, titik tunggal sinkronisasi);
 * - aksi tambah/ubah/hapus/reorder tampil HANYA saat `canEdit` (dihitung
 *   orang tua via helper `canEditReport(status)` → draft|rejected);
 * - `canEdit=false` → murni read-only (aksi disembunyikan, bukan disabled).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WfhReportActivity } from "@/api/types";
import { ActivitiesEditor, sortForDisplay } from "./activities-editor";

const ACT_A: WfhReportActivity = {
  id: 11,
  activity: "Menyusun laporan",
  start_time: "09:00",
  end_time: "11:00",
  sort_order: 1,
  links: [{ id: 21, url: "https://example.com/a" }],
};
const ACT_B: WfhReportActivity = {
  id: 12,
  activity: "Rapat koordinasi",
  sort_order: 2,
  links: [],
};
const ACT_C: WfhReportActivity = {
  id: 13,
  activity: "Membuat dokumen test case aplikasi eoffice",
  start_time: "08:00",
  end_time: "10:00",
  sort_order: 3,
  links: [{ id: 31, url: "https://example.com/proof" }],
};

describe("sortForDisplay", () => {
  it("mengurutkan baris sesuai sort_order tanpa memutasi input", () => {
    const input = [ACT_B, ACT_A];
    const sorted = sortForDisplay(input);
    expect(sorted.map((a) => a.id)).toEqual([11, 12]);
    expect(input.map((a) => a.id)).toEqual([12, 11]);
    expect(sorted[0]).toBe(ACT_A);
  });
});

describe("ActivitiesEditor", () => {
  it("menampilkan deskripsi + tautan tiap kegiatan", () => {
    render(<ActivitiesEditor activities={[ACT_A, ACT_B]} canEdit={false} onChange={() => {}} />);
    expect(screen.getByText("Menyusun laporan")).toBeTruthy();
    expect(screen.getByText("Rapat koordinasi")).toBeTruthy();
    expect(screen.getByText("https://example.com/a")).toBeTruthy();
  });

  it("canEdit=true → tombol tambah/ubah/hapus/reorder tampil", () => {
    render(<ActivitiesEditor activities={[ACT_A]} canEdit onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /tambah kegiatan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /ubah kegiatan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /hapus kegiatan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /naikkan/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /turunkan/i })).toBeTruthy();
  });

  it("canEdit=false → semua aksi disembunyikan (read-only)", () => {
    render(<ActivitiesEditor activities={[ACT_A]} canEdit={false} onChange={() => {}} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("tambah kegiatan: isi deskripsi → onChange mendapat baris baru", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[ACT_A]} canEdit onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /tambah kegiatan/i }));
    await userEvent.type(screen.getByLabelText(/deskripsi kegiatan/i), "Tugas baru");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next).toHaveLength(2);
    expect(next[1]!.activity).toBe("Tugas baru");
    expect(next[1]!.id).toBeUndefined();
  });

  it("hapus kegiatan: onChange tanpa baris itu", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[ACT_A, ACT_B]} canEdit onChange={onChange} />);

    const row = screen.getAllByRole("listitem")[0]!;
    await userEvent.click(within(row).getByRole("button", { name: /hapus kegiatan/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next.map((a) => a.id)).toEqual([12]);
  });

  it("reorder: 'Naikkan' kegiatan kedua menukar urutan", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[ACT_A, ACT_B]} canEdit onChange={onChange} />);

    const second = screen.getAllByRole("listitem")[1]!;
    await userEvent.click(within(second).getByRole("button", { name: /naikkan/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next.map((a) => a.id)).toEqual([12, 11]);
  });

  it("ubah kegiatan: ganti deskripsi → onChange dengan deskripsi baru", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[ACT_A]} canEdit onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /ubah kegiatan/i }));
    const desc = screen.getByLabelText(/deskripsi kegiatan/i);
    await userEvent.clear(desc);
    await userEvent.type(desc, "Laporan direvisi");
    await userEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next[0]!.activity).toBe("Laporan direvisi");
  });

  it("tambah kegiatan: waktu awal/akhir + link ikut terkirim, bukan hanya deskripsi", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[]} canEdit onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /tambah kegiatan/i }));
    await userEvent.type(screen.getByLabelText(/deskripsi kegiatan/i), "Membuat dokumen test case aplikasi eoffice");
    await userEvent.click(screen.getByRole("button", { name: /waktu pelaksanaan awal/i }));
    await userEvent.click(screen.getByRole("button", { name: /jam 08/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /menit 00/i }).at(-1)!);
    await userEvent.click(screen.getByRole("button", { name: /waktu pelaksanaan akhir/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /jam 10/i }).at(-1)!);
    await userEvent.click(screen.getAllByRole("button", { name: /menit 00/i }).at(-1)!);
    await userEvent.type(screen.getByLabelText(/link bukti kerja/i), "https://google.com");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      activity: "Membuat dokumen test case aplikasi eoffice",
      start_time: "08:00",
      end_time: "10:00",
      links: [{ url: "https://google.com" }],
    });
  });

  it("ubah kegiatan: waktu dan link baru ikut terkirim", async () => {
    const onChange = vi.fn();
    render(<ActivitiesEditor activities={[ACT_A]} canEdit onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /ubah kegiatan/i }));
    await userEvent.click(screen.getByRole("button", { name: /waktu pelaksanaan awal/i }));
    await userEvent.click(screen.getByRole("button", { name: /jam 13/i }));
    await userEvent.click(screen.getByRole("button", { name: /menit 30/i }));
    const linkInput = screen.getByLabelText(/link bukti kerja/i) as HTMLInputElement;
    await userEvent.tripleClick(linkInput);
    await userEvent.keyboard("{Backspace}");
    await userEvent.type(linkInput, "https://google.com/baru");
    await userEvent.click(screen.getByRole("button", { name: /simpan perubahan/i }));

    const next = onChange.mock.lastCall![0] as WfhReportActivity[];
    expect(next[0]).toMatchObject({ start_time: "13:30", links: [{ url: "https://google.com/baru" }] });
  });

  it("tampilan link bukti kerja dapat diklik", () => {
    render(<ActivitiesEditor activities={[ACT_C]} canEdit={false} onChange={() => {}} />);
    expect(screen.getByRole("link", { name: "https://example.com/proof" }).getAttribute("href")).toBe("https://example.com/proof");
  });
});