/**
 * Route cutover (plan T6 step e): `/` di `routes/index.tsx` merender
 * DashboardPage, bukan placeholder lama.
 */
import { router } from "@/routes";
import { RouterProvider } from "react-router-dom";
import { setToken } from "@/store/authSlice";

/**
 * Unit test DashboardPage + TodayCards (modul dashboard, plan T6).
 *
 * Kontrak yang dijaga:
 * - mount → thunk `fetchDashboard` di-dispatch sekali (satu endpoint tunggal);
 * - selama `status === "loading"` seksi merender Skeleton (per kartu),
 *   bukan teks data kosong yang menyesatkan;
 * - staf: kartu absensi "2/3 sesi" + badge laporan `pending` (peta warna
 *   draft=muted / pending=warning / approved=success / rejected=error),
 *   tanpa kartu rekap cakupan maupun antrean;
 * - kepala_bidang dengan `scope`: kartu rekap mengirim pembilang + penyebut
 *   ("3 dari 12 belum absen"), bukan persen telanjang;
 * - hari non-kerja (`is_workday:false`): status netral "Hari ini bukan hari
 *   WFH", tanpa kartu rekap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { DashboardData } from "@/api/types";

vi.mock("@/api/dashboard", () => ({ getDashboard: vi.fn() }));

import * as dashboardApi from "@/api/dashboard";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedGet = dashboardApi.getDashboard as unknown as Mock;

const staff = {
  id: 10,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.report.create"],
};

const kepalaBidang = {
  ...staff,
  id: 20,
  name: "Siti Kepala",
  roles: ["kepala_bidang"],
  permissions: ["wfh.monitoring.view", "wfh.team_report.approve"],
};

const staffToday: DashboardData = {
  generated_at: "2026-11-24T09:14:00+07:00",
  today: {
    is_workday: true,
    me: {
      attendance: { sessions_done: 2, sessions_total: 3, next_session: "sore" },
      report: { status: "pending", report_id: 123 },
    },
  },
};

const kerjaBidang: DashboardData = {
  ...staffToday,
  today: {
    is_workday: true,
    me: {
      attendance: { sessions_done: 0, sessions_total: 3, next_session: "pagi" },
      report: null,
    },
    scope: {
      label: "Bidang",
      users_total: 12,
      absent: 3,
      no_report: 5,
      team_reports_pending: 2,
    },
  },
};

const hariLibur: DashboardData = {
  generated_at: "2026-11-22T09:14:00+07:00",
  today: { is_workday: false, me: null },
};

function renderPage(user: typeof staff = staff) {
  const store = makeStore();
  store.dispatch(setUser(user));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPage — fetch on mount", () => {
  it("men-dispatch fetchDashboard sekali saat mount", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage();

    expect(await screen.findByTestId("today-attendance")).toBeTruthy();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardPage — skeleton saat loading", () => {
  it("merender skeleton per kartu selama data belum tiba", () => {
    // Promise menggantung: status tetap "loading" sepanjang test.
    mockedGet.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getAllByTestId("today-card-skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("today-attendance")).toBeNull();
  });
});

describe("DashboardPage — data staf", () => {
  it("menampilkan absensi 2/3 sesi dan badge laporan pending (warning)", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage();

    const absensi = await screen.findByTestId("today-attendance");
    expect(absensi.textContent).toContain("2/3 sesi");

    const badge = screen.getByTestId("wfh-status-badge");
    expect(badge.textContent).toBe("Menunggu persetujuan");
    // pending = warning (peta warna modul; amber dipakai varian warning).
    expect(badge.className).toMatch(/amber/);

    // Staf tanpa permission monitoring: tidak ada kartu rekap cakupan.
    expect(screen.queryByTestId("today-scope")).toBeNull();
  });

  it("tidak merender kartu rekap saat scope tidak dikirim backend", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage(kepalaBidang);

    await screen.findByTestId("today-attendance");
    expect(screen.queryByTestId("today-scope")).toBeNull();
  });
});

describe("DashboardPage — rekap cakupan kepala bidang", () => {
  it("menampilkan pembilang + penyebut belum absen", async () => {
    mockedGet.mockResolvedValue(kerjaBidang);

    renderPage(kepalaBidang);

    const rekap = await screen.findByTestId("today-scope");
    expect(rekap.textContent).toContain("3 dari 12 belum absen");
  });
});

describe("DashboardPage — hari non-kerja", () => {
  it("menampilkan status netral tanpa kartu rekap", async () => {
    mockedGet.mockResolvedValue(hariLibur);

    renderPage();

    expect(await screen.findByTestId("today-non-workday")).toBeTruthy();
    expect(screen.getByTestId("today-non-workday").textContent).toContain(
      "Hari ini bukan hari WFH",
    );
    expect(screen.queryByTestId("today-attendance")).toBeNull();
    expect(screen.queryByTestId("today-scope")).toBeNull();
  });
});

describe("DashboardPage — kegagalan fetch", () => {
  it("menampilkan pesan error tanpa membuang kerangka halaman", async () => {
    mockedGet.mockRejectedValue(new Error("Network Error"));

    renderPage();

    expect(await screen.findByTestId("dashboard-error")).toBeTruthy();
  });
});

describe("Route `/` — cutover ke DashboardPage", () => {
  it("merender DashboardPage (bukan placeholder lama) di path `/`", async () => {
    mockedGet.mockResolvedValue(staffToday);

    const store = makeStore();
    store.dispatch(setUser(staff));
    store.dispatch(setToken("tok-test"));

    render(
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>,
    );

    expect(await screen.findByTestId("today-attendance")).toBeTruthy();
    // Teks placeholder lama tidak boleh ada lagi.
    expect(screen.queryByText(/modul menyusul di fase berikutnya/i)).toBeNull();
  });
});
