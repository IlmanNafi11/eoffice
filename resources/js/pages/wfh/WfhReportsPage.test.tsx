/**
 * Unit test WfhReportsPage (frontend-phase2 — Phase 3 task list page).
 * Kontrak yang dijaga (plan Task "WfhReportsPage"):
 * - mount → dispatch `fetchWfhReports` dengan query aktif dari slice;
 * - filter date (YYYY-MM-DD) / month (YYYY-MM) → fetch ulang dengan query itu
 *   (`date` menang atas `month` di backend, kontrak openapi);
 * - "Terapkan" tanpa filter → fetch ulang TANPA date/month (reset);
 * - ubah per halaman → fetch dengan `per_page`, kembali ke halaman 1;
 * - pagination primitive → fetch halaman berikut dengan query aktif;
 * - klik baris → navigasi ke `/wfh/:reportId`;
 * - list kosong → empty state bahasa Indonesia; fetch gagal → pesan error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent, pickDate, pickMonth, pickSelect } from "@/test/portal";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { PaginationMeta, WfhReport } from "@/api/types";

vi.mock("@/api/wfh", () => ({
  listWfhReports: vi.fn(),
  getWfhReport: vi.fn(),
  createWfhReport: vi.fn(),
  submitWfhReport: vi.fn(),
  approveWfhReport: vi.fn(),
  rejectWfhReport: vi.fn(),
  reviseWfhReport: vi.fn(),
  updateWfhReportMetadata: vi.fn(),
  deleteWfhReport: vi.fn(),
}));

import * as wfhApi from "@/api/wfh";
import { WfhReportsPage } from "@/pages/wfh/WfhReportsPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedList = wfhApi.listWfhReports as unknown as Mock;
const mockedCreate = wfhApi.createWfhReport as unknown as Mock;

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
  permissions: ["wfh.report.create"],
};

function renderPage(userOverride = user) {
  const store = makeStore();
  store.dispatch(setUser(userOverride));

  render(
    <Provider store={store}>
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

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ reports: [reportA, reportB], meta });
  mockedCreate.mockResolvedValue(reportA);
});


describe("WfhReportsPage — fetch awal & render", () => {
  it("mount mem-fetch daftar dan menampilkan baris tanggal + status", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1);
    });
    expect(mockedList).toHaveBeenCalledWith({});

    // Baris tabel: tanggal & badge status muncul.
    await screen.findByText("2026-08-10");
    expect(screen.getByText("2026-08-11")).toBeTruthy();
    expect(screen.getAllByTestId("wfh-status-badge")).toHaveLength(2);
    expect(screen.getByText("Menunggu persetujuan")).toBeTruthy();
    expect(screen.getByText("Draf")).toBeTruthy();
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
    mockedList.mockRejectedValueOnce(new Error("Server sibuk"));
    renderPage();

    expect(await screen.findByText("Server sibuk")).toBeTruthy();
  });
});

describe("WfhReportsPage — filter & paginate", () => {
  it("filter tanggal + Terapkan → fetch dengan query date (month kosong tak dikirim)", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    await pickDate(screen.getByLabelText(/tanggal/i), "2026-08-10");
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ date: "2026-08-10", page: 1 });
    });
  });

  it("filter bulan → fetch dengan query month YYYY-MM", async () => {
    renderPage();
    await screen.findByText("2026-08-10");
    mockedList.mockClear();

    await pickMonth(screen.getByLabelText(/bulan/i), 2026, "September");
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ month: "2026-09", page: 1 });
    });
  });

  it("Terapkan tanpa filter → fetch tanpa date/month (reset filter)", async () => {
    renderPage();
    await screen.findByText("2026-08-10");

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
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));


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
    await userEvent.click(screen.getByRole("button", { name: /^buat$/i }));

    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith({ report_date: todayIso() });
    });
    expect(await screen.findByText("wfh-detail-stub")).toBeTruthy();
  });
});
