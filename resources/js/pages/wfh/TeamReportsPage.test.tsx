/**
 * Unit test TeamReportsPage (modul wfh-team-reports — Phase 2 Task 3 list).
 * Kontrak yang dijaga (plan Task 3):
 * - mount → dispatch `fetchWfhTeamReports` dengan query bersih (halaman 1);
 * - baris render `team.name`, `report_date`, status badge via `WfhStatusBadge`,
 *   dan nama pembuat (`ReportUserNested`);
 * - pagination → fetch halaman tujuan dengan query aktif (per_page dipertahankan);
 * - ubah per halaman → fetch dengan `per_page`, kembali ke halaman 1;
 * - list kosong → empty state bahasa Indonesia; fetch gagal → pesan error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import type { PaginationMeta, WfhTeamReport } from "@/api/types";

vi.mock("@/api/wfh-team", () => ({
  listWfhTeamReports: vi.fn(),
  createWfhTeamReport: vi.fn(),
  approveWfhTeamReport: vi.fn(),
  rejectWfhTeamReport: vi.fn(),
  listTeams: vi.fn(),
}));

import * as wfhTeamApi from "@/api/wfh-team";
import { TeamReportsPage } from "@/pages/wfh/TeamReportsPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedList = wfhTeamApi.listWfhTeamReports as unknown as Mock;
const mockedCreate = wfhTeamApi.createWfhTeamReport as unknown as Mock;
const mockedListTeams = wfhTeamApi.listTeams as unknown as Mock;
const mockedApprove = wfhTeamApi.approveWfhTeamReport as unknown as Mock;
const mockedReject = wfhTeamApi.rejectWfhTeamReport as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 10, total: 12 };

const reportA: WfhTeamReport = {
  id: 1,
  team_id: 3,
  report_date: "2026-08-10",
  status: "pending",
  created_by: 7,
  team: { id: 3, name: "Tim Aplikasi" },
  creator: { id: 7, name: "Andi Prasetyo", nip: "199001012023011001" },
};

const reportB: WfhTeamReport = {
  id: 2,
  team_id: 4,
  report_date: "2026-08-11",
  status: "approved",
  created_by: 7,
  team: { id: 4, name: "Tim Jaringan" },
  creator: { id: 7, name: "Andi Prasetyo", nip: "199001012023011001" },
};

const user = {
  id: 7,
  name: "Siti Nurhaliza",
  nip: "198001012023011002",
  email: "siti@kominfo.go.id",
  phone: "081234567891",
  position: "Kepala Bidang",
  rank: "Pembina",
  signature_url: null,
  must_change_password: false,
  is_active: true,
  roles: ["kepala_bidang"],
  permissions: ["wfh.team_report.view"],
};

const teamResource = { id: 3, name: "Tim Aplikasi", leader_id: 5, field_id: 1 };

const admin = {
  ...user,
  id: 1,
  name: "Admin Utama",
  email: "admin@kominfo.go.id",
  roles: ["admin"],
  permissions: [
    "wfh.team_report.view",
    "wfh.team_report.create",
    "wfh.team_report.approve",
    "wfh.team_report.reject",
  ],
};

/** renderPage dengan user khusus (default: kepala bidang view-only). */
function renderPageAs(overrides?: Partial<typeof user>) {
  const store = makeStore();
  store.dispatch(setUser({ ...user, ...overrides }));
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/team-reports"]}>
        <Routes>
          <Route path="/team-reports" element={<TeamReportsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

function renderPage() {
  const store = makeStore();
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/team-reports"]}>
        <Routes>
          <Route path="/team-reports" element={<TeamReportsPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
});

describe("TeamReportsPage — fetch awal & render", () => {
  it("mount mem-fetch daftar dan baris render team.name + tanggal + badge + pembuat", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1);
    });
    expect(mockedList).toHaveBeenCalledWith({});

    await screen.findByText("Tim Aplikasi");
    expect(screen.getByText("2026-08-10")).toBeTruthy();
    expect(screen.getByText("Tim Jaringan")).toBeTruthy();
    expect(screen.getAllByTestId("wfh-status-badge")).toHaveLength(2);
    // Label status dari WFH_STATUS_LABELS (bukan "pending"/"approved" mentah).
    expect(screen.getByText("Menunggu persetujuan")).toBeTruthy();
    expect(screen.getByText("Disetujui")).toBeTruthy();
    // Pembuat (ReportUserNested) tampil di baris.
    expect(screen.getAllByText("Andi Prasetyo")).toHaveLength(2);
  });

  it("list kosong → empty state bahasa Indonesia, tanpa tabel", async () => {
    mockedList.mockResolvedValueOnce({
      reports: [],
      meta: { ...meta, total: 0, last_page: 1 },
    });
    renderPage();

    expect(await screen.findByText(/belum ada laporan tim/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("fetch gagal → pesan error tampil", async () => {
    mockedList.mockRejectedValueOnce(new Error("This action is unauthorized."));
    renderPage();

    expect(await screen.findByText("This action is unauthorized.")).toBeTruthy();
  });
});

describe("TeamReportsPage — paginate", () => {
  it("klik Berikutnya → fetch halaman 2 dengan per_page aktif", async () => {
    renderPage();
    await screen.findByText("Tim Aplikasi");
    mockedList.mockClear();

    // Ubah per halaman → query aktif kini {per_page: 25}.
    mockedList.mockResolvedValue({
      reports: [reportA],
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 30 },
    });
    await userEvent.selectOptions(screen.getByLabelText(/per halaman/i), "25");
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 1 });
    });

    mockedList.mockClear();
    await screen.findByText(/Halaman 1 dari 2/);
    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 2 });
    });
  });

  it("klik Berikutnya pada meta awal (tanpa per_page) → fetch halaman 2 saja", async () => {
    renderPage();
    await screen.findByText("Tim Aplikasi");
    mockedList.mockClear();

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 2 });
    });
  });

  it("ubah per halaman → fetch dengan per_page + kembali ke halaman 1", async () => {
    renderPage();
    await screen.findByText("Tim Aplikasi");
    mockedList.mockClear();

    mockedList.mockResolvedValue({
      reports: [reportA, reportB],
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 30 },
    });

    await userEvent.selectOptions(screen.getByLabelText(/per halaman/i), "25");

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 1 });
    });
  });
});

describe("TeamReportsPage — create journey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
    mockedListTeams.mockResolvedValue([teamResource]);
  });

  it("form TIDAK tampil tanpa permission wfh.team_report.create", async () => {
    renderPageAs(); // kepala bidang view-only

    await screen.findByText("Tim Aplikasi");
    expect(screen.queryByLabelText(/tim/i)).toBeNull();
    expect(screen.queryByLabelText(/tanggal laporan/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /simpan/i })).toBeNull();
  });

  it("form tampil untuk admin, dropdown terisi listTeams, submit {team_id, report_date}", async () => {
    renderPageAs(admin);

    await screen.findByText("Tim Jaringan");

    // Dropdown terisi dari listTeams.
    await waitFor(() => {
      expect(mockedListTeams).toHaveBeenCalledTimes(1);
    });
    const dropdown = await screen.findByLabelText(/tim/i);
    expect(dropdown.textContent).toContain("Tim Aplikasi");

    await userEvent.selectOptions(screen.getByLabelText(/tim/i), "3");

    // Date input: fireEvent (userEvent tidak mengetik di input type=date).
    fireEvent.change(screen.getByLabelText(/tanggal laporan/i), {
      target: { value: "2026-08-12" },
    });
    await userEvent.click(screen.getByRole("button", { name: /simpan/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ team_id: 3, report_date: "2026-08-12" });
    });
  });

  it("create gagal 422 duplikat → pesan server tersaji apa adanya, tanpa refetch", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await userEvent.selectOptions(screen.getByLabelText(/tim/i), "3");
    fireEvent.change(screen.getByLabelText(/tanggal laporan/i), {
      target: { value: "2026-08-10" },
    });

    mockedCreate.mockRejectedValueOnce(
      new Error("Laporan untuk tim dan tanggal ini sudah ada."),
    );
    await userEvent.click(screen.getByRole("button", { name: /simpan/i }));

    expect(await screen.findByText("Laporan untuk tim dan tanggal ini sudah ada.")).toBeTruthy();
    // Tidak ada refetch saat gagal — pesan tidak akan tersapu (akar a602c46).
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  it("create sukses → daftar di-refetch (sumber kebenaran = server)", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await userEvent.selectOptions(screen.getByLabelText(/tim/i), "3");
    fireEvent.change(screen.getByLabelText(/tanggal laporan/i), {
      target: { value: "2026-08-12" },
    });

    mockedCreate.mockResolvedValueOnce({ ...reportA, id: 9, report_date: "2026-08-12" });
    mockedList.mockResolvedValueOnce({ reports: [reportA, reportB], meta });
    await userEvent.click(screen.getByRole("button", { name: /simpan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2); // initial + refetch
    });
  });
});

describe("TeamReportsPage — approve/reject journey", () => {
  /** User dengan permission approve+reject (kepala bidang). */
  const approver = {
    ...user,
    permissions: [
      "wfh.team_report.view",
      "wfh.team_report.approve",
      "wfh.team_report.reject",
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
  });

  it("aksi approve/reject hanya tampil untuk baris pending DAN pemegang permission", async () => {
    // reportA pending, reportB approved → hanya reportA yang punya tombol.
    renderPageAs(approver);

    await screen.findByTestId("team-report-row-1");
    expect(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /setujui/i,
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /tolak/i,
      }),
    ).toBeTruthy();
    // Baris approved (status !== pending) → tanpa aksi.
    expect(
      within(screen.getByTestId("team-report-row-2")).queryByRole("button"),
    ).toBeNull();

    // Tanpa permission approve/reject → tanpa tombol sama sekali.
    cleanup();
    renderPage(); // kepala bidang view-only
    await screen.findByTestId("team-report-row-1");
    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
  });

  it("approve → panggil API id baris + daftar di-refetch, baris ter-update", async () => {
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    mockedApprove.mockResolvedValueOnce({ ...reportA, status: "approved" });
    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /setujui/i,
      }),
    );

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(1);
    });
    // Refetch pasca-mutasi (sumber kebenaran = server).
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2);
    });
  });

  it("reject membuka dialog alasan wajib; kosong → tidak mengirim; terisi → payload {reason}", async () => {
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /tolak/i,
      }),
    );

    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/alasan penolakan/i);
    const submit = within(dialog).getByRole("button", { name: /tolak laporan/i });

    // Alasan kosong → submit disabled, tidak ada panggilan API.
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(submit);
    expect(mockedReject).not.toHaveBeenCalled();

    // Alasan whitespace saja masih dianggap kosong.
    await userEvent.type(input, "   ");
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(input, "Melebihi kuota WFH bulan ini.");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    mockedReject.mockResolvedValueOnce({ ...reportA, status: "rejected" });
    await userEvent.click(submit);
    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith(1, "Melebihi kuota WFH bulan ini.");
    });
    // Refetch pasca-mutasi.
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2);
    });
    // Dialog tertutup setelah sukses.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("403 lintas bidang pada approve → pesan server tersaji dan SELAMAT setelah refetch (regresi a602c46)", async () => {
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    mockedApprove.mockRejectedValueOnce(
      new Error("Laporan tidak berada dalam bidang Anda."),
    );
    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /setujui/i,
      }),
    );

    expect(
      (await screen.findByTestId("team-action-error")).textContent,
    ).toContain("Laporan tidak berada dalam bidang Anda.");

    // Mutasi gagal TIDAK memicu refetch (kontrak slice a602c46) — hanya fetch awal.
    expect(mockedList).toHaveBeenCalledTimes(1);

    // Refetch berikutnya (mis. pengguna paginate) TIDAK boleh menyapu pesan.
    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId("team-action-error")).toBeTruthy();
  });
});