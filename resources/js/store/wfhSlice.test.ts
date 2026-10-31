/**
 * Unit test store/wfhSlice (frontend-phase2 — modul wfh-reports).
 * Reducer + thunk diuji dengan mock modul `@/api/wfh` (vi.mock) sehingga tidak
 * ada network, mengikuti pola `authSlice.test.ts`. Kontrak yang dijaga:
 * - status fetch per-domain (`idle | loading | succeeded | failed`);
 * - `fetchWfhReports` mengisi `list.items` + `list.meta` + `list.query`;
 * - `fetchWfhReport` mengisi `current.report`;
 * - mutasi transisi/metadata meng-update `current.report` DAN baris di
 *   `list.items` secara konsisten (tanpa kehilangan posisi);
 * - `setListQuery` mengubah filter tanpa menjalankan fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
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
import {
  wfhReducer,
  fetchWfhReports,
  fetchWfhReport,
  submitWfhReport,
  approveWfhReport,
  rejectWfhReport,
  reviseWfhReport,
  updateWfhReportMetadata,
  deleteWfhReport,
  setListQuery,
  selectWfhList,
  selectWfhListItems,
  selectWfhListMeta,
  selectWfhListQuery,
  selectWfhCurrent,
  selectWfhCurrentReport,
} from "@/store/wfhSlice";
import { makeStore } from "@/store";

const mockedList = wfhApi.listWfhReports as unknown as Mock;
const mockedGet = wfhApi.getWfhReport as unknown as Mock;
const mockedSubmit = wfhApi.submitWfhReport as unknown as Mock;
const mockedApprove = wfhApi.approveWfhReport as unknown as Mock;
const mockedReject = wfhApi.rejectWfhReport as unknown as Mock;
const mockedRevise = wfhApi.reviseWfhReport as unknown as Mock;
const mockedMetadata = wfhApi.updateWfhReportMetadata as unknown as Mock;
const mockedDelete = wfhApi.deleteWfhReport as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 10, total: 12 };

const reportPending: WfhReport = {
  id: 1,
  user_id: 10,
  report_date: "2025-07-11",
  status: "pending",
  activity_count: 2,
};

const reportDraft: WfhReport = {
  id: 2,
  user_id: 10,
  report_date: "2025-07-12",
  status: "draft",
};

const seeded = () => wfhReducer(undefined, { type: "@@INIT" });

describe("wfhSlice — reducers", () => {
  it("state awal bersih: list kosong, current report null, status idle", () => {
    const state = seeded();
    expect(state.list.items).toEqual([]);
    expect(state.list.meta).toBeNull();
    expect(state.list.query).toEqual({});
    expect(state.list.status).toBe("idle");
    expect(state.list.error).toBeNull();
    expect(state.current.report).toBeNull();
    expect(state.current.status).toBe("idle");
    expect(state.current.error).toBeNull();
  });

  it("setListQuery mengubah query tanpa menyentuh items/status", () => {
    let state = seeded();
    state = wfhReducer(state, setListQuery({ month: "2025-07" }));
    expect(state.list.query).toEqual({ month: "2025-07" });
    expect(state.list.items).toEqual([]);
    expect(state.list.status).toBe("idle");
  });
});

describe("wfhSlice — thunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchWfhReports sukses mengisi items + meta + query", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending, reportDraft], meta });
    const store = makeStore();

    await store.dispatch(fetchWfhReports({ month: "2025-07" }));

    const list = selectWfhList(store.getState());
    expect(list.status).toBe("succeeded");
    expect(list.error).toBeNull();
    expect(selectWfhListItems(store.getState())).toEqual([reportPending, reportDraft]);
    expect(selectWfhListMeta(store.getState())).toEqual(meta);
    expect(selectWfhListQuery(store.getState())).toEqual({ month: "2025-07" });
  });

  it("fetchWfhReports gagal men-set status failed + error, items tetap kosong", async () => {
    mockedList.mockRejectedValueOnce(new Error("Server sibuk"));
    const store = makeStore();

    await store.dispatch(fetchWfhReports({}));

    const list = selectWfhList(store.getState());
    expect(list.status).toBe("failed");
    expect(list.error).toBe("Server sibuk");
    expect(list.items).toEqual([]);
  });

  it("fetchWfhReport sukses mengisi current.report", async () => {
    const detail: WfhReport = { ...reportPending, activities: [], attendances: [] };
    mockedGet.mockResolvedValueOnce(detail);
    const store = makeStore();

    await store.dispatch(fetchWfhReport(1));

    const current = selectWfhCurrent(store.getState());
    expect(current.status).toBe("succeeded");
    expect(current.error).toBeNull();
    expect(selectWfhCurrentReport(store.getState())).toEqual(detail);
  });

  it("fetchWfhReport gagal men-set current failed + error", async () => {
    mockedGet.mockRejectedValueOnce(new Error("404"));
    const store = makeStore();

    await store.dispatch(fetchWfhReport(999));

    const current = selectWfhCurrent(store.getState());
    expect(current.status).toBe("failed");
    expect(current.error).toBe("404");
    expect(current.report).toBeNull();
  });

  it("submit sukses meng-update current.report dan baris di list (konsisten)", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending, reportDraft], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhReports({}));

    mockedGet.mockResolvedValueOnce(reportPending);
    await store.dispatch(fetchWfhReport(1));

    const submitted: WfhReport = { ...reportPending, status: "approved" };
    mockedSubmit.mockResolvedValueOnce(submitted);
    await store.dispatch(submitWfhReport(1));

    expect(selectWfhCurrentReport(store.getState())).toEqual(submitted);
    const items = selectWfhListItems(store.getState());
    expect(items.find((r) => r.id === 1)?.status).toBe("approved");
    expect(items.map((r) => r.id)).toEqual([1, 2]); // posisi tidak berubah
  });

  it("approve sukses mengganti laporan lain di current tanpa menyentuh list item yang tak ada", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportDraft], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhReports({}));
    mockedGet.mockResolvedValueOnce(reportDraft);
    await store.dispatch(fetchWfhReport(2));

    // current = report #2, list hanya berisi report #2.
    const approved: WfhReport = { ...reportDraft, status: "approved" };
    mockedApprove.mockResolvedValueOnce(approved);
    await store.dispatch(approveWfhReport(2));

    expect(selectWfhCurrentReport(store.getState())).toEqual(approved);
    expect(selectWfhListItems(store.getState()).find((r) => r.id === 2)?.status).toBe("approved");
  });

  it("reject sukses mencatat status rejected + reason pada current", async () => {
    mockedGet.mockResolvedValueOnce(reportPending);
    const store = makeStore();
    await store.dispatch(fetchWfhReport(1));

    const rejected: WfhReport = { ...reportPending, status: "rejected", reject_reason: "Tanggal salah" };
    mockedReject.mockResolvedValueOnce(rejected);
    await store.dispatch(rejectWfhReport({ reportId: 1, reason: "Tanggal salah" }));

    expect(mockedReject).toHaveBeenCalledWith(1, "Tanggal salah");
    expect(selectWfhCurrentReport(store.getState())).toEqual(rejected);
  });

  it("revise sukses mengembalikan current ke status draft", async () => {
    const rejected: WfhReport = { ...reportPending, status: "rejected" };
    mockedList.mockResolvedValueOnce({ reports: [rejected], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhReports({}));
    mockedGet.mockResolvedValueOnce(rejected);
    await store.dispatch(fetchWfhReport(1));

    const revised: WfhReport = { ...rejected, status: "draft" };
    mockedRevise.mockResolvedValueOnce(revised);
    await store.dispatch(reviseWfhReport(1));

    expect(selectWfhCurrentReport(store.getState())?.status).toBe("draft");
    expect(selectWfhListItems(store.getState()).find((r) => r.id === 1)?.status).toBe("draft");
  });

  it("update metadata sukses mengganti report_date tanpa mengubah status", async () => {
    mockedGet.mockResolvedValueOnce(reportDraft);
    const store = makeStore();
    await store.dispatch(fetchWfhReport(2));

    const updated: WfhReport = { ...reportDraft, report_date: "2025-07-13" };
    mockedMetadata.mockResolvedValueOnce(updated);
    await store.dispatch(updateWfhReportMetadata({ reportId: 2, reportDate: "2025-07-13" }));

    expect(mockedMetadata).toHaveBeenCalledWith(2, "2025-07-13");
    const current = selectWfhCurrentReport(store.getState());
    expect(current?.report_date).toBe("2025-07-13");
    expect(current?.status).toBe("draft");
  });

  it("delete sukses menghapus report dari list dan membersihkan current yang cocok", async () => {
    mockedList.mockResolvedValueOnce({ reports: [reportPending, reportDraft], meta });
    const store = makeStore();
    await store.dispatch(fetchWfhReports({}));
    mockedGet.mockResolvedValueOnce(reportPending);
    await store.dispatch(fetchWfhReport(1));

    mockedDelete.mockResolvedValueOnce("Laporan dihapus");
    await store.dispatch(deleteWfhReport(1));

    expect(selectWfhCurrentReport(store.getState())).toBeNull();
    expect(selectWfhListItems(store.getState()).map((r) => r.id)).toEqual([2]);
  });

  it("mutasi gagal men-set current failed + error dan membiarkan report lama", async () => {
    mockedGet.mockResolvedValueOnce(reportPending);
    const store = makeStore();
    await store.dispatch(fetchWfhReport(1));

    mockedSubmit.mockRejectedValueOnce(new Error("Forbidden"));
    await store.dispatch(submitWfhReport(1));

    const current = selectWfhCurrent(store.getState());
    expect(current.status).toBe("failed");
    expect(current.error).toBe("Forbidden");
    expect(current.report).toEqual(reportPending); // tidak terkorupsi
  });
});