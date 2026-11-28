/**
 * Unit test WfhReportsPage (frontend-phase2 — Phase 3 task list page).
 * Kontrak yang dijaga (plan Task "WfhReportsPage"):
 * - filter rentang date_from/date_to (YYYY-MM-DD) bersifat lokal sampai
 *   "Terapkan" ditekan, lalu fetch ulang (kontrak openapi v6.8.0: precedence
 *   range > date > month di backend; UI hanya mengirim rentang);
 * - pagination primitive → fetch halaman berikut dengan query aktif;
 * - klik baris → navigasi ke `/wfh/:reportId`;
 * - list kosong → empty state bahasa Indonesia; fetch gagal → pesan error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { userEvent, pickDate, pickSelect } from "@/test/portal";
import { render, screen, waitFor } from "@testing-library/react";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/api/client";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PaginationMeta, WfhReport } from "@/api/types";

vi.mock("@/api/wfh", () => ({
  listWfhReports: vi.fn(),
  getWfhReport: vi.fn(),
  createWfhReport: vi.fn(),
  getWfhSessionConfig: vi.fn(),
  submitWfhReport: vi.fn(),
  approveWfhReport: vi.fn(),
  rejectWfhReport: vi.fn(),
  updateWfhReportMetadata: vi.fn(),
  deleteWfhReport: vi.fn(),
  exportWfhReportPdf: vi.fn(),
}));

import * as wfhApi from "@/api/wfh";
import { WfhReportsPage } from "@/pages/wfh/WfhReportsPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedList = wfhApi.listWfhReports as unknown as Mock;
const mockedCreate = wfhApi.createWfhReport as unknown as Mock;
const mockedExportPdf = wfhApi.exportWfhReportPdf as unknown as Mock;
const mockedDelete = wfhApi.deleteWfhReport as unknown as Mock;
const mockedSessionConfig = wfhApi.getWfhSessionConfig as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 10, total: 12 };

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const reportA: WfhReport = {
  id: 1,
  user_id: 10,
  report_date: "2026-08-10",
  status: "pending",
  activity_count: 2,
};

const reportB: WfhReport = {
  id: 2,
  user_id: 10,
  report_date: "2026-08-11",
  status: "draft",
};

const user = {
  id: 10,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  phone: "081234567890",
  position: "Staf Pelaksana",
  rank: "Pengatur Muda",
  signature_url: null,
  must_change_password: false,
  is_active: true,
  roles: ["staf"],
  permissions: [
    "wfh.report.create",
    "wfh.report.update",
    "wfh.report.delete",
    "wfh.report.export_pdf",
  ],
};

function renderPage(userOverride = user) {
  const store = makeStore();
  store.dispatch(setUser(userOverride));

  render(
    <Provider store={store}>
      {/* Toaster asli: toast dirender ke document.body (portal sonner). */}
      <Toaster position="top-right" richColors />
      <MemoryRouter initialEntries={["/wfh"]}>
        <Routes>
          <Route path="/wfh" element={<WfhReportsPage />} />
          <Route path="/wfh/:reportId" element={<div>wfh-detail-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

/** Buka dropdown filter (kontrol tanggal sekarang berada di dalamnya). */
async function openFilter() {
  await userEvent.click(screen.getByTestId("wfh-filter-trigger"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
  mockedCreate.mockResolvedValue(reportA);
  mockedSessionConfig.mockResolvedValue({ sessions: ["pagi", "siang", "sore"], allowed_days: [1, 2, 3, 4, 5] });
  // jsdom tidak punya createObjectURL/revokeObjectURL (unduh PDF dari menu).
  URL.createObjectURL = vi.fn(() => `blob:stub-${Math.random().toString(36).slice(2)}`);
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});


describe("WfhReportsPage — fetch awal & render", () => {
  it("mount mem-fetch daftar dan menampilkan baris tanggal + status", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1);
    });
    expect(mockedList).toHaveBeenCalledWith({});

    // Baris tabel: tanggal, badge status, dan ringkasan absensi muncul.
    await screen.findByText("2026-08-10");
    expect(screen.getByText("2026-08-11")).toBeTruthy();
    expect(screen.getAllByTestId("wfh-status-badge")).toHaveLength(2);
    expect(screen.getByText("Menunggu persetujuan")).toBeTruthy();
    expect(screen.getByText("Draf")).toBeTruthy();

    // Kolom Status WFH: pill per sesi aktif — tanpa absensi → semua "belum absen".
    expect(screen.getAllByTestId("wfh-attendance-status")).toHaveLength(2);
    expect(screen.getAllByLabelText("Pagi belum absen")).toHaveLength(2);
    expect(screen.getAllByLabelText("Sore belum absen")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Status WFH" })).toBeTruthy();
    // Ikon dekoratif ganda di header halaman telah dihapus.
    expect(screen.queryByTestId("wfh-header-icon")).toBeNull();
  });

  it("klik baris → navigasi ke /wfh/:reportId", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByText("2026-08-10"));

    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("list kosong → empty state bahasa Indonesia, tanpa tabel", async () => {
    mockedList.mockResolvedValueOnce({ reports: [], meta: { ...meta, total: 0, last_page: 1 } });
    renderPage();

    expect(await screen.findByText(/belum ada laporan/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("fetch gagal → pesan error tampil", async () => {
    mockedList.mockRejectedValueOnce(new ApiError("http", "Server sibuk", { status: 500 }));
    renderPage();

    expect(await screen.findByText("Server sibuk")).toBeTruthy();
  });
  it("session-config gagal → fallback tiga sesi default tetap tampil", async () => {
    mockedSessionConfig.mockRejectedValueOnce(new ApiError("http", "gagal", { status: 500 }));
    renderPage();

    await screen.findByText("2026-08-10");

    expect(screen.getAllByTestId("wfh-attendance-status")).toHaveLength(2);
    expect(screen.getAllByLabelText("Pagi belum absen")).toHaveLength(2);
    expect(screen.getAllByLabelText("Sore belum absen")).toHaveLength(2);
  });

});



describe("WfhReportsPage — filter & paginate", () => {
  it("filter rentang (from + to) → fetch dengan date_from + date_to", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    await openFilter();
    await pickDate(screen.getByLabelText("Dari tanggal"), "2026-08-01");
    await pickDate(screen.getByLabelText("Sampai tanggal"), "2026-08-31");
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({
        date_from: "2026-08-01",
        date_to: "2026-08-31",
        page: 1,
      });
    });
  });

  it("rentang parsial (hanya from) → kirim date_from saja", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    await openFilter();
    await pickDate(screen.getByLabelText("Dari tanggal"), "2026-08-15");
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ date_from: "2026-08-15", page: 1 });
    });
  });

  it("Terapkan tanpa filter → fetch tanpa date/month (reset filter)", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await openFilter();
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it("ubah per halaman → langsung fetch dengan per_page; next mempertahankannya", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    mockedList.mockResolvedValue({
      reports: [reportA, reportB],
      meta: { current_page: 1, last_page: 2, per_page: 25, total: 30 },
    });

    await pickSelect(/per halaman/i, "25");

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 1 });
    });

    // Pagination primitive hidup: next → halaman 2, per_page dipertahankan.
    await screen.findByText(/Halaman 1 dari 2/);
    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 2 });
    });
  });

  it("klik Berikutnya pada meta awal → fetch halaman 2", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 2 });
    });
  });

  it("Terapkan setelah pindah halaman → kembali ke halaman 1, filter lama direset", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 2 });
    });

    await openFilter();
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      // Bukan gabungan query lama ({page: 2}) — reset bersih ke halaman 1.
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1 });
    });
  });
});

describe("WfhReportsPage — tombol Buat Laporan & dialog create", () => {
  it("menampilkan tombol Buat Laporan bila punya wfh.report.create", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    expect(screen.getByRole("button", { name: /buat laporan/i })).toBeTruthy();
  });

  it("menyembunyikan tombol tanpa wfh.report.create", async () => {
    renderPage({ ...user, permissions: ["wfh.report.export_pdf"] });
    await screen.findByText("2026-08-10");

    expect(screen.queryByRole("button", { name: /buat laporan/i })).toBeNull();
  });

  it("dialog default hari ini → create mem-POST {report_date} lalu navigate ke detail", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");

    // Dialog DateInput default hari ini: submit langsung memakai tanggal
    // berjalan (format yyyy-MM-dd lokal) — bukan input native ber-value.
    await userEvent.click(
      screen.getByRole("button", { name: "Buat" }),
    );


    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ report_date: todayIso() });
    });
    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("get-or-create 200 (laporan sudah ada) tetap navigate ke detail", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    // create mengembalikan laporan yang sudah ada (id 2) — perilaku 200.
    mockedCreate.mockResolvedValueOnce(reportB);

    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Buat" }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ report_date: todayIso() });
    });
    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });
});

describe("WfhReportsPage — spinner pending + toast create (T7b)", () => {
  it("create sukses → toast sukses teks server sebelum navigate", async () => {
    mockedCreate.mockResolvedValueOnce({ ...reportA, message: "Laporan WFH berhasil dibuat." });
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Buat" }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Laporan WFH berhasil dibuat.");
    });
    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("create gagal → toast error pesan server + banner inline di dialog tetap", async () => {
    mockedCreate.mockRejectedValueOnce(
      new ApiError("http", "Tanggal di luar hari kerja.", { status: 422 }),
    );
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Buat" }));

    await waitFor(() => {
      const toast = document.querySelector("[data-sonner-toast]");
      expect(toast).toBeTruthy();
      expect(toast!.textContent).toContain("Tanggal di luar hari kerja.");
    });
    // Banner inline di dalam dialog tetap dirender.
    expect(screen.getByTestId("wfh-create-error")).toBeTruthy();
  });

  it("tombol Buat aria-busy selama create in-flight (mock never-resolves)", async () => {
    mockedCreate.mockImplementation(() => new Promise(() => {}));
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByRole("button", { name: /buat laporan/i }));
    await screen.findByRole("dialog");
    const buat = screen.getByRole("button", { name: "Buat" });
    await userEvent.click(buat);

    await waitFor(() => {
      expect(buat.getAttribute("aria-busy")).toBe("true");
    });
    expect((buat as HTMLButtonElement).disabled).toBe(true);
    expect(buat.querySelector('[data-slot="spinner"]')).toBeTruthy();
  });
});

describe("WfhReportsPage — kolom Aksi per baris (wfh-report-actions)", () => {
  it("punya permission lengkap → header kolom Aksi + menu per baris", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    expect(screen.getByRole("columnheader", { name: "Aksi" })).toBeTruthy();
    expect(screen.getByTestId("wfh-report-actions-1")).toBeTruthy();
    expect(screen.getByTestId("wfh-report-actions-2")).toBeTruthy();
  });

  it("menu baris pending → Detail + Unduh PDF, tanpa Edit/Hapus", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByTestId("wfh-report-actions-1"));

    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Unduh PDF" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
  });

  it("menu baris draft → Detail + Edit + Hapus, tanpa Unduh PDF", async () => {
    renderPage();
    await screen.findByText("2026-08-11");

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));

    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Hapus" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Unduh PDF" })).toBeNull();
  });

  it("item Edit → navigate ke detail draft", async () => {
    renderPage();
    await screen.findByText("2026-08-11");

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("item Detail → navigate ke detail", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByTestId("wfh-report-actions-1"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Detail" }));

    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });

  it("item Unduh PDF → exportWfhReportPdf dengan id baris", async () => {
    mockedExportPdf.mockResolvedValue(new Blob(["pdf"], { type: "application/pdf" }));
    renderPage();
    await screen.findByText("2026-08-10");

    await userEvent.click(screen.getByTestId("wfh-report-actions-1"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unduh PDF" }));

    await waitFor(() => expect(mockedExportPdf).toHaveBeenCalledWith(1));
  });

  it("item Hapus → dialog konfirmasi; konfirmasi → deleteWfhReport + baris hilang", async () => {
    mockedDelete.mockResolvedValue("Laporan WFH dihapus.");
    renderPage();
    await screen.findByText("2026-08-11");

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Hapus" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("2026-08-11");

    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(2));
    await waitFor(() => {
      expect(screen.queryByText("2026-08-11")).toBeNull();
    });
  });

  it("hapus gagal → dialog tetap terbuka + pesan error", async () => {
    mockedDelete.mockRejectedValueOnce(
      new ApiError("http", "Tidak diizinkan.", { status: 403 }),
    );
    renderPage();
    await screen.findByText("2026-08-11");

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Hapus" }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Hapus" }));

    expect(await screen.findByText("Tidak diizinkan.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("batal di dialog konfirmasi → delete tidak dipanggil", async () => {
    renderPage();
    await screen.findByText("2026-08-11");

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Hapus" }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "Batal" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("tanpa permission aksi → kolom Aksi tidak dirender", async () => {
    renderPage({
      ...user,
      permissions: ["wfh.report.create"],
    });
    await screen.findByText("2026-08-10");

    expect(screen.queryByRole("columnheader", { name: "Aksi" })).toBeNull();
    expect(screen.queryByTestId("wfh-report-actions-1")).toBeNull();
  });

  it("permission sebagian (hanya export_pdf) → menu hanya Detail + Unduh PDF", async () => {
    renderPage({ ...user, permissions: ["wfh.report.export_pdf"] });
    await screen.findByText("2026-08-10");

    expect(screen.getByRole("columnheader", { name: "Aksi" })).toBeTruthy();

    await userEvent.click(screen.getByTestId("wfh-report-actions-2"));
    expect(await screen.findByRole("menuitem", { name: "Detail" })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Hapus" })).toBeNull();
  });
});
