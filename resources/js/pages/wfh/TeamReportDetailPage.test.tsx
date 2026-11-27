/**
 * Unit test TeamReportDetailPage (modul wfh-team-report-detail — Task 7).
 *
 * Kontrak yang dijaga (plan Task 7):
 * - mount memuat detail lewat route param (bukan state navigasi) → deep-link
 *   dan refresh tetap bekerja;
 * - header: tim, tanggal, badge status, pembuat, supervisor, alasan reject;
 * - kartu per anggota: nama + NIP, badge status laporan personal, absensi per
 *   sesi (foto lewat `fetchAttendanceObjectUrl`, di-revoke saat unmount),
 *   kegiatan (jam, teks, tautan); anggota tanpa laporan tidak crash;
 * - `pending` + permission → Setujui/Tolak; tanpa permission tidak dirender;
 * - dialog Tolak: alasan kosong/whitespace mematikan tombol, terisi → kirim
 *   `{reason}` lalu detail di-refetch;
 * - Unduh PDF hanya pemegang `wfh.report.export_pdf`;
 * - back link ke daftar `/team-reports`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { userEvent } from "@/test/portal";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { Provider } from "react-redux";
import type { WfhTeamReportDetail, WfhTeamReportMember } from "@/api/types";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/api/client";

vi.mock("@/api/wfh-team", () => ({
  getWfhTeamReport: vi.fn(),
  approveWfhTeamReport: vi.fn(),
  rejectWfhTeamReport: vi.fn(),
}));

vi.mock("@/api/wfh-monitoring", () => ({
  exportTeamWfhPdf: vi.fn(),
}));

// Absensi foto memakai client ber-otorisasi (HTTP) — di-boundary test ini
// diganti stub, bukan dijalankan ke jaringan jsdom.
vi.mock("@/components/wfh/attendance-upload", () => ({
  fetchAttendanceObjectUrl: vi.fn(),
}));

import * as wfhTeamApi from "@/api/wfh-team";
import * as wfhMonitoringApi from "@/api/wfh-monitoring";
import * as attendanceModule from "@/components/wfh/attendance-upload";
import { TeamReportDetailPage } from "@/pages/wfh/TeamReportDetailPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedGet = wfhTeamApi.getWfhTeamReport as unknown as Mock;
const mockedApprove = wfhTeamApi.approveWfhTeamReport as unknown as Mock;
const mockedReject = wfhTeamApi.rejectWfhTeamReport as unknown as Mock;
const mockedPdf = wfhMonitoringApi.exportTeamWfhPdf as unknown as Mock;
const mockedPhoto = attendanceModule.fetchAttendanceObjectUrl as unknown as Mock;

const memberWithReport: WfhTeamReportMember = {
  user_id: 7,
  name: "Andi Prasetyo",
  nip: "199001012023011001",
  report_id: 21,
  report_status: "pending",
  activities: [
    {
      id: 1,
      start_time: "08:00",
      end_time: "10:30",
      activity: "Rapat koordinasi mingguan",
      links: ["https://example.test/notulen"],
    },
  ],
  attendances: [
    { id: 11, session: "pagi", photo_url: "/wfh/reports/21/attendances/11/photo" },
    { id: 12, session: "siang", photo_url: null },
  ],
};

const memberWithoutReport: WfhTeamReportMember = {
  user_id: 8,
  name: "Rina Kartika",
  nip: "199203032024012002",
  report_id: null,
  report_status: null,
  activities: [],
  attendances: [],
};

const detail: WfhTeamReportDetail = {
  id: 12,
  team_id: 3,
  report_date: "2026-08-10",
  status: "pending",
  created_by: 5,
  supervisor_id: 6,
  team: { id: 3, name: "Tim Aplikasi" },
  creator: { id: 5, name: "Budi Santoso", nip: "199001012023011001" },
  supervisor: { id: 6, name: "Siti Nurhaliza", nip: "198001012023011002" },
  members: [memberWithReport, memberWithoutReport],
};

const baseUser = {
  id: 6,
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

const approver = {
  ...baseUser,
  permissions: [
    "wfh.team_report.view",
    "wfh.team_report.approve",
    "wfh.team_report.reject",
    "wfh.report.export_pdf",
  ],
};

/** Render halaman pada rute detail (default id 12) dengan user tertentu. */
function renderDetail(
  user: typeof baseUser = approver,
  path = "/team-reports/12",
) {
  const store = makeStore();
  store.dispatch(setUser(user));
  render(
    <Provider store={store}>
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/team-reports/:reportId" element={<TeamReportDetailPage />} />
          <Route path="/team-reports" element={<p>daftar-stub</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue(detail);
  mockedPdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
  mockedPhoto.mockResolvedValue("blob:attendance-photo");
  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

describe("TeamReportDetailPage — muat & render", () => {
  it("mount memuat detail via route param lalu merender header + anggota", async () => {
    renderDetail();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(12);
    });

    expect(await screen.findByText("Tim Aplikasi")).toBeTruthy();
    expect(screen.getByText("2026-08-10")).toBeTruthy();
    expect(screen.getByTestId("team-report-detail")).toBeTruthy();
    // Pembuat + supervisor dari resource.
    expect(screen.getByText(/Budi Santoso/)).toBeTruthy();
    expect(screen.getByText(/Siti Nurhaliza/)).toBeTruthy();
    // Anggota: nama + NIP dan badge status laporan personalnya.
    expect(screen.getByText("Andi Prasetyo")).toBeTruthy();
    expect(screen.getByText("199001012023011001")).toBeTruthy();
    expect(screen.getAllByTestId("wfh-status-badge").length).toBeGreaterThanOrEqual(2);
    // Kegiatan: jam, teks, tautan.
    expect(screen.getByText("Rapat koordinasi mingguan")).toBeTruthy();
    expect(screen.getByText(/08:00/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "https://example.test/notulen" });
    expect(link.getAttribute("href")).toBe("https://example.test/notulen");
  });

  it("absensi per sesi memakai label sesi dan foto lewat fetchAttendanceObjectUrl (revoke saat unmount)", async () => {
    renderDetail();

    const img = await screen.findByRole("img", { name: /foto absensi sesi pagi/i });
    expect(img.getAttribute("src")).toBe("blob:attendance-photo");
    expect(mockedPhoto).toHaveBeenCalledWith("/wfh/reports/21/attendances/11/photo");
    // Sesi tanpa foto tetap tampil dengan penanda kosong.
    expect(screen.getByText("Siang")).toBeTruthy();

    cleanup();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:attendance-photo");
  });

  it("anggota tanpa laporan menampilkan tanda kosong, bukan crash", async () => {
    renderDetail();

    expect(await screen.findByText("Rina Kartika")).toBeTruthy();
    const card = screen.getByTestId("team-report-member-8");
    expect(within(card).getByText(/belum ada laporan/i)).toBeTruthy();
  });

  it("status rejected menampilkan alasan penolakan", async () => {
    mockedGet.mockResolvedValueOnce({
      ...detail,
      status: "rejected",
      reject_reason: "Laporan anggota belum lengkap.",
    });
    renderDetail();

    expect(await screen.findByText("Laporan anggota belum lengkap.")).toBeTruthy();
    expect(screen.getByText("Ditolak")).toBeTruthy();
    // Bukan pending → tidak ada aksi transisi meski ber-permission.
    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
  });

  it("ID route tidak valid → pesan dan tanpa fetch", async () => {
    renderDetail(approver, "/team-reports/abc");

    expect(screen.getByText(/ID laporan tidak valid/i)).toBeTruthy();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});

describe("TeamReportDetailPage — approve/reject", () => {
  it("status pending + permission menampilkan Setujui dan Tolak", async () => {
    renderDetail();

    await screen.findByText("Andi Prasetyo");
    expect(screen.getByRole("button", { name: /setujui/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /tolak/i })).toBeTruthy();
  });

  it("tanpa permission approve/reject, tombol tidak dirender", async () => {
    renderDetail(baseUser);

    await screen.findByText("Andi Prasetyo");
    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
  });

  it("Setujui memanggil approveWfhTeamReport lalu detail di-refetch", async () => {
    mockedApprove.mockResolvedValueOnce({
      ...detail,
      status: "approved",
      message: "Laporan tim berhasil disetujui.",
    });
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    await userEvent.click(screen.getByRole("button", { name: /setujui/i }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(12);
    });
    // Refetch pasca-mutasi: mount + pasca-approve (slice yang memicu).
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan tim berhasil disetujui.");
    });
  });

  it("Tolak: alasan kosong/spasi mematikan tombol, alasan terisi mengirim reject lalu refetch", async () => {
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText(/alasan penolakan/i);
    const submit = within(dialog).getByRole("button", { name: /tolak laporan/i });

    expect((submit as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(submit);
    expect(mockedReject).not.toHaveBeenCalled();

    await userEvent.type(input, "   ");
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(input, "Laporan anggota belum lengkap.");
    expect((submit as HTMLButtonElement).disabled).toBe(false);

    mockedReject.mockResolvedValueOnce({
      ...detail,
      status: "rejected",
      message: "Laporan tim berhasil ditolak.",
    });
    await userEvent.click(submit);

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith(12, {
        reason: "Laporan anggota belum lengkap.",
      });
    });
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const toast = document.querySelector("[data-sonner-toast]");
    expect(toast?.textContent).toContain("Laporan tim berhasil ditolak.");
  });

  it("reject gagal 403 → dialog tetap terbuka dan pesan server tampil di dalamnya", async () => {
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    await userEvent.click(screen.getByRole("button", { name: /tolak/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText(/alasan penolakan/i),
      "Alasan lintas bidang.",
    );

    mockedReject.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
    );
    await userEvent.click(within(dialog).getByRole("button", { name: /tolak laporan/i }));

    expect(
      await within(dialog).findByText("Laporan tidak berada dalam bidang Anda."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Gagal → tidak refetch detail.
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});

describe("TeamReportDetailPage — unduh PDF & navigasi", () => {
  it("tombol Unduh PDF memanggil exportTeamWfhPdf dengan team, tanggal, dan team_report_id", async () => {
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    await userEvent.click(screen.getByRole("button", { name: /unduh pdf/i }));

    await waitFor(() => {
      expect(mockedPdf).toHaveBeenCalledWith(3, {
        date: "2026-08-10",
        team_report_id: 12,
      });
    });
  });

  it("tanpa permission wfh.report.export_pdf, tombol Unduh PDF tidak dirender", async () => {
    renderDetail(baseUser);
    await screen.findByText("Andi Prasetyo");

    expect(screen.queryByRole("button", { name: /unduh pdf/i })).toBeNull();
  });

  it("back link menuju daftar /team-reports", async () => {
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    const back = screen.getByRole("link", { name: /kembali ke daftar/i });
    expect(back.getAttribute("href")).toBe("/team-reports");
  });
});

describe("TeamReportDetailPage — kegagalan fetch", () => {
  it("fetch gagal tanpa data → pesan error full-page", async () => {
    mockedGet.mockRejectedValueOnce(
      new ApiError("http", "Laporan tidak berada dalam bidang Anda.", { status: 403 }),
    );
    renderDetail();

    expect(
      await screen.findByText("Laporan tidak berada dalam bidang Anda."),
    ).toBeTruthy();
  });
});

describe("TeamReportDetailPage — guard mutasi & pindah laporan", () => {
  it("approve gagal → toast pesan server, detail TIDAK di-refetch, tombol aktif lagi", async () => {
    mockedApprove.mockRejectedValueOnce(
      new ApiError("http", "Pembuat laporan tidak dapat menyetujui laporannya sendiri.", {
        status: 403,
      }),
    );
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    await userEvent.click(screen.getByRole("button", { name: /setujui/i }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(12);
    });
    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast?.textContent).toContain(
        "Pembuat laporan tidak dapat menyetujui laporannya sendiri.",
      );
    });
    // Gagal → tidak refetch detail (hanya fetch mount).
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: /setujui/i }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("klik Setujui dua kali saat in-flight → approve hanya sekali", async () => {
    let resolveApprove: (value: unknown) => void = () => {};
    mockedApprove.mockReturnValueOnce(new Promise((resolve) => (resolveApprove = resolve)));
    renderDetail();
    await screen.findByText("Andi Prasetyo");

    const approveButton = screen.getByRole("button", { name: /setujui/i });
    await userEvent.click(approveButton);

    await waitFor(() => expect(mockedApprove).toHaveBeenCalledTimes(1));
    expect((approveButton as HTMLButtonElement).disabled).toBe(true);
    // Klik kedua pada tombol yang sudah mati tidak mengirim ulang.
    await userEvent.click(approveButton);
    expect(mockedApprove).toHaveBeenCalledTimes(1);

    resolveApprove({ ...detail, status: "approved", message: "Laporan tim berhasil disetujui." });
    await waitFor(() => expect(mockedApprove).toHaveBeenCalledTimes(1));
  });

  it("pindah ke laporan lain yang masih dimuat → skeleton, bukan isi laporan lama", async () => {
    const store = makeStore();
    store.dispatch(setUser(approver));

    mockedGet.mockResolvedValueOnce(detail); // mount laporan 12
    mockedGet.mockReturnValueOnce(new Promise(() => {})); // laporan 13 tidak pernah selesai

    function Harness() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate("/team-reports/13")}>pindah</button>
          <Routes>
            <Route path="/team-reports/:reportId" element={<TeamReportDetailPage />} />
          </Routes>
        </>
      );
    }

    render(
      <Provider store={store}>
        <Toaster position="top-right" richColors />
        <MemoryRouter initialEntries={["/team-reports/12"]}>
          <Harness />
        </MemoryRouter>
      </Provider>,
    );

    expect(await screen.findByText("Andi Prasetyo")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /pindah/i }));

    // Skeleton tampil dan isi laporan lama (Tim Aplikasi) tidak dibiarkan.
    expect(await screen.findByTestId("team-report-detail-loading")).toBeTruthy();
    expect(screen.queryByText("Tim Aplikasi")).toBeNull();
  });
});
