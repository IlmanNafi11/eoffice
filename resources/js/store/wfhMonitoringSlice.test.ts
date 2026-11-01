/**
 * Unit test store/wfhMonitoringSlice (modul wfh-monitoring).
 * Reducer + thunk diuji dengan mock modul `@/api/wfh-monitoring` (vi.mock),
 * mengikuti pola `wfhTeamSlice.test.ts`. Kontrak yang dijaga:
 * - `fetchWfhBoard` mengisi `board.data` + `board.query` (tanggal + team);
 * - `fetchAdminReports` mengisi `list.items` + `list.meta` + `list.query`
 *   (filter status/tim/tanggal + pagination);
 * - pagination mempertahankan filter aktif (`setListQuery` merge, `page`
 *   hanya menambah tanpa menghapus filter lain);
 * - respons basi (out-of-order) dibuang via `latestRequestId` (race);
 * - error fetch tersimpan sebagai pesan siap tampil (string `message`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type {
  MonitoringUser,
  PaginationMeta,
  WfhMonitoringData,
  WfhReport,
} from "@/api/types";

vi.mock("@/api/wfh-monitoring", () => ({
  getWfhMonitoring: vi.fn(),
  adminListWfhReports: vi.fn(),
}));

import * as wfhMonitoringApi from "@/api/wfh-monitoring";
import {
  wfhMonitoringReducer,
  fetchWfhBoard,
  fetchAdminReports,
  setBoardQuery,
  setListQuery,
  selectWfhMonitoringBoard,
  selectWfhMonitoringBoardData,
  selectWfhMonitoringList,
  selectWfhMonitoringListItems,
  selectWfhMonitoringListMeta,
  selectWfhMonitoringListQuery,
} from "@/store/wfhMonitoringSlice";
import { makeStore } from "@/store";

const mockedBoard = wfhMonitoringApi.getWfhMonitoring as unknown as Mock;
const mockedList = wfhMonitoringApi.adminListWfhReports as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 3, per_page: 15, total: 25 };

const userA: MonitoringUser = {
  id: 1,
  name: "Andi",
  nip: "12345",
  email: "andi@example.com",
  is_active: true,
  team_id: 3,
  team: { id: 3, name: "Tim A" },
};

const userB: MonitoringUser = {
  id: 2,
  name: "Budi",
  nip: "67890",
  email: "budi@example.com",
  is_active: true,
  team_id: null,
  team: null,
};

const boardData: WfhMonitoringData = {
  date: "2025-07-11",
  team_id: null,
  field_id: null,
  not_checked_in: [userA],
  no_report: [userB],
};

const reportRow: WfhReport = {
  id: 11,
  user_id: 1,
  report_date: "2025-07-11",
  status: "approved",
  user: null,
  supervisor: null,
};

const seeded = () => wfhMonitoringReducer(undefined, { type: "@@INIT" });

describe("wfhMonitoringSlice — initial state", () => {
  it("state awal bersih: board null, list kosong, status idle, error null", () => {
    const state = seeded();
    expect(state.board.data).toBeNull();
    expect(state.board.status).toBe("idle");
    expect(state.board.error).toBeNull();
    expect(state.board.query).toEqual({});
    expect(state.list.items).toEqual([]);
    expect(state.list.meta).toBeNull();
    expect(state.list.status).toBe("idle");
    expect(state.list.error).toBeNull();
    expect(state.list.query).toEqual({});
  });
});

describe("wfhMonitoringSlice — fetchWfhBoard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi board.data + query aktif (tanggal + team)", async () => {
    mockedBoard.mockResolvedValueOnce(boardData);
    const store = makeStore();

    await store.dispatch(fetchWfhBoard({ date: "2025-07-11", team_id: 3 }));

    const board = selectWfhMonitoringBoard(store.getState());
    expect(board.status).toBe("succeeded");
    expect(board.error).toBeNull();
    expect(selectWfhMonitoringBoardData(store.getState())).toEqual(boardData);
    expect(board.query).toEqual({ date: "2025-07-11", team_id: 3 });
    expect(mockedBoard).toHaveBeenCalledWith({ date: "2025-07-11", team_id: 3 });

  });

  it("gagal men-set status failed + error siap tampil", async () => {
    mockedBoard.mockRejectedValueOnce(new Error("This action is unauthorized."));
    const store = makeStore();
    await store.dispatch(fetchWfhBoard({}));

    const board = selectWfhMonitoringBoard(store.getState());
    expect(board.status).toBe("failed");
    expect(board.error).toBe("This action is unauthorized.");
    expect(board.data).toBeNull();
  });
});

describe("wfhMonitoringSlice — fetchAdminReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi list.items + meta + query dengan filter", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportRow], meta });
    const store = makeStore();

    await store.dispatch(fetchAdminReports({ page: 2, per_page: 15, status: "approved" }));

    const list = selectWfhMonitoringList(store.getState());
    expect(list.status).toBe("succeeded");
    expect(list.error).toBeNull();
    expect(selectWfhMonitoringListItems(store.getState())).toEqual([reportRow]);
    expect(selectWfhMonitoringListMeta(store.getState())).toEqual(meta);
    expect(selectWfhMonitoringListQuery(store.getState())).toEqual({
      page: 2,
      per_page: 15,
      status: "approved",
    });
  });

  it("pending mengganti query penuh (bukan merge) — arg dispatch adalah query final", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportRow], meta });
    const store = makeStore();

    await store.dispatch(fetchAdminReports({ status: "approved", team_id: 3, page: 2 }));

    expect(selectWfhMonitoringListQuery(store.getState())).toEqual({
      status: "approved",
      team_id: 3,
      page: 2,
    });
  });

  it("filter yang dikosongkan tidak bocor ke dispatch berikutnya (regresi H1)", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportRow], meta });
    mockedList.mockResolvedValueOnce({ reports: [reportRow], meta });
    const store = makeStore();

    // 1. filter tanggal dulu…
    await store.dispatch(fetchAdminReports({ date: "2026-07-10", page: 1 }));
    // 2. lalu ganti ke filter bulan (tanggal dikosongkan)…
    await store.dispatch(fetchAdminReports({ month: "2026-07", page: 1 }));

    // `date` yang sudah dikosongkan HARUS hilang, bukan terbawa stale.
    expect(selectWfhMonitoringListQuery(store.getState())).toEqual({
      month: "2026-07",
      page: 1,
    });
  });

  it("gagal men-set status failed + error siap tampil", async () => {
    mockedList.mockRejectedValueOnce(new Error("422 validation"));
    const store = makeStore();

    await store.dispatch(fetchAdminReports({}));

    const list = selectWfhMonitoringList(store.getState());
    expect(list.status).toBe("failed");
    expect(list.error).toBe("422 validation");
    expect(list.items).toEqual([]);
  });

  it("respons fetch basi (out-of-order) tidak menimpa hasil terbaru", async () => {
    let resolveSlow!: (value: { reports: WfhReport[]; meta: PaginationMeta }) => void;
    const slow = new Promise<{ reports: WfhReport[]; meta: PaginationMeta }>((res) => {
      resolveSlow = res;
    });
    mockedList.mockReturnValueOnce(slow);
    mockedList.mockResolvedValueOnce({ reports: [reportRow], meta });
    const store = makeStore();

    const first = store.dispatch(fetchAdminReports({ page: 2 }));
    const second = store.dispatch(fetchAdminReports({ page: 1 }));
    await second;
    resolveSlow({ reports: [], meta: { ...meta, current_page: 2 } });
    await first;

    // Yang menang: dispatch TERAKHIR (halaman 1), bukan resolver terakhir.
    expect(selectWfhMonitoringListMeta(store.getState())?.current_page).toBe(1);
    expect(selectWfhMonitoringListItems(store.getState())).toEqual([reportRow]);
  });
});

describe("wfhMonitoringSlice — filters", () => {
  it("setBoardQuery mengganti query tanggal tanpa menyentuh data", () => {
    const state = wfhMonitoringReducer(
      {
        ...seeded(),
        board: { ...seeded().board, data: boardData, query: { date: "2025-07-11" } },
      },
      setBoardQuery({ team_id: 4 }),
    );
    expect(state.board.query).toEqual({ date: "2025-07-11", team_id: 4 });
    expect(state.board.data).toEqual(boardData);
  });

  it("setListQuery MENGGANTI seluruh query — kunci lama yang tak dikirim ulang hilang", () => {
    const state = wfhMonitoringReducer(
      {
        ...seeded(),
        list: { ...seeded().list, query: { status: "approved", team_id: 3, page: 2 } },
      },
      setListQuery({ page: 1 }),
    );
    // status/team_id basi tidak boleh terbawa.
    expect(state.list.query).toEqual({ page: 1 });
  });
});