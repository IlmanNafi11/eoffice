/**
 * Unit test WfhReportDetailPage (frontend-phase2 — Phase 3 task detail page).
 * Kontrak yang dijaga (plan Task "WfhReportDetailPage + wiring route"):
 * - mount → GET /wfh/reports/{id} (id dari route) + GET /wfh/session-config;
 * - gate editability via helper TUNGGAL `canEditReport(status)` (draft saja;
 *   rejected terminal — revisi dihapus 2026-11-23);
 * - aksi owner (edit tanggal/aktivitas/absensi/submit) disembunyikan untuk
 *   non-owner; approve/reject butuh `wfh.report.approve|reject`;
 * - PDF hanya `pending|approved` + `wfh.report.export_pdf`;
 * - aksi tak diizinkan disembunyikan (bukan disabled);
 * - reject wajib lewat dialog alasan;
 * - error mutasi (422 kontrak) tampil sebagai pesan ke user.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent, pickDate } from "@/test/portal";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AuthUser, WfhReport, WfhSessionConfig } from "@/api/types";
import { ApiError } from "@/api/client";
import { Toaster } from "@/components/ui/sonner";

vi.mock("@/api/wfh", () => ({
  listWfhReports: vi.fn(),
  getWfhReport: vi.fn(),
  getWfhSessionConfig: vi.fn(),
  createWfhReport: vi.fn(),
  submitWfhReport: vi.fn(),
  approveWfhReport: vi.fn(),
  rejectWfhReport: vi.fn(),
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
const mockedPdf = wfhApi.exportWfhReportPdf as unknown as Mock;
const mockedCreate = wfhApi.createWfhReport as unknown as Mock;
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

function renderDetail(
  role: Role = "staf",
  detailOverride?: WfhReport,
  state?: { from: string },
) {
  const store = makeStore();
  store.dispatch(setUser(USERS[role]));
  if (detailOverride) mockedGet.mockResolvedValue(detailOverride);
  mockedSessionConfig.mockResolvedValue(config);

  render(
    <>
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
      <Provider store={store}>
        <MemoryRouter initialEntries={[{ pathname: "/wfh/1", state: state ?? null }]}>
          <Routes>
            <Route path="/wfh/:reportId" element={<WfhReportDetailPage />} />
            <Route path="/wfh" element={<div>wfh-list-stub</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    </>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGet.mockResolvedValue(detail("draft"));
});



// ── Helper tunggal editability ──────────────────────────────────────

describe("canEditReport — satu pintu gate edit (spec §Risks)", () => {
  it("draft boleh diedit; rejected terminal (tidak bisa diedit)", () => {
    expect(canEditReport("draft")).toBe(true);
    expect(canEditReport("rejected")).toBe(false);
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
    mockedGet.mockRejectedValue(new ApiError("http", "Laporan tidak ditemukan.", { status: 404 }));
    renderDetail();

    expect(await screen.findByText("Laporan tidak ditemukan.")).toBeTruthy();
  });

  it("back mengikuti location.state.from, fallback /wfh tanpa state", async () => {
    renderDetail("staf", undefined, { from: "/monitoring" });

    const back = await screen.findByLabelText("Kembali ke daftar");
    expect(back.getAttribute("href")).toBe("/monitoring");
  });

  it("refresh tanpa state → back ke /wfh", async () => {
    renderDetail();

    const back = await screen.findByLabelText("Kembali ke daftar");
    expect(back.getAttribute("href")).toBe("/wfh");
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

  it("rejected: alasan penolakan tampil, TANPA tombol revisi, editor mati (terminal)", async () => {
    renderDetail("staf", { ...detail("rejected"), reject_reason: "Terlalu singkat." });

    expect(await screen.findByText("Terlalu singkat.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /revisi/i })).toBeNull();
    // canEditReport("rejected") === false → editor & unggah mati.
    expect(screen.queryByRole("button", { name: /tambah kegiatan/i })).toBeNull();
    expect(screen.queryByLabelText(/unggah foto/i)).toBeNull();
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

    await pickDate(await screen.findByLabelText(/tanggal laporan/i), "2026-08-12");
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
      new ApiError("http", "Laporan dengan status draft tidak dapat ditolak.", { status: 422 }),
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
      new ApiError("http", "Laporan kosong: minimal satu kegiatan atau absensi.", { status: 422 }),
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

  it("tambah kegiatan (owner, draft) → POST sub-resource dengan waktu & link", async () => {
    mockedAddActivity.mockResolvedValue({ id: 12, activity: "Setup VPN", sort_order: 2 });
    renderDetail("staf", detail("draft"));

    await userEvent.click(await screen.findByRole("button", { name: /tambah kegiatan/i }));
    await userEvent.type(await screen.findByLabelText(/^kegiatan$/i), "Setup VPN");
    await userEvent.click(screen.getByRole("button", { name: /waktu pelaksanaan awal/i }));
    await userEvent.click(screen.getByRole("button", { name: /jam 08/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /menit 00/i }).at(-1)!);
    await userEvent.click(screen.getByRole("button", { name: /waktu pelaksanaan akhir/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /jam 10/i }).at(-1)!);
    await userEvent.click(screen.getAllByRole("button", { name: /menit 00/i }).at(-1)!);
    await userEvent.type(screen.getByLabelText(/^link$/i), "https://google.com");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => {
      expect(mockedAddActivity).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          activity: "Setup VPN",
          start_time: "08:00",
          end_time: "10:00",
          links: [{ id: null, url: "https://google.com" }],
        }),
      );
    });
  });
  it(
    "double-submit Setujui → hanya SATU POST approve (guard busyRef sinkron)",
    async () => {
      mockedApprove.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(detail("approved")), 50)),
      );
      renderDetail("kepala", detail("pending"));

      const btn = await screen.findByRole("button", { name: /setujui/i });
      // Dua klik beruntun sebelum promise pertama settle — ref guard harus
      // menolak yang kedua karena state belum sempat re-render.
      await userEvent.click(btn);
      await userEvent.click(btn);

      await waitFor(() => {
        expect(mockedApprove).toHaveBeenCalledTimes(1);
      });
      // Settle penuh (mutasi 50ms + refetch) agar tidak bocor ke test
      // berikutnya.
      await waitFor(() => {
        expect(mockedGet.mock.calls.length).toBeGreaterThan(1);
      });
    },
  );

  it("double-submit Ajukan → hanya SATU POST submit", async () => {
    mockedSubmit.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(detail("pending")), 50)),
    );
    renderDetail("staf", detail("draft"));

    const btn = await screen.findByRole("button", { name: /ajukan untuk disetujui/i });
    await userEvent.click(btn);
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledTimes(1);
    });
    // Settle penuh (mutasi 50ms + refetch) agar tidak bocor ke test
    // berikutnya.
    await waitFor(() => {
      expect(mockedGet.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it(
    "persistActivities multi-op: add+delete dalam satu siklus editor — refetch saat semua sukses",
    async () => {
      const start: WfhReport = {
        ...detail("draft"),
        activities: [
          { id: 11, activity: "Kerja A", sort_order: 1 },
          { id: 12, activity: "Kerja B", sort_order: 2 },
        ],
      };
      mockedAddActivity.mockResolvedValue({ id: 13, activity: "Kerja C", sort_order: 3 });
      mockedDeleteActivity.mockResolvedValue("Kegiatan dihapus.");
      renderDetail("staf", start);

      await waitFor(() => expect(screen.getByText("Kerja B")).toBeTruthy());
      const getsBefore = mockedGet.mock.calls.length;
      // Dua baris → dua tombol hapus; ambil milik "Kerja A" (pertama).
      await userEvent.click(screen.getAllByRole("button", { name: /hapus kegiatan/i })[0]!);
      await waitFor(() => {
        expect(mockedDeleteActivity).toHaveBeenCalledWith(1, 11);
      });
      // Semua op sukses → TEPAT satu refetch detail (delta, bukan absolut).
      await waitFor(() => {
        expect(mockedGet.mock.calls.length).toBe(getsBefore + 1);
      });
    },
  );

  it("persistActivities: salah satu op gagal → TIDAK refetch, pesan error tampil", async () => {
    renderDetail("staf", detail("draft"));

    await waitFor(() => expect(screen.getByText("Kerja A")).toBeTruthy());
    mockedAddActivity.mockRejectedValueOnce(
      new ApiError("http", "Gagal tambah kegiatan.", { status: 500 }),
    );
    await userEvent.click(screen.getByRole("button", { name: /tambah kegiatan/i }));
    await userEvent.type(await screen.findByLabelText(/^kegiatan$/i), "Kerja X");
    await userEvent.click(screen.getByRole("button", { name: /^simpan$/i }));

    await waitFor(() => {
      expect(screen.getByText("Gagal tambah kegiatan.")).toBeTruthy();
    });
    // Error mutasi tampil INLINE: halaman tidak collapse ke layar error —
    // editor (dan baris belum tersimpan) tetap termuat.
    expect(screen.getByText("Kerja A")).toBeTruthy();
    // Ada op reject → tidak ada GET baru sama sekali (tidak refetch).
    const getsBeforeFailure = mockedGet.mock.calls.length;
    await new Promise((r) => setTimeout(r, 20));
    expect(mockedGet.mock.calls.length).toBe(getsBeforeFailure);
  });
});

describe("WfhReportDetailPage — unduh PDF gagal (pdf-signature S6)", () => {
  it("gagal download → toast berisi pesan server + inline error tetap dirender", async () => {
    mockedPdf.mockRejectedValue(
      new ApiError(
        "validation",
        "Anda belum mengatur tanda tangan. Atur tanda tangan terlebih dahulu sebelum mengekspor PDF.",
        { status: 422 },
      ),
    );
    renderDetail("staf", detail("pending"));

    await userEvent.click(await screen.findByRole("button", { name: /unduh pdf/i }));

    // Toast error berisi pesan server (bukan copy generik).
    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Anda belum mengatur tanda tangan");
    });
    // Banner inline dari PdfDownloadButton tetap dirender.
    expect(
      await screen.findByText(/anda belum mengatur tanda tangan/i),
    ).toBeTruthy();
  });
});
// ── Shortcut Buat Laporan Perbaikan (Task 7) ────────────────────────

describe("WfhReportDetailPage — shortcut Buat Laporan Perbaikan", () => {
  it("rejected + owner: tombol tampil", async () => {
    renderDetail("staf", detail("rejected"));

    expect(
      await screen.findByRole("button", { name: /buat laporan perbaikan/i }),
    ).toBeTruthy();
  });

  it("pending: tombol disembunyikan (hanya rejected)", async () => {
    renderDetail("staf", detail("pending"));

    await screen.findByRole("button", { name: /unduh pdf/i });
    expect(
      screen.queryByRole("button", { name: /buat laporan perbaikan/i }),
    ).toBeNull();
  });

  it("rejected non-owner (kepala): tombol disembunyikan", async () => {
    renderDetail("kepala", detail("rejected"));

    await screen.findByText(/2026-08-10/);
    expect(
      screen.queryByRole("button", { name: /buat laporan perbaikan/i }),
    ).toBeNull();
  });

  it("klik → createWfhReport dengan tanggal laporan, navigate ke draft baru", async () => {
    mockedCreate.mockResolvedValue({ id: 7, message: "Draft perbaikan dibuat." });
    renderDetail("staf", detail("rejected"));

    await userEvent.click(
      await screen.findByRole("button", { name: /buat laporan perbaikan/i }),
    );

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ report_date: "2026-08-10" });
    });
    // Navigate ke /wfh/7 → route /wfh/:reportId remount → fetch detail baru.
    await waitFor(() => {
      expect(mockedGet).toHaveBeenCalledWith(7);
    });
  });

  it("gagal 422 (tanggal terkunci) → pesan tampil, tidak navigate", async () => {
    mockedCreate.mockRejectedValue(
      new ApiError(
        "http",
        "Tanggal 2026-08-10 masih menunggu keputusan atasan.",
        { status: 422 },
      ),
    );
    renderDetail("staf", detail("rejected"));

    await userEvent.click(
      await screen.findByRole("button", { name: /buat laporan perbaikan/i }),
    );

    expect(
      await screen.findByText(
        "Tanggal 2026-08-10 masih menunggu keputusan atasan.",
      ),
    ).toBeTruthy();
    expect(mockedGet).not.toHaveBeenCalledWith(7);
  });
});

