/**
 * Unit test store/dashboardSlice (modul dashboard).
 * Reducer + thunk diuji dengan mock modul `@/api/dashboard` (vi.mock),
 * mengikuti pola `wfhMonitoringSlice.test.ts`. Kontrak yang dijaga:
 * - `fetchDashboard` mengisi `data` + `generatedAt`;
 * - rejected → `error` pesan siap tampil dan `data` lama TIDAK dihapus
 *   (refetch halus: data basi tetap tampil selama fetch gagal);
 * - reducer `dashboard` terdaftar di store aplikasi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { DashboardData } from "@/api/types";

vi.mock("@/api/dashboard", () => ({
  getDashboard: vi.fn(),
}));

import * as dashboardApi from "@/api/dashboard";
import { ApiError } from "@/api/client";
import {
  dashboardReducer,
  fetchDashboard,
  initialDashboardState,
  selectDashboard,
  selectDashboardData,
} from "@/store/dashboardSlice";
import { makeStore } from "@/store";

const mockedGet = dashboardApi.getDashboard as unknown as Mock;

const dashboardData: DashboardData = {
  generated_at: "2026-11-24T09:14:00+07:00",
  today: {
    is_workday: true,
    me: {
      attendance: { sessions_done: 2, sessions_total: 3, next_session: "sore" },
      report: { status: "pending", report_id: 123 },
    },
  },
};

const seeded = () => dashboardReducer(undefined, { type: "@@INIT" });

describe("dashboardSlice — initial state", () => {
  it("state awal bersih: data null, status idle, error null, generatedAt null", () => {
    const state = seeded();
    expect(state.data).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.error).toBeNull();
    expect(state.generatedAt).toBeNull();
  });

  it("reducer dashboard terdaftar di store aplikasi", () => {
    const store = makeStore();
    expect(selectDashboard(store.getState())).toEqual(initialDashboardState());
  });
});

describe("dashboardSlice — fetchDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pending → status loading", () => {
    const state = dashboardReducer(
      initialDashboardState(),
      fetchDashboard.pending("req-1", undefined),
    );
    expect(state.status).toBe("loading");
  });

  it("sukses mengisi data + generatedAt", async () => {
    mockedGet.mockResolvedValueOnce(dashboardData);
    const store = makeStore();

    await store.dispatch(fetchDashboard());

    const state = selectDashboard(store.getState());
    expect(state.status).toBe("succeeded");
    expect(state.error).toBeNull();
    expect(selectDashboardData(store.getState())).toEqual(dashboardData);
    expect(state.generatedAt).toBe("2026-11-24T09:14:00+07:00");
    expect(mockedGet).toHaveBeenCalledWith();
  });

  it("gagal men-set status failed + error siap tampil", async () => {
    mockedGet.mockRejectedValueOnce(
      new ApiError("http", "This action is unauthorized.", { status: 403 }),
    );
    const store = makeStore();
    await store.dispatch(fetchDashboard());

    const state = selectDashboard(store.getState());
    expect(state.status).toBe("failed");
    expect(state.error).toBe("This action is unauthorized.");
    expect(state.data).toBeNull();
  });

  it("refetch gagal TIDAK menghapus data lama (data basi tetap tampil)", async () => {
    mockedGet.mockResolvedValueOnce(dashboardData);
    const store = makeStore();
    await store.dispatch(fetchDashboard());
    expect(selectDashboardData(store.getState())).toEqual(dashboardData);

    mockedGet.mockRejectedValueOnce(
      new ApiError("network", "Network Error", { status: null }),
    );
    await store.dispatch(fetchDashboard());

    const state = selectDashboard(store.getState());
    expect(state.status).toBe("failed");
    expect(state.error).not.toBeNull();
    expect(selectDashboardData(store.getState())).toEqual(dashboardData);
    expect(state.generatedAt).toBe("2026-11-24T09:14:00+07:00");
  });

  it("respons BASI dari fetch lama tidak menimpa data lebih segar (race out-of-order)", async () => {
    // ship review #20: mount + focus-refetch tumpang tindih; fetch PERTAMA
    // (payload lama) resolve TERAKHIR dan tidak boleh menimpa data baru.
    const newer = { ...dashboardData, generated_at: "2026-11-24T09:20:00+07:00" };
    const older = { ...dashboardData, generated_at: "2026-11-24T09:14:00+07:00" };
    mockedGet.mockResolvedValueOnce(older);
    mockedGet.mockResolvedValueOnce(newer);
    const store = makeStore();

    const first = store.dispatch(fetchDashboard());
    const second = store.dispatch(fetchDashboard());
    await Promise.all([first, second]);

    const state = selectDashboard(store.getState());
    expect(state.generatedAt).toBe("2026-11-24T09:20:00+07:00");
    expect(selectDashboardData(store.getState())).toEqual(newer);
  });

  it("respons dengan generated_at sama tidak menimpa data (idempoten)", async () => {
    mockedGet.mockResolvedValue(dashboardData);
    const store = makeStore();
    await store.dispatch(fetchDashboard());

    await store.dispatch(fetchDashboard());

    const state = selectDashboard(store.getState());
    expect(state.status).toBe("succeeded");
    expect(selectDashboardData(store.getState())).toEqual(dashboardData);
  });
});
