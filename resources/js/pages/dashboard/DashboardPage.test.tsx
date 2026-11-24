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
import { render, screen, waitFor } from "@testing-library/react";
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

describe("DashboardPage — seksi lanjutan (T7)", () => {
  it("TrendChart merender 10 bar + ringkasan '118 dari 140'", async () => {
    // jsdom: 0×0 membuat recharts tidak merender; stub geometri agar bar
    // benar-benar muncul (pola disimpan dalam kontrak test seksi chart).
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const days = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      compliant: 9,
      total: 12,
    }));
    const data: DashboardData = {
      ...staffToday,
      trend: { days, summary: { compliant: 118, total: 140 } },
    };
    mockedGet.mockResolvedValue(data);

    renderPage();

    await screen.findByTestId("trend-chart");
    expect(screen.getByTestId("trend-summary").textContent).toContain("118 dari 140");
    expect(document.querySelectorAll(".recharts-bar-rectangle").length).toBe(10);
  });
});

describe("DashboardPage — QueueCard (T7)", () => {
  const admin = {
    ...staff,
    id: 30,
    roles: ["admin"],
    permissions: ["change.initiation.approve", "change.implementation.review"],
  };

  it("menampilkan jumlah paket + tombol menuju list paket", async () => {
    const data: DashboardData = {
      ...staffToday,
      queue: { change_initiations_pending: { count: 5 } },
    };
    mockedGet.mockResolvedValue(data);

    renderPage(admin);

    const kartu = await screen.findByTestId("queue-card");
    expect(kartu.textContent).toContain("5 paket perubahan menunggu keputusan");
    expect(screen.getByTestId("queue-link").getAttribute("href")).toBe("/changes");
  });

  it("tidak dirender bila kunci queue tidak ada", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage(admin);

    await screen.findByTestId("today-attendance");
    expect(screen.queryByTestId("queue-card")).toBeNull();
  });
});

describe("DashboardPage — AttentionCard (T7)", () => {
  const monitoringUser = {
    ...staff,
    id: 40,
    roles: ["kepala_bidang"],
    permissions: ["wfh.monitoring.view"],
  };

  const attention: DashboardData["attention"] = {
    users: [
      { user_id: 2, name: "Rina", team: "Tim B", compliant: 4, total: 14 },
      { user_id: 1, name: "Andi", team: "Tim A", compliant: 6, total: 14 },
    ],
    threshold_note: "Kepatuhan di bawah 60% dari 14 hari kerja terakhir",
  };

  it("daftar urut terendah dulu + note threshold", async () => {
    const data: DashboardData = { ...staffToday, attention };
    mockedGet.mockResolvedValue(data);

    renderPage(monitoringUser);

    const kartu = await screen.findByTestId("attention-card");
    expect(kartu.textContent).toContain("Kepatuhan di bawah 60%");
    const rows = screen.getAllByTestId("attention-row");
    expect(rows[0]?.textContent).toContain("Rina");
    expect(rows[1]?.textContent).toContain("Andi");
  });

  it("users kosong → empty state satu kalimat", async () => {
    const data: DashboardData = {
      ...staffToday,
      attention: { users: [], threshold_note: "x" },
    };
    mockedGet.mockResolvedValue(data);

    renderPage(monitoringUser);

    const kartu = await screen.findByTestId("attention-card");
    expect(kartu.textContent).toContain("Semua user memenuhi target kepatuhan");
    expect(screen.queryByTestId("attention-row")).toBeNull();
  });
});

describe("DashboardPage — ShortcutsRow (T7)", () => {
  it("staf: hanya pintasan absen + laporan", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage();

    await screen.findByTestId("today-attendance");
    const links = screen.getAllByTestId("shortcut-link").map((el) => el.getAttribute("href"));
    expect(links).toContain("/wfh");
    expect(links).not.toContain("/monitoring");
    expect(links).not.toContain("/admin/users");
  });

  it("admin: + monitoring + kelola user", async () => {
    const admin = {
      ...staff,
      id: 50,
      roles: ["admin"],
      permissions: [
        "wfh.report.create",
        "wfh.monitoring.view",
        "user.manage",
      ],
    };
    mockedGet.mockResolvedValue(staffToday);

    renderPage(admin);

    await screen.findByTestId("today-attendance");
    const links = screen.getAllByTestId("shortcut-link").map((el) => el.getAttribute("href"));
    expect(links).toContain("/wfh");
    expect(links).toContain("/monitoring");
    expect(links).toContain("/admin/users");
  });
});

describe("DashboardPage — refetch-on-focus (T7)", () => {
  it("dispatch fetchDashboard lagi saat visibilitychange → visible", async () => {
    mockedGet.mockResolvedValue(staffToday);

    renderPage();

    await screen.findByTestId("today-attendance");
    expect(mockedGet).toHaveBeenCalledTimes(1);

    // Skeleton halus (opacity) di atas data lama saat refetch berjalan.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    // Data lama tetap dirender selama refetch (tidak blank).
    expect(screen.getByTestId("today-attendance")).toBeTruthy();
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
