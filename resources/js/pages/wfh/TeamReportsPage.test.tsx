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
import { userEvent, pickDate, pickSelect } from "@/test/portal";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import type { PaginationMeta, WfhTeamReport } from "@/api/types";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/api/client";

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
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
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
      <Toaster position="top-right" richColors />
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
    mockedList.mockRejectedValueOnce(
      new ApiError("http", "This action is unauthorized.", { status: 403 }),
    );
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
    await pickSelect(/per halaman/i, "25");
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

    await pickSelect(/per halaman/i, "25");

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

  /** Buka dialog "Buat laporan" dan kembalikan elemen `<dialog>`-nya. */
  async function openCreateDialog() {
    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    return screen.findByRole("dialog");
  }

  it("tidak ada section form di halaman; tombol Buat laporan membuka dialog", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    // Field create hanya hidup di dalam dialog, bukan card inline.
    expect(screen.queryByLabelText(/tanggal laporan/i)).toBeNull();

    const dialog = await openCreateDialog();
    expect(within(dialog).getByRole("heading", { name: /buat laporan tim/i })).toBeTruthy();
    expect(within(dialog).getByLabelText(/tanggal laporan/i)).toBeTruthy();
  });

  it("tombol Buat laporan TIDAK tampil tanpa permission wfh.team_report.create", async () => {
    renderPageAs(); // kepala bidang view-only

    await screen.findByText("Tim Aplikasi");
    expect(screen.queryByRole("button", { name: /buat laporan/i })).toBeNull();
  });

  it("dialog: dropdown terisi listTeams, Buat disabled sampai tim+tanggal terisi, submit {team_id, report_date}", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await waitFor(() => {
      expect(mockedListTeams).toHaveBeenCalledTimes(1);
    });
    await openCreateDialog();

    // Buat mati selama tim belum dipilih (tanggal juga kosong).
    const buat = screen.getByRole("button", { name: /^buat$/i });
    expect((buat as HTMLButtonElement).disabled).toBe(true);

    // Trigger Select kosong menampilkan placeholder; opsi hidup di portal.
    const dropdown = screen.getByLabelText("Tim");
    expect(dropdown.textContent).toContain("Pilih tim");
    await pickSelect("Tim", "Tim Aplikasi");
    expect((screen.getByRole("button", { name: /^buat$/i }) as HTMLButtonElement).disabled).toBe(true);

    await pickDate(screen.getByLabelText(/tanggal laporan/i), "2026-08-12");
    expect((screen.getByRole("button", { name: /^buat$/i }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ team_id: 3, report_date: "2026-08-12" });
    });
  });

  it("create sukses → dialog tertutup, daftar di-refetch, toast sukses teks server", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openCreateDialog();
    await pickSelect("Tim", "Tim Aplikasi");
    await pickDate(screen.getByLabelText(/tanggal laporan/i), "2026-08-12");

    mockedCreate.mockResolvedValueOnce({
      ...reportA,
      id: 9,
      report_date: "2026-08-12",
      message: "Laporan tim berhasil dibuat.",
    });
    mockedList.mockResolvedValueOnce({ reports: [reportA, reportB], meta });
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2); // initial + refetch
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const toast = document.querySelector("[data-sonner-toast]");
    expect(toast).toBeTruthy();
    expect(toast!.textContent).toContain("Laporan tim berhasil dibuat.");
  });

  it("create gagal 422 duplikat → pesan server tersaji apa adanya, dialog tetap terbuka, tanpa refetch", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openCreateDialog();
    await pickSelect("Tim", "Tim Aplikasi");
    await pickDate(screen.getByLabelText(/tanggal laporan/i), "2026-08-10");

    mockedCreate.mockRejectedValueOnce(
      new ApiError("http", "Laporan untuk tim dan tanggal ini sudah ada.", { status: 422 }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    // Banner inline di dalam dialog menyajikan pesan server apa adanya (toast menyertai).
    const banner = await screen.findByTestId("team-action-error");
    expect(banner.closest('[role="dialog"]')).toBeTruthy();
    expect(banner.textContent).toContain("Laporan untuk tim dan tanggal ini sudah ada.");
    // DateInput popover memakai role="dialog" juga — scope ke dialog halaman.
    expect(screen.getByRole("dialog", { name: /buat laporan tim/i })).toBeTruthy();
    // Tidak ada refetch saat gagal — pesan tidak akan tersapu (akar a602c46).
    expect(mockedList).toHaveBeenCalledTimes(1);
  });

  /** ship#17: pesan mutasi 422 hidup di redux dan hanya dibersihkan oleh
   * mutasi berikutnya — membuka ulang dialog harus MEMBERSIHKANNYA, bukan
   * menampilkan error percobaan sebelumnya. */
  it("dialog dibuka ulang setelah create gagal → tidak ada banner error lama", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openCreateDialog();
    await pickSelect("Tim", "Tim Aplikasi");
    await pickDate(screen.getByLabelText(/tanggal laporan/i), "2026-08-10");
    mockedCreate.mockRejectedValueOnce(
      new ApiError("http", "Laporan untuk tim dan tanggal ini sudah ada.", { status: 422 }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));
    expect(await screen.findByTestId("team-action-error")).toBeTruthy();

    // Batal menutup dialog, lalu buka lagi: state form DAN pesan harus bersih.
    await userEvent.click(screen.getByRole("button", { name: /^batal$/i }));
    await openCreateDialog();

    expect(screen.queryByTestId("team-action-error")).toBeNull();
  });

  it("Batal menutup dialog tanpa mutasi dan tanpa refetch", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openCreateDialog();
    await pickSelect("Tim", "Tim Aplikasi");
    await userEvent.click(screen.getByRole("button", { name: /batal/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(mockedCreate).not.toHaveBeenCalled();
    expect(mockedList).toHaveBeenCalledTimes(1);
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
    // Dua baris pending: baris yang disetujui + saudara yang belum disentuh.
    const reportC: WfhTeamReport = { ...reportA, id: 3, team: { id: 5, name: "Tim Layanan" } };
    mockedList.mockResolvedValueOnce({ reports: [reportA, reportC, reportB], meta });
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    let resolveApprove!: (value: WfhTeamReport) => void;
    mockedApprove.mockImplementation(
      () => new Promise<WfhTeamReport>((res) => (resolveApprove = res)),
    );
    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /setujui/i,
      }),
    );

    // Gate symmetry (ship#14 F2): saat satu baris in-flight, aksi baris SAUDARA
    // juga terkunci — approve saudara (disabled) dan reject saudara sama-sama
    // nonaktif, bukan tampil aktif lalu diam-diam menelan klik.
    await waitFor(() => {
      expect(
        (within(screen.getByTestId("team-report-row-3")).getByRole("button", {
          name: /setujui/i,
        }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
    expect(
      (within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /tolak/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolveApprove({ ...reportA, status: "approved" });
    // Refetch pasca-mutasi (sumber kebenaran = server).
    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(1);
    });
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

    // Alasan whitespace saja masih dianggap kosong, dan S2: spinner/aria-busy
    // hanya saat thunk in-flight — alasan kosong berarti DISABLED biasa, bukan
    // pending (regresi ship#14 F1: `pending` dipakai sebagai gate disable
    // sehingga dialog selalu tampil spinner saat dibuka).
    await userEvent.type(input, "   ");
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect((submit as HTMLButtonElement).getAttribute("aria-busy")).toBeNull();
    expect(submit.querySelector('[data-slot="spinner"]')).toBeNull();

    await userEvent.type(input, "Melebihi kuota WFH bulan ini.");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    mockedReject.mockResolvedValueOnce({
      ...reportA,
      status: "rejected",
      message: "Laporan tim berhasil ditolak.",
    });
    await userEvent.click(submit);
    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith(1, { reason: "Melebihi kuota WFH bulan ini." });
    });
    // Refetch pasca-mutasi.
    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(2);
    });
    // Toast sukses dengan pesan server + dialog tertutup setelah sukses.
    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tim berhasil ditolak.");
      expect(toast!.getAttribute("data-type")).toBe("success");
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
   });

  it("403 lintas bidang pada approve → pesan server tersaji dan SELAMAT setelah refetch (regresi a602c46)", async () => {
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    mockedApprove.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
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

  it("reject gagal 403/422 → dialog tetap terbuka dan pesan server tampil DI DALAM dialog", async () => {
    renderPageAs(approver);
    await screen.findByTestId("team-report-row-1");

    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", {
        name: /tolak/i,
      }),
    );
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/alasan penolakan/i);
    await userEvent.type(input, "Alasan lintas bidang.");

    mockedReject.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /tolak laporan/i }));

    // Pesan mutasi dirender di dalam dialog (bukan di belakang overlay).
    expect(await within(dialog).findByTestId("team-reject-error")).toBeTruthy();
    expect(within(dialog).getByTestId("team-reject-error").textContent).toContain(
      "Laporan tidak berada dalam bidang Anda.",
    );
    // Dialog tetap terbuka agar pengguna bisa memperbaiki/membatalkan.
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("TeamReportsPage — spinner pending + toast (T7b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
    mockedListTeams.mockResolvedValue([teamResource]);
  });

  /** Buka dialog create + isi tim & tanggal (jalur bahagia). */
  async function openAndFillCreateDialog() {
    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");
    await pickSelect("Tim", "Tim Aplikasi");
    await pickDate(screen.getByLabelText(/tanggal laporan/i), "2026-08-12");
  }

  it("create sukses → toast sukses teks server", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openAndFillCreateDialog();

    mockedCreate.mockResolvedValueOnce({
      ...reportA,
      id: 9,
      report_date: "2026-08-12",
      message: "Laporan tim berhasil dibuat.",
    });
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tim berhasil dibuat.");
    });
  });

  it("create gagal → toast error pesan server + banner di dalam dialog tetap", async () => {
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openAndFillCreateDialog();

    mockedCreate.mockRejectedValueOnce(
      new ApiError("http", "Laporan untuk tim dan tanggal ini sudah ada.", { status: 422 }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan untuk tim dan tanggal ini sudah ada.");
    });
    // Banner inline di dalam dialog tetap dirender (konvensi a602c46).
    expect(screen.getByTestId("team-action-error")).toBeTruthy();
  });

  it("tombol Buat aria-busy selama create in-flight (mock never-resolves)", async () => {
    mockedCreate.mockImplementation(() => new Promise(() => {}));
    renderPageAs(admin);
    await screen.findByText("Tim Jaringan");

    await openAndFillCreateDialog();

    const buat = screen.getByRole("button", { name: /^buat$/i });
    await userEvent.click(buat);

    await waitFor(() => {
      expect(buat.getAttribute("aria-busy")).toBe("true");
    });
    expect((buat as HTMLButtonElement).disabled).toBe(true);
    // Spinner milik Button pending dirender.
    expect(buat.querySelector('[data-slot="spinner"]')).toBeTruthy();
  });


  it("tombol Setujui aria-busy selama approve in-flight; sukses → toast teks server", async () => {
    renderPageAs({
      permissions: ["wfh.team_report.view", "wfh.team_report.approve", "wfh.team_report.reject"],
    });
    await screen.findByTestId("team-report-row-1");

    let resolveApprove!: (value: WfhTeamReport) => void;
    mockedApprove.mockImplementation(
      () => new Promise<WfhTeamReport>((res) => (resolveApprove = res)),
    );

    const setujui = within(screen.getByTestId("team-report-row-1")).getByRole("button", {
      name: /setujui/i,
    });
    await userEvent.click(setujui);
    await waitFor(() => {
      expect(setujui.getAttribute("aria-busy")).toBe("true");
    });

    resolveApprove({
      ...reportA,
      status: "approved",
      message: "Laporan tim berhasil disetujui.",
    } as WfhTeamReport);
    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tim berhasil disetujui.");
    });
  });

  it("approve gagal → toast error pesan server + banner inline tetap", async () => {
    renderPageAs({
      ...user,
      permissions: ["wfh.team_report.view", "wfh.team_report.approve", "wfh.team_report.reject"],
    });
    await screen.findByTestId("team-report-row-1");

    mockedApprove.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
    );
    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", { name: /setujui/i }),
    );

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tidak berada dalam bidang Anda.");
    });
    expect(screen.getByTestId("team-action-error")).toBeTruthy();
  });

  it("reject sukses → toast sukses; reject gagal → toast error + dialog tetap terbuka", async () => {
    renderPageAs({
      ...user,
      permissions: ["wfh.team_report.view", "wfh.team_report.approve", "wfh.team_report.reject"],
    });
    await screen.findByTestId("team-report-row-1");

    await userEvent.click(
      within(screen.getByTestId("team-report-row-1")).getByRole("button", { name: /tolak/i }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText(/alasan penolakan/i), "Kuota habis.");

    mockedReject.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /tolak laporan/i }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tidak berada dalam bidang Anda.");
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});