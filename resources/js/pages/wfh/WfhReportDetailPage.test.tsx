/**
 * Unit test WfhReportDetailPage (frontend-phase2 — Phase 3 task detail page).
 * Kontrak yang dijaga (plan Task "WfhReportDetailPage + wiring route"):
 * - mount → GET /wfh/reports/{id} (id dari route) + GET /wfh/session-config;
 * - gate editability via helper TUNGGAL `canEditReport(status)` (draft|rejected);
 * - aksi owner (submit/revisi/edit tanggal/aktivitas/absensi) disembunyikan
 *   untuk non-owner; approve/reject butuh `wfh.report.approve|reject`;
 * - PDF hanya `pending|approved` + `wfh.report.export_pdf`;
 * - aksi tak diizinkan disembunyikan (bukan disabled);
 * - reject wajib lewat dialog alasan;
 * - error mutasi (422 kontrak) tampil sebagai pesan ke user.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AuthUser, WfhReport, WfhSessionConfig } from "@/api/types";

vi.mock("@/api/wfh", () => ({
  listWfhReports: vi.fn(),
  getWfhReport: vi.fn(),
  getWfhSessionConfig: vi.fn(),
  createWfhReport: vi.fn(),
  submitWfhReport: vi.fn(),
  approveWfhReport: vi.fn(),
  rejectWfhReport: vi.fn(),
  reviseWfhReport: vi.fn(),
  updateWfhReportMetadata: vi.fn(),
  deleteWfhReport: vi.fn(),
  addReportActivity: vi.fn(),
  updateReportActivity: vi.fn(),
  deleteReportActivity: vi.fn(),
  reorderReportActivities: vi.fn(),
  addReportAttendance: vi.fn(),
  deleteReportAttendance: vi.fn(),
  exportWfhReportPdf: vi.fn(),
}));

import * as wfhApi from "@/api/wfh";
import { canEditReport, WfhReportDetailPage } from "@/pages/wfh/WfhReportDetailPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedGet = wfhApi.getWfhReport as unknown as Mock;
const mockedSessionConfig = wfhApi.getWfhSessionConfig as unknown as Mock;
const mockedSubmit = wfhApi.submitWfhReport as unknown as Mock;
const mockedReject = wfhApi.rejectWfhReport as unknown as Mock;
const mockedApprove = wfhApi.approveWfhReport as unknown as Mock;
const mockedDeleteActivity = wfhApi.deleteReportActivity as unknown as Mock;
const mockedAddActivity = wfhApi.addReportActivity as unknown as Mock;
const mockedUpdateMetadata = wfhApi.updateWfhReportMetadata as unknown as Mock;
const config: WfhSessionConfig = {
  sessions: ["pagi", "siang", "sore"],
  allowed_days: [1, 2, 3, 4, 5],
};

function detail(status: WfhReport["status"]): WfhReport {
  return {
    id: 1,
    user_id: 10,
    report_date: "2026-08-10",
    status,
    activities: [{ id: 11, activity: "Kerja A", sort_order: 1 }],
    attendances: [],
  };
}

/** Staf pemilik laporan: permission relevan modul personal. */
const staf: AuthUser = {
  id: 10,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["staf"],
  permissions: [
    "wfh.report.create",
    "wfh.report.submit",
    "wfh.report.update",
    "wfh.report.delete",
    "wfh.report.export_pdf",
    "wfh.attendance.create",
  ],
};

/** Kepala bidang non-owner: approve/reject/PDF, TANPA permission personal. */
const kepala: AuthUser = {
  ...staf,
  id: 99,
  name: "Kepala Bidang",
  permissions: ["wfh.report.approve", "wfh.report.reject", "wfh.report.export_pdf"],
};

type Role = "staf" | "kepala";

const USERS: Record<Role, AuthUser> = { staf, kepala };

function renderDetail(role: Role = "staf", detailOverride?: WfhReport) {
  const store = makeStore();
  store.dispatch(setUser(USERS[role]));
  if (detailOverride) mockedGet.mockResolvedValue(detailOverride);
  mockedSessionConfig.mockResolvedValue(config);

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/wfh/1"]}>
        <Routes>
          <Route path="/wfh/:reportId" element={<WfhReportDetailPage />} />
          <Route path="/wfh" element={<div>wfh-list-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue(detail("draft"));
});



// ── Helper tunggal editability ──────────────────────────────────────

describe("canEditReport — satu pintu gate edit (spec §Risks)", () => {
  it("draft dan rejected boleh diedit", () => {
    expect(canEditReport("draft")).toBe(true);
    expect(canEditReport("rejected")).toBe(true);
  });

  it("pending dan approved terkunci", () => {
    expect(canEditReport("pending")).toBe(false);
    expect(canEditReport("approved")).toBe(false);
  });
});

// ── Mount & fetch ───────────────────────────────────────────────────

describe("WfhReportDetailPage — mount & render", () => {
  it("mount → fetch detail dengan id route, render tanggal + badge status + sesi", async () => {
    renderDetail();

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(1);
    });
    expect(mockedSessionConfig).toHaveBeenCalledTimes(1);

    // Tanggal tampil di judul (bentuk teks pecah antar elemen).
    expect(await screen.findByText(/2026-08-10/)).toBeTruthy();
    expect(screen.getByTestId("wfh-status-badge").textContent).toBe("Draf");
    expect(screen.getByText("Kerja A")).toBeTruthy();
    // Sesi absensi dari config server (bukan hardcode) → 3 baris.
    expect(screen.getByText("Pagi")).toBeTruthy();
    expect(screen.getByText("Siang")).toBeTruthy();
    expect(screen.getByText("Sore")).toBeTruthy();
  });

  it("fetch gagal → pesan error tampil", async () => {
    mockedGet.mockRejectedValue(new Error("Laporan tidak ditemukan."));
    renderDetail();

    expect(await screen.findByText("Laporan tidak ditemukan.")).toBeTruthy();
  });
});

// ── Visibility aksi — owner staf ────────────────────────────────────

describe("WfhReportDetailPage — aksi owner (staf)", () => {
  it("draft: aksi submit + editor + unggah + edit tanggal tampil; approve/reject/PDF disembunyikan", async () => {
    renderDetail("staf", detail("draft"));

    expect(await screen.findByRole("button", { name: /ajukan untuk disetujui/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /tambah kegiatan/i })).toBeTruthy();
    expect(screen.getAllByLabelText(/unggah foto/i)).toHaveLength(3);
    expect(screen.getByLabelText(/tanggal laporan/i)).toBeTruthy();

    expect(screen.queryByRole("button", { name: /^setujui$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^tolak$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /unduh pdf/i })).toBeNull();
  });

  it("pending: admin UI terkunci (tanpa editor/unggah/edit tanggal/submit); PDF tampil", async () => {
    renderDetail("staf", detail("pending"));

    expect(await screen.findByRole("button", { name: /unduh pdf/i })).toBeTruthy();

    expect(screen.queryByRole("button", { name: /ajukan untuk disetujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tambah kegiatan/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
    expect(screen.queryByLabelText(/tanggal laporan/i)).toBeNull();
  });

  it("rejected: alasan penolakan tampil + tombol revisi; editor aktif lagi (canEditReport)", async () => {
    renderDetail("staf", { ...detail("rejected"), reject_reason: "Terlalu singkat." });

    expect(await screen.findByText("Terlalu singkat.")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /revisi/i })).toBeTruthy();
    // canEditReport("rejected") === true → editor & unggah aktif lagi.
    expect(screen.getByRole("button", { name: /tambah kegiatan/i })).toBeTruthy();
    expect(screen.getAllByLabelText(/unggah foto/i)).toHaveLength(3);
    // Submit hanya untuk draft — setelah revisi status kembali ke draft.
    expect(screen.queryByRole("button", { name: /ajukan untuk disetujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /unduh pdf/i })).toBeNull();
  });

  it("approved: read-only murni; hanya PDF", async () => {
    renderDetail("staf", detail("approved"));

    expect(await screen.findByRole("button", { name: /unduh pdf/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /tambah kegiatan/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /revisi/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ajukan untuk disetujui/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
  });
});

// ── Visibility aksi — atasan non-owner ──────────────────────────────

describe("WfhReportDetailPage — aksi atasan (kepala, non-owner)", () => {
  it("pending: Setujui + Tolak tampil; semua aksi owner disembunyikan", async () => {
    renderDetail("kepala", detail("pending"));

    expect(await screen.findByRole("button", { name: /setujui/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /tolak/i })).toBeTruthy();

    expect(screen.queryByRole("button", { name: /ajukan untuk disetujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tambah kegiatan/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
    expect(screen.queryByLabelText(/tanggal laporan/i)).toBeNull();
  });

  it("draft: kepala tanpa aksi apa pun (owner-only)", async () => {
    renderDetail("kepala", detail("draft"));

    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(1);
    });
    await screen.findByText("Kerja A");

    expect(screen.queryByRole("button", { name: /setujui/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tolak/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /unduh pdf/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
  });

  it("klik Setujui → POST approve", async () => {
    mockedApprove.mockResolvedValue(detail("approved"));
    renderDetail("kepala", detail("pending"));

    await userEvent.click(await screen.findByRole("button", { name: /setujui/i }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalledWith(1);
    });
  });
});

// ── Dispatch alur mutate ────────────────────────────────────────────

describe("WfhReportDetailPage — dispatch mutasi", () => {
  it("edit tanggal (owner, draft) → PUT metadata dengan nilai baru", async () => {
    mockedUpdateMetadata.mockResolvedValue(detail("draft"));
    renderDetail("staf", detail("draft"));

    const input = await screen.findByLabelText(/tanggal laporan/i);
    fireEvent.change(input, { target: { value: "2026-08-12" } });
    await userEvent.click(screen.getByRole("button", { name: /simpan tanggal/i }));

    await waitFor(() => {
      expect(mockedUpdateMetadata).toHaveBeenCalledWith(1, "2026-08-12");
    });
  });

  it("tolak → dialog alasan wajib; kirim reason ke API", async () => {
    mockedReject.mockResolvedValue(detail("rejected"));
    renderDetail("kepala", detail("pending"));

    await userEvent.click(await screen.findByRole("button", { name: /tolak/i }));

    const reason = await screen.findByLabelText(/alasan penolakan/i);
    await userEvent.type(reason, "Kegiatan kurang rinci.");
    await userEvent.click(screen.getByRole("button", { name: /tolak laporan/i }));

    await waitFor(() => {
      expect(mockedReject).toHaveBeenCalledWith(1, "Kegiatan kurang rinci.");
    });
  });

  it("gagal 422 saat reject → pesan envelope tampil ke user", async () => {
    mockedReject.mockRejectedValue(
      new Error("Laporan dengan status draft tidak dapat ditolak."),
    );
    renderDetail("kepala", detail("pending"));

    await userEvent.click(await screen.findByRole("button", { name: /tolak/i }));
    await userEvent.type(await screen.findByLabelText(/alasan penolakan/i), "Alasan kuat.");
    await userEvent.click(screen.getByRole("button", { name: /tolak laporan/i }));

    expect(
      await screen.findByText("Laporan dengan status draft tidak dapat ditolak."),
    ).toBeTruthy();
  });

  it("gagal 422 saat submit → pesan kesalahan tampil dan tidak dihapus refetch", async () => {
    // Kontrak: pesan error mutasi (422) TIDAK boleh terhapus. Sebelum fix,
    // refetch() pasca-mutasi (fetchWfhReport.pending) membersihkan
    // current.error sebelum pesan sempat terlihat.
    mockedSubmit.mockRejectedValue(
      new Error("Laporan kosong: minimal satu kegiatan atau absensi."),
    );
    renderDetail("staf", detail("draft"));

    await userEvent.click(
      await screen.findByRole("button", { name: /ajukan untuk disetujui/i }),
    );

    // Pesan envelope tampil.
    expect(
      await screen.findByText(
        "Laporan kosong: minimal satu kegiatan atau absensi.",
      ),
    ).toBeTruthy();
    // Mutasi gagal ⇒ tidak ada refetch (tetap 1 GET dari mount); pesan
    // bertahan di layar.
    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText("Laporan kosong: minimal satu kegiatan atau absensi."),
    ).toBeTruthy();
  });

  it("hapus kegiatan (owner, draft) → DELETE sub-resource lalu refetch detail", async () => {
    mockedDeleteActivity.mockResolvedValue("Kegiatan dihapus.");
    renderDetail("staf", detail("draft"));

    await userEvent.click(await screen.findByRole("button", { name: /hapus kegiatan/i }));

    await waitFor(() => {
      expect(mockedDeleteActivity).toHaveBeenCalledWith(1, 11);
    });
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledTimes(2);
    });
  });

  it("tambah kegiatan (owner, draft) → POST sub-resource", async () => {
    mockedAddActivity.mockResolvedValue({ id: 12, activity: "Setup VPN", sort_order: 2 });
    renderDetail("staf", detail("draft"));

    await userEvent.click(await screen.findByRole("button", { name: /tambah kegiatan/i }));
    await userEvent.type(await screen.findByLabelText(/deskripsi kegiatan/i), "Setup VPN");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => {
      expect(mockedAddActivity).toHaveBeenCalledWith(1, expect.objectContaining({ activity: "Setup VPN" }));
    });
  });
});
