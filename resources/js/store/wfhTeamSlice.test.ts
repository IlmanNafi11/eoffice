/**
 * Unit test store/wfhTeamSlice (modul wfh-team-reports).
 * Reducer + thunk diuji dengan mock modul `@/api/wfh-team` (vi.mock),
 * mengikuti pola `wfhSlice.test.ts`. Kontrak yang dijaga:
 * - `fetchWfhTeamReports` mengisi `list.items` + `list.meta` + `list.query`;
 * - mutasi create/approve/reject fulfilled → baris list di-update + daftar
 *   di-refetch dengan query aktif (sumber kebenaran = server);
 * - mutasi rejected → `list.actionError` tampil dan TIDAK dihapus refetch
 *   berikutnya (regresi `a602c46`: refetch tak boleh menyapu pesan 403/422);
 * - mutasi gagal TIDAK memicu refetch (akar bug `a602c46`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type { PaginationMeta, WfhTeamReport } from "@/api/types";

vi.mock("@/api/wfh-team", () => ({
  listWfhTeamReports: vi.fn(),
  createWfhTeamReport: vi.fn(),
  approveWfhTeamReport: vi.fn(),
  rejectWfhTeamReport: vi.fn(),
}));

import * as wfhTeamApi from "@/api/wfh-team";
import {
  wfhTeamReducer,
  fetchWfhTeamReports,
  createWfhTeamReport,
  approveWfhTeamReport,
  rejectWfhTeamReport,
  selectWfhTeamList,
  selectWfhTeamListItems,
  selectWfhTeamListMeta,
  selectWfhTeamListQuery,
  selectWfhTeamActionError,
} from "@/store/wfhTeamSlice";
import { makeStore } from "@/store";

const mockedList = wfhTeamApi.listWfhTeamReports as unknown as Mock;
const mockedCreate = wfhTeamApi.createWfhTeamReport as unknown as Mock;
const mockedApprove = wfhTeamApi.approveWfhTeamReport as unknown as Mock;
const mockedReject = wfhTeamApi.rejectWfhTeamReport as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 10, total: 12 };

const reportPending: WfhTeamReport = {
  id: 1,
  team_id: 3,
  report_date: "2025-07-11",
  status: "pending",
  created_by: 7,
};

const reportSecond: WfhTeamReport = {
  id: 2,
  team_id: 4,
  report_date: "2025-07-12",
  status: "approved",
  created_by: 7,
};

const seeded = () => wfhTeamReducer(undefined, { type: "@@INIT" });

describe("wfhTeamSlice — initial state", () => {
  it("state awal bersih: list kosong, meta null, error null, status idle", () => {
    const state = seeded();
    expect(state.list.items).toEqual([]);
    expect(state.list.meta).toBeNull();
    expect(state.list.query).toEqual({});
    expect(state.list.status).toBe("idle");
    expect(state.list.error).toBeNull();
    expect(state.list.actionError).toBeNull();
  });
});

describe("wfhTeamSlice — fetch list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchWfhTeamReports sukses mengisi items + meta + query aktif", async () => {
    mockedList.mockResolvedValueOnce({
      reports: [reportPending, reportSecond],
      meta,
    });
    const store = makeStore();

    await store.dispatch(fetchWfhTeamReports({ page: 2, per_page: 10 }));

    const list = selectWfhTeamList(store.getState());
    expect(list.status).toBe("succeeded");
    expect(list.error).toBeNull();
    expect(selectWfhTeamListItems(store.getState())).toEqual([reportPending, reportSecond]);
    expect(selectWfhTeamListMeta(store.getState())).toEqual(meta);
    expect(selectWfhTeamListQuery(store.getState())).toEqual({ page: 2, per_page: 10 });
  });

  it("fetchWfhTeamReports gagal men-set status failed + error", async () => {
    mockedList.mockRejectedValueOnce(new Error("This action is unauthorized."));
    const store = makeStore();

    await store.dispatch(fetchWfhTeamReports({}));

    const list = selectWfhTeamList(store.getState());
    expect(list.status).toBe("failed");
    expect(list.error).toBe("This action is unauthorized.");
    expect(list.items).toEqual([]);
  });

  it("respons fetch basi (out-of-order) tidak menimpa hasil terbaru", async () => {
    let resolveSlow!: (value: { reports: WfhTeamReport[]; meta: PaginationMeta }) => void;
    const slow = new Promise<{ reports: WfhTeamReport[]; meta: PaginationMeta }>((res) => {
      resolveSlow = res;
    });
    mockedList.mockReturnValueOnce(slow);
    mockedList.mockResolvedValueOnce({ reports: [reportPending], meta });
    const store = makeStore();

    const first = store.dispatch(fetchWfhTeamReports({ page: 2 }));
    const second = store.dispatch(fetchWfhTeamReports({ page: 1 }));
    await second;
    resolveSlow({ reports: [reportSecond], meta: { ...meta, current_page: 2 } });
    await first;

    // Yang menang: dispatch TERAKHIR (halaman 1), bukan resolver terakhir.
    expect(selectWfhTeamListMeta(store.getState())?.current_page).toBe(1);
    expect(selectWfhTeamListItems(store.getState())).toEqual([reportPending]);
  });
});

describe("wfhTeamSlice — mutasi create/approve/reject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approve fulfilled meng-update baris di list dan memicu refetch dengan query aktif", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending, reportSecond], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({ page: 2, per_page: 10 }));

    const approved: WfhTeamReport = { ...reportPending, status: "approved" };
    mockedApprove.mockResolvedValueOnce(approved);
    // Refetch pasca-mutasi membalas daftar baru dari server.
    mockedList.mockResolvedValueOnce({
      reports: [approved, reportSecond],
      meta: { ...meta, current_page: 2 },
    });

    await store.dispatch(approveWfhTeamReport(1));

    expect(mockedApprove).toHaveBeenCalledWith(1);
    // Refetch dipanggil dengan query aktif (page 2), bukan reset ke halaman 1.
    expect(mockedList).toHaveBeenLastCalledWith({ page: 2, per_page: 10 });
    const items = selectWfhTeamListItems(store.getState());
    expect(items.find((r) => r.id === 1)?.status).toBe("approved");
  });

  it("reject fulfilled mengirim alasan dan meng-update baris", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({}));

    const rejected: WfhTeamReport = {
      ...reportPending,
      status: "rejected",
      reject_reason: "Data tidak lengkap",
    };
    mockedReject.mockResolvedValueOnce(rejected);
    mockedList.mockResolvedValueOnce({ reports: [rejected], meta });

    await store.dispatch(rejectWfhTeamReport({ teamReportId: 1, reason: "Data tidak lengkap" }));

    expect(mockedReject).toHaveBeenCalledWith(1, "Data tidak lengkap");
    expect(selectWfhTeamListItems(store.getState())[0]?.status).toBe("rejected");
  });

  it("create fulfilled memicu refetch; baris baru datang dari server", async () => {
    mockedList.mockResolvedValueOnce({ reports: [], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({}));

    const created: WfhTeamReport = { ...reportPending, id: 9 };
    mockedCreate.mockResolvedValueOnce(created);
    mockedList.mockResolvedValueOnce({ reports: [created], meta });

    await store.dispatch(createWfhTeamReport({ team_id: 3, report_date: "2025-07-11" }));

    expect(mockedCreate).toHaveBeenCalledWith({ team_id: 3, report_date: "2025-07-11" });
    expect(mockedList).toHaveBeenCalledTimes(2);
    expect(selectWfhTeamListItems(store.getState())).toEqual([created]);
  });

  it("mutasi rejected men-set actionError dan TIDAK memicu refetch (akar a602c46)", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({}));

    mockedApprove.mockRejectedValueOnce(new Error("Laporan tidak berada dalam bidang Anda."));
    await store.dispatch(approveWfhTeamReport(1));

    expect(mockedList).toHaveBeenCalledTimes(1); // hanya fetch awal — tak ada refetch
    expect(selectWfhTeamActionError(store.getState())).toBe(
      "Laporan tidak berada dalam bidang Anda.",
    );
    // Baris lama tidak terkorupsi.
    expect(selectWfhTeamListItems(store.getState())[0]?.status).toBe("pending");
  });

  it("REGRESI a602c46: refetch list berikutnya TIDAK menghapus actionError", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({}));

    mockedApprove.mockRejectedValueOnce(new Error("This action is unauthorized."));
    await store.dispatch(approveWfhTeamReport(1));
    expect(selectWfhTeamActionError(store.getState())).toBe("This action is unauthorized.");

    // Pengguna paginate → refetch sukses — pesan mutasi harus tetap tampil.
    mockedList.mockResolvedValueOnce({
      reports: [reportPending],
      meta: { ...meta, current_page: 2 },
    });
    await store.dispatch(fetchWfhTeamReports({ page: 2 }));

    const list = selectWfhTeamList(store.getState());
    expect(list.status).toBe("succeeded");
    expect(list.error).toBeNull(); // error fetch bersih
    expect(list.actionError).toBe("This action is unauthorized."); // pesan mutasi selamat
  });

  it("mutasi berikutnya yang sukses membersihkan actionError lama", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhTeamReports({}));

    mockedApprove.mockRejectedValueOnce(new Error("Gagal"));
    await store.dispatch(approveWfhTeamReport(1));
    expect(selectWfhTeamActionError(store.getState())).toBe("Gagal");

    const approved: WfhTeamReport = { ...reportPending, status: "approved" };
    mockedApprove.mockResolvedValueOnce(approved);
    mockedList.mockResolvedValueOnce({ reports: [approved], meta });
    await store.dispatch(approveWfhTeamReport(1));

    expect(selectWfhTeamActionError(store.getState())).toBeNull();
  });
});