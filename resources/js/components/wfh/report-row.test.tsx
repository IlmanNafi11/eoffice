/**
 * Unit test `report-row` — kolom Aksi opt-in (modul `wfh-report-actions`).
 * Kontrak yang dijaga (SPEC success #5):
 * - tanpa prop `actions` → tidak ada tombol Aksi (Monitoring tak berubah);
 * - item ter-gate status + permission, aksi tak diizinkan tidak dirender:
 *   Edit/Hapus hanya draft, Unduh PDF hanya pending|approved, Detail selalu;
 * - item memanggil handler tanpa memicu navigasi baris (`onOpen`);
 * - klik baris tetap memanggil `onOpen`.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@/test/portal";
import type { WfhReport } from "@/api/types";
import { WfhReportRow } from "./report-row";

const sessions = ["pagi", "siang", "sore"] as const;

function report(overrides: Partial<WfhReport> = {}): WfhReport {
  return {
    id: 7,
    user_id: 10,
    report_date: "2026-08-10",
    status: "draft",
    activity_count: 2,
    attendances: [],
    ...overrides,
  };
}

function renderRow(
  row: WfhReport,
  actions?: Parameters<typeof WfhReportRow>[0]["actions"],
) {
  const onOpen = vi.fn();
  render(
    <table>
      <tbody>
        <WfhReportRow report={row} sessions={[...sessions]} onOpen={onOpen} actions={actions} />
      </tbody>
    </table>,
  );
  return { onOpen };
}

function menuActions() {
  return {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onDownload: vi.fn(),
  };
}

const allAllowed = { canEdit: true, canDelete: true, canDownloadPdf: true };

describe("WfhReportRow — tanpa prop actions", () => {
  it("tidak merender tombol Aksi (kolom tidak ada)", () => {
    renderRow(report());

    expect(screen.queryByRole("button", { name: "Aksi" })).toBeNull();
  });

  it("klik baris tetap memanggil onOpen", async () => {
    const { onOpen } = renderRow(report());

    await userEvent.click(screen.getByText("2026-08-10"));

    expect(onOpen).toHaveBeenCalledWith(7);
  });
});

describe("WfhReportRow — kolom Aksi opt-in", () => {
  it("draft + semua permission → Detail, Edit, Hapus; tanpa Unduh PDF", async () => {
    renderRow(report(), { ...allAllowed, ...menuActions() });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));

    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Hapus" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Unduh PDF" })).toBeNull();
  });

  it("pending → Detail, Unduh PDF; tanpa Edit dan Hapus", async () => {
    renderRow(report({ status: "pending" }), { ...allAllowed, ...menuActions() });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));

    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Unduh PDF" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
  });

  it("approved → Unduh PDF tersedia", async () => {
    renderRow(report({ status: "approved" }), { ...allAllowed, ...menuActions() });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));

    expect(await screen.findByRole("menuitem", { name: "Unduh PDF" })).toBeTruthy();
  });

  it("permission ditolak → item tidak dirender walau status mengizinkan", async () => {
    renderRow(report(), {
      canEdit: false,
      canDelete: false,
      canDownloadPdf: false,
      ...menuActions(),
    });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));

    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Unduh PDF" })).toBeNull();
  });

  it("item Edit memanggil onEdit(report) tanpa memicu onOpen", async () => {
    const handlers = menuActions();
    const { onOpen } = renderRow(report(), { ...allAllowed, ...handlers });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    await waitFor(() => expect(handlers.onEdit).toHaveBeenCalledTimes(1));
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("item Unduh PDF meneruskan report ke handler", async () => {
    const handlers = menuActions();
    const { onOpen } = renderRow(report({ status: "approved" }), {
      ...allAllowed,
      ...handlers,
    });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unduh PDF" }));

    await waitFor(() => expect(handlers.onDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    ));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("item Hapus meneruskan report ke handler", async () => {
    const handlers = menuActions();
    const { onOpen } = renderRow(report(), { ...allAllowed, ...handlers });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Hapus" }));

    await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
    ));
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("item Detail memanggil onOpen(report.id)", async () => {
    const { onOpen } = renderRow(report(), { ...allAllowed, ...menuActions() });

    await userEvent.click(screen.getByRole("button", { name: "Aksi" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Detail" }));

    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(7));
  });
});
