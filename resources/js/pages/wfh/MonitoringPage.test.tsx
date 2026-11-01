/**
 * Unit test MonitoringPage (modul wfh-monitoring — plan Task 5).
 * Kontrak yang dijaga:
 * - pemilik `wfh.monitoring.view` melihat dua tab (Papan Harian, Semua Laporan);
 * - mount → `fetchWfhBoard` dengan tanggal hari ini (lokal); pindah tanggal →
 *   refetch; tanggal efektif dari respons ditampilkan;
 * - board dikelompokkan per tim; grup "Tanpa Tim" tanpa tombol PDF;
 * - tombol PDF per grup tim hanya untuk pemilik `wfh.report.export_pdf`
 *   (user sintetik view-only → tombol hilang); klik → `exportTeamWfhPdf`
 *   dengan `{date}` = tanggal efektif board;
 * - scope tercermin dari respons: `team_id` → "Tim saya", `field_id` →
 *   "Bidang", keduanya null → "Semua user";
 * - tab Semua Laporan: dibuka → `fetchAdminReports({})`; "Terapkan" → query
 *   terkombinasi + halaman 1; `date` menang atas `month`; `date_from`/`date_to`
 *   hanya dikirim berpasangan; `per_page` default (15) tidak dikirim;
 *   pagination mempertahankan filter aktif;
 * - klik baris → `/wfh/:reportId`;
 * - gagal fetch (403/422) → pesan server tampil dan TIDAK lenyap saat pindah
 *   tab / refetch (regresi a602c46).
 * jsdom tidak punya createObjectURL/revokeObjectURL → stub seperti
 * pdf-download.test.tsx (dipakai jalur unduh PDF tim).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/api/client";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type {
  MonitoringUser,
  PaginationMeta,
  WfhMonitoringData,
  WfhReport,
} from "@/api/types";

vi.mock("@/api/wfh-monitoring", () => ({
  getWfhMonitoring: vi.fn(),
  adminListWfhReports: vi.fn(),
  exportTeamWfhPdf: vi.fn(),
}));

vi.mock("@/api/wfh-team", () => ({
  listTeams: vi.fn(),
}));

import * as wfhMonitoringApi from "@/api/wfh-monitoring";
import * as wfhTeamApi from "@/api/wfh-team";
import { MonitoringPage } from "@/pages/wfh/MonitoringPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedBoard = wfhMonitoringApi.getWfhMonitoring as unknown as Mock;
const mockedList = wfhMonitoringApi.adminListWfhReports as unknown as Mock;
const mockedPdf = wfhMonitoringApi.exportTeamWfhPdf as unknown as Mock;
const mockedListTeams = wfhTeamApi.listTeams as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 15, total: 12 };

const timA: MonitoringUser = {
  id: 1,
  name: "Andi Prasetyo",
  nip: "199001012023011001",
  email: "andi@kominfo.go.id",
  is_active: true,
  team_id: 3,
  team: { id: 3, name: "Tim Aplikasi" },
};

const timAKedua: MonitoringUser = {
  id: 2,
  name: "Citra Dewi",
  nip: "199203012023011002",
  email: "citra@kominfo.go.id",
  is_active: true,
  team_id: 3,
  team: { id: 3, name: "Tim Aplikasi" },
};

const tanpaTim: MonitoringUser = {
  id: 3,
  name: "Budi Santoso",
  nip: "198805012020011003",
  email: "budi@kominfo.go.id",
  is_active: true,
  team_id: null,
  team: null,
};

const belumLaporanTimA: MonitoringUser = {
  id: 4,
  name: "Eka Putri",
  nip: "199504012024011004",
  email: "eka@kominfo.go.id",
  is_active: true,
  team_id: 3,
  team: { id: 3, name: "Tim Aplikasi" },
};

const boardData: WfhMonitoringData = {
  date: "2026-07-10",
  team_id: null,
  field_id: null,
  not_checked_in: [timA, tanpaTim, timAKedua],
  no_report: [belumLaporanTimA],
};

const reportA: WfhReport = {
  id: 10,
  user_id: 1,
  report_date: "2026-08-10",
  status: "pending",
  activity_count: 2,
};

const userAdmin = {
  id: 1,
  name: "Admin Utama",
  nip: "197001012000031001",
  email: "admin@kominfo.go.id",
  phone: null,
  position: "Administrator",
  rank: "Pembina Utama Muda",
  signature_url: null,
  must_change_password: false,
  is_active: true,
  roles: ["admin"],
  permissions: ["wfh.monitoring.view", "wfh.report.export_pdf"],
};

/** User sintetik: pemegang `monitoring.view` TANPA `export_pdf` (bukan role seeder). */
const userViewOnly = {
  ...userAdmin,
  id: 9,
  name: "Pengamat Only",
  roles: ["kepala_bidang"],
  permissions: ["wfh.monitoring.view"],
};

const teamResource = { id: 3, name: "Tim Aplikasi", leader_id: 5, field_id: 1 };
const teamResourceLain = { id: 4, name: "Tim Jaringan", leader_id: 6, field_id: 1 };

/** Hari ini (zona lokal) — sama seperti helper di komponen, proses yang sama. */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** renderPage dengan user khusus (default: admin pemegang 2 permission). */
function renderPageAs(user: typeof userAdmin = userAdmin) {
  const store = makeStore();
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/monitoring"]}>
        <Routes>
          <Route path="/monitoring" element={<MonitoringPage />} />
          <Route path="/wfh/:reportId" element={<div>wfh-detail-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

/** Buka tab "Semua Laporan" dan tunggu fetch pertama selesai. */
async function openReportsTab() {
  await userEvent.click(screen.getByTestId("monitoring-tab-reports"));
  await waitFor(() => {
    expect(mockedList).toHaveBeenCalledTimes(1);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedBoard.mockResolvedValue(boardData);
  mockedList.mockResolvedValue({ reports: [reportA], meta });
  mockedPdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mockedListTeams.mockResolvedValue([teamResource, teamResourceLain]);

  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("MonitoringPage — tab & papan harian", () => {
  it("pemilik monitoring.view melihat kedua tab; tab papan aktif default", async () => {
    renderPageAs();

    const boardTab = screen.getByTestId("monitoring-tab-board");
    const listTab = screen.getByTestId("monitoring-tab-reports");
    expect(boardTab.getAttribute("aria-selected")).toBe("true");
    expect(listTab.getAttribute("aria-selected")).toBe("false");

    // Board tab aktif: fetch board berjalan, list belum.
    await waitFor(() => {
      expect(mockedBoard).toHaveBeenCalledTimes(1);
    });
    expect(mockedBoard).toHaveBeenCalledWith({ date: todayLocal() });
    expect(mockedList).not.toHaveBeenCalled();
  });

  it("board: user nama terkelompokkan per tim di dua kolom Belum Absen/Belum Laporan", async () => {
    renderPageAs();

    const groupTimA = await screen.findByTestId("monitoring-group-team-3");
    expect(within(groupTimA).getByText("Tim Aplikasi")).toBeTruthy();
    expect(within(groupTimA).getByText("Belum Absen (2)")).toBeTruthy();
    expect(within(groupTimA).getByText("Andi Prasetyo")).toBeTruthy();
    expect(within(groupTimA).getByText("Citra Dewi")).toBeTruthy();
    expect(within(groupTimA).getByText("Belum Laporan (1)")).toBeTruthy();
    expect(within(groupTimA).getByText("Eka Putri")).toBeTruthy();

    const groupTanpaTim = screen.getByTestId("monitoring-group-none");
    expect(within(groupTanpaTim).getByText("Tanpa Tim")).toBeTruthy();
    expect(within(groupTanpaTim).getByText("Budi Santoso")).toBeTruthy();

    // Tanggal efektif dari respons ditampilkan.
    expect(screen.getByText(/2026-07-10/)).toBeTruthy();
  });

  it("board: scope tercermin dari respons — admin 'Semua user', bidang 'Bidang', tim 'Tim saya'", async () => {
    // Admin: team_id & field_id null.
    renderPageAs();
    expect(await screen.findByText(/cakupan: semua user/i)).toBeTruthy();
    cleanup();

    // Kepala bidang: field_id terisi.
    mockedBoard.mockResolvedValue({ ...boardData, team_id: null, field_id: 1 });
    renderPageAs(userViewOnly);
    expect(await screen.findByText(/cakupan: bidang saya/i)).toBeTruthy();
    cleanup();

    // Kepala tim: team_id terisi.
    mockedBoard.mockResolvedValue({ ...boardData, team_id: 3, field_id: null });
    renderPageAs(userViewOnly);
    expect(await screen.findByText(/cakupan: tim saya/i)).toBeTruthy();
  });

  it("board: pindah tanggal → refetch dengan tanggal baru", async () => {
    renderPageAs();
    await screen.findByTestId("monitoring-group-team-3");

    const input = screen.getByLabelText("Tanggal papan") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "2026-07-11" } });

    await waitFor(() => {
      expect(mockedBoard).toHaveBeenLastCalledWith({ date: "2026-07-11" });
    });
  });
});

describe("MonitoringPage — ekspor PDF tim", () => {
  it("tombol PDF per grup tim (bukan grup Tanpa Tim); klik → exportTeamWfhPdf dgn tanggal board", async () => {
    renderPageAs();
    await screen.findByTestId("monitoring-group-team-3");

    const pdfWrap = screen.getByTestId("monitoring-pdf-team-3");
    await userEvent.click(within(pdfWrap).getByRole("button", { name: /unduh pdf/i }));

    await waitFor(() => {
      expect(mockedPdf).toHaveBeenCalledWith(3, { date: "2026-07-10" });
    });
  });

  it("grup Tanpa Tim tidak punya tombol PDF", async () => {
    renderPageAs();
    await screen.findByTestId("monitoring-group-none");

    expect(within(screen.getByTestId("monitoring-group-none")).queryAllByRole("button")).toHaveLength(0);
  });

  it("user pemegang monitoring.view TANPA export_pdf → semua tombol PDF tersembunyi", async () => {
    renderPageAs(userViewOnly);
    await screen.findByTestId("monitoring-group-team-3");

    expect(screen.queryByTestId("monitoring-pdf-team-3")).toBeNull();
  });

  it("regresi H2: exportTeamWfhPdf gagal 422 → pesan server tampil dekat tombol", async () => {
    mockedPdf.mockRejectedValue(
      new ApiError("validation", "Penandatangan belum atur tanda tangan.", { status: 422 }),
    );
    renderPageAs();
    await screen.findByTestId("monitoring-group-team-3");

    const pdfWrap = screen.getByTestId("monitoring-pdf-team-3");
    await userEvent.click(within(pdfWrap).getByRole("button", { name: /unduh pdf/i }));

    expect(await within(pdfWrap).findByText(/penandatangan belum atur tanda tangan/i)).toBeTruthy();
  });
});

describe("MonitoringPage — Semua Laporan", () => {
  it("dibuka → fetchAdminReports({}) dan baris ter-render; klik baris → /wfh/:id", async () => {
    renderPageAs();
    await openReportsTab();

    expect(mockedList).toHaveBeenCalledWith({});
    expect(await screen.findByTestId("wfh-report-row-10")).toBeTruthy();

    await userEvent.click(screen.getByTestId("wfh-report-row-10"));
    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("Terapkan: status + tim + pasangan tanggal → satu query + halaman 1", async () => {
    renderPageAs();
    await openReportsTab();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "approved" } });
    fireEvent.change(screen.getByLabelText("Tim"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Dari tanggal"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Sampai tanggal"), { target: { value: "2026-07-31" } });

    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({
        status: "approved",
        team_id: 3,
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        page: 1,
      });
    });
  });

  it("presedensi & kebersihan query: date menang atas month; date_from tanpa date_to tak dikirim; per_page 15 default tak dikirim", async () => {
    renderPageAs();
    await openReportsTab();

    // date terisi → month tidak dikirim walau ikut terisi.
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-07-10" } });
    fireEvent.change(screen.getByLabelText("Bulan"), { target: { value: "2026-07" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ date: "2026-07-10", page: 1 });
    });

    // date_from tanpa date_to → keduanya tidak dikirim (month juga dikosongkan).
    fireEvent.change(screen.getByLabelText("Sampai tanggal"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Dari tanggal"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Bulan"), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1 });
    });

    // Bulan saja → month dikirim; per_page tidak (default 15).
    fireEvent.change(screen.getByLabelText("Dari tanggal"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Bulan"), { target: { value: "2026-07" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ month: "2026-07", page: 1 });
    });
  });

  it("pagination mempertahankan filter aktif; Terapkan mengembalikan ke halaman 1", async () => {
    renderPageAs();
    await openReportsTab();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 1 });
    });

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 2 });
    });

    // Terapkan lagi → reset ke halaman 1.
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 1 });
    });
  });

  it("regresi H1: filter dikosongkan tidak bocor ke pagination berikutnya", async () => {
    renderPageAs();
    await openReportsTab();

    // 1. terapkan filter tanggal…
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "2026-07-10" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ date: "2026-07-10", page: 1 });
    });

    // 2. kosongkan tanggal, terapkan bulan…
    fireEvent.change(screen.getByLabelText("Tanggal"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Bulan"), { target: { value: "2026-07" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ month: "2026-07", page: 1 });
    });

    // 3. pagination HARUS memakai query baru (bulan), bukan `date` basi.
    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ month: "2026-07", page: 2 });
    });
  });

  it("list kosong → empty state bahasa Indonesia", async () => {
    mockedList.mockResolvedValue({ reports: [], meta: { ...meta, total: 0, last_page: 1 } });
    renderPageAs();
    await openReportsTab();

    expect(await screen.findByText(/belum ada laporan wfh/i)).toBeTruthy();
    expect(screen.queryByTestId("wfh-report-row-10")).toBeNull();
  });

  it("dropdown tim memakai listTeams pinjaman (bukan duplikasi)", async () => {
    renderPageAs();
    await openReportsTab();

    expect(mockedListTeams).toHaveBeenCalledTimes(1);
    const teamSelect = screen.getByLabelText("Tim") as HTMLSelectElement;
    const optionTexts = Array.from(teamSelect.options).map((o) => o.textContent);
    expect(optionTexts).toContain("Tim Aplikasi");
    expect(optionTexts).toContain("Tim Jaringan");
  });
});

describe("MonitoringPage — regresi visibilitas error (a602c46)", () => {
  it("board 403 → pesan tampil dan TETAP tampil setelah pindah tab & kembali", async () => {
    mockedBoard.mockRejectedValueOnce(new Error("This action is unauthorized."));
    renderPageAs();

    const alert = await screen.findByTestId("monitoring-board-error");
    expect(alert.textContent).toContain("This action is unauthorized.");

    await userEvent.click(screen.getByTestId("monitoring-tab-reports"));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1);
    });
    await userEvent.click(screen.getByTestId("monitoring-tab-board"));

    expect(screen.getByTestId("monitoring-board-error")).toBeTruthy();
  });

  it("list 422 → pesan server tampil dan selamat dari pindah tab", async () => {
    mockedList.mockRejectedValueOnce(
      new Error("User tidak terhubung dengan bidang manapun."),
    );
    renderPageAs();
    await openReportsTab();

    const alert = await screen.findByTestId("monitoring-list-error");
    expect(alert.textContent).toContain("User tidak terhubung dengan bidang manapun.");

    await userEvent.click(screen.getByTestId("monitoring-tab-board"));
    await userEvent.click(screen.getByTestId("monitoring-tab-reports"));

    expect(screen.getByTestId("monitoring-list-error")).toBeTruthy();
  });
});
