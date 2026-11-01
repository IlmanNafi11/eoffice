/**
 * Unit test store/changePackageSlice (modul change-package).
 * Reducer + thunk diuji dengan mock modul `@/api/change-package` (vi.mock),
 * mengikuti pola `wfhMonitoringSlice.test.ts`. Kontrak yang dijaga:
 * - `fetchPackages` mengisi `list.items` + `list.meta` + filter status aktif
 *   (`list.statusFilter` / `list.page` / `list.perPage`);
 * - `fetchPackage` mengisi `current.data` tanpa menghapus `current.error` saat
 *   pending — refetch pasca-mutasi GAGAL tak boleh melenyapkan pesan 422
 *   (pelajaran `a602c46`, ditegakkan di level slice);
 * - mutasi (create/update/submit/decide/delete) update `current.data` dan
 *   baris list yang cocok, error tersimpan sebagai pesan siap tampil;
 * - `deletePackageThunk` membersihkan `current.data` + baris list;
 * - `uploadAttachmentsThunk` menandai `current.status` (halaman refetch);
 * - `fetchChangeTypes` di-cache — tak refetch bila sudah `succeeded`;
 * - respons fetch basi (out-of-order) dibuang via `latestRequestId` (race).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import type {
  ChangePackage,
  ChangeType,
  PackageDraftInput,
  PackageSubmitInput,
  PaginationMeta,
} from "@/api/types";

vi.mock("@/api/change-package", () => ({
  listPackages: vi.fn(),
  showPackage: vi.fn(),
  createPackage: vi.fn(),
  updatePackage: vi.fn(),
  deletePackage: vi.fn(),
  submitPackage: vi.fn(),
  approvePackage: vi.fn(),
  rejectPackage: vi.fn(),
  uploadPackageAttachments: vi.fn(),
  listChangeTypes: vi.fn(),
}));

import * as changePackageApi from "@/api/change-package";
import {
  fetchPackages,
  fetchPackage,
  createPackageThunk,
  updatePackageThunk,
  deletePackageThunk,
  submitPackageThunk,
  decidePackageThunk,
  uploadAttachmentsThunk,
  fetchChangeTypes,
  selectChangePackageList,
  selectChangePackageListItems,
  selectChangePackageListMeta,
  selectChangePackageListStatusFilter,
  selectChangePackageListPage,
  selectChangePackageCurrent,
  selectChangePackageCurrentData,
  selectChangePackageChangeTypes,
  initialChangePackageState,
} from "@/store/changePackageSlice";
import { makeStore } from "@/store";

const mockedList = changePackageApi.listPackages as unknown as Mock;
const mockedShow = changePackageApi.showPackage as unknown as Mock;
const mockedCreate = changePackageApi.createPackage as unknown as Mock;
const mockedUpdate = changePackageApi.updatePackage as unknown as Mock;
const mockedDelete = changePackageApi.deletePackage as unknown as Mock;
const mockedSubmit = changePackageApi.submitPackage as unknown as Mock;
const mockedApprove = changePackageApi.approvePackage as unknown as Mock;
const mockedReject = changePackageApi.rejectPackage as unknown as Mock;
const mockedUpload = changePackageApi.uploadPackageAttachments as unknown as Mock;
const mockedChangeTypes = changePackageApi.listChangeTypes as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 3, per_page: 15, total: 25 };

const changeType: ChangeType = { id: 2, name: "Network" };

const pkg: ChangePackage = {
  initiation: {
    id: 12,
    field_id: 3,
    initiator_id: 8,
    doc_number: "001/9/1.1/114/2025",
    description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
    reason: "Server on-premise sudah tidak memadai.",
    status: "draft",
  },
  implementation: {
    id: 9,
    change_initiation_id: 12,
    priority: "normal",
    impact: "Minor",
    status: "draft",
  },
};

const submittedPkg: ChangePackage = {
  initiation: { ...pkg.initiation, status: "pending" },
  implementation: { ...(pkg.implementation as object), status: "submitted" } as ChangePackage["implementation"],
};

const draftInput: PackageDraftInput = {
  initiation: { field_id: 3, description: "Migrasi", reason: "Perlu upgrade" },
};

const submitInput: PackageSubmitInput = {
  initiation: {
    field_id: 3,
    needed_by_date: "2025-12-31",
    description: "Migrasi",
    reason: "Perlu upgrade",
  },
  implementation: {
    priority: "normal",
    impact: "Minor",
    change_type_ids: [2],
    test_plan: "Test",
    execution_date: "2025-12-01",
    release_date: "2025-12-15",
    implementation_result: "Selesai",
  },
};

describe("changePackageSlice — initial state", () => {
  it("state awal bersih: list kosong, current null, changeTypes kosong", () => {
    const state = initialChangePackageState();
    expect(state.list.items).toEqual([]);
    expect(state.list.meta).toBeNull();
    expect(state.list.status).toBe("idle");
    expect(state.list.error).toBeNull();
    expect(state.list.statusFilter).toBeNull();
    expect(state.list.page).toBe(1);
    expect(state.list.perPage).toBeNull();
    expect(state.current.data).toBeNull();
    expect(state.current.status).toBe("idle");
    expect(state.current.error).toBeNull();
    expect(state.changeTypes.items).toEqual([]);
    expect(state.changeTypes.status).toBe("idle");
  });
});

describe("changePackageSlice — fetchPackages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi list.items + meta + filter status aktif", async () => {
    mockedList.mockResolvedValueOnce({ packages: [pkg], meta });
    const store = makeStore();

    await store.dispatch(fetchPackages({ status: "draft", page: 2, per_page: 15 }));

    const list = selectChangePackageList(store.getState());
    expect(list.status).toBe("succeeded");
    expect(list.error).toBeNull();
    expect(selectChangePackageListItems(store.getState())).toEqual([pkg]);
    expect(selectChangePackageListMeta(store.getState())).toEqual(meta);
    expect(selectChangePackageListStatusFilter(store.getState())).toBe("draft");
    expect(selectChangePackageListPage(store.getState())).toBe(2);
    expect(mockedList).toHaveBeenCalledWith({ status: "draft", page: 2, per_page: 15 });
  });

  it("query kosong (no filter) → statusFilter null, page 1, perPage null", async () => {
    mockedList.mockResolvedValueOnce({ packages: [pkg], meta });
    const store = makeStore();

    await store.dispatch(fetchPackages({}));

    expect(selectChangePackageListStatusFilter(store.getState())).toBeNull();
    expect(selectChangePackageListPage(store.getState())).toBe(1);
    expect(selectChangePackageList(store.getState()).perPage).toBeNull();
  });

  it("gagal men-set status failed + error siap tampil", async () => {
    mockedList.mockRejectedValueOnce(new Error("422 validation"));
    const store = makeStore();

    await store.dispatch(fetchPackages({}));

    const list = selectChangePackageList(store.getState());
    expect(list.status).toBe("failed");
    expect(list.error).toBe("422 validation");
    expect(list.items).toEqual([]);
  });

  it("respons fetch basi (out-of-order) tidak menimpa hasil terbaru", async () => {
    let resolveSlow!: (value: { packages: ChangePackage[]; meta: PaginationMeta }) => void;
    const slow = new Promise<{ packages: ChangePackage[]; meta: PaginationMeta }>((res) => {
      resolveSlow = res;
    });
    mockedList.mockReturnValueOnce(slow);
    mockedList.mockResolvedValueOnce({ packages: [pkg], meta });
    const store = makeStore();

    const first = store.dispatch(fetchPackages({ page: 2 }));
    const second = store.dispatch(fetchPackages({ page: 1 }));
    await second;
    resolveSlow({ packages: [], meta: { ...meta, current_page: 2 } });
    await first;

    expect(selectChangePackageListMeta(store.getState())?.current_page).toBe(1);
    expect(selectChangePackageListItems(store.getState())).toEqual([pkg]);
  });
});

describe("changePackageSlice — fetchPackage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi current.data", async () => {
    mockedShow.mockResolvedValueOnce(pkg);
    const store = makeStore();

    await store.dispatch(fetchPackage(12));

    expect(selectChangePackageCurrentData(store.getState())).toEqual(pkg);
    expect(selectChangePackageCurrent(store.getState()).status).toBe("succeeded");
    expect(selectChangePackageCurrent(store.getState()).error).toBeNull();
    expect(mockedShow).toHaveBeenCalledWith(12);
  });

  it("gagal men-set status failed + error siap tampil", async () => {
    mockedShow.mockRejectedValueOnce(new Error("This action is unauthorized."));
    const store = makeStore();

    await store.dispatch(fetchPackage(12));

    const current = selectChangePackageCurrent(store.getState());
    expect(current.status).toBe("failed");
    expect(current.error).toBe("This action is unauthorized.");
    expect(current.data).toBeNull();
  });

  it("pending tidak menghapus error — refetch pasca-mutasi gagal tak melenyapkan pesan (a602c46)", async () => {
    // Muat detail dulu, lalu gagalkan mutasi → error tersimpan.
    mockedShow.mockResolvedValueOnce(pkg);
    const store = makeStore();
    await store.dispatch(fetchPackage(12));
    mockedSubmit.mockRejectedValueOnce(new Error("Setidaknya satu lampiran harus diisi."));
    await store.dispatch(submitPackageThunk({ packageId: 12, input: submitInput }));
    expect(selectChangePackageCurrent(store.getState()).error).toBe(
      "Setidaknya satu lampiran harus diisi.",
    );

    // Refetch (pending) TIDAK boleh mengosongkan error sebelum selesai.
    mockedShow.mockResolvedValueOnce(pkg);
    const pending = store.dispatch(fetchPackage(12));
    expect(selectChangePackageCurrent(store.getState()).error).toBe(
      "Setidaknya satu lampiran harus diisi.",
    );
    await pending;
    // Baru setelah fetch sukses, error bersih.
    expect(selectChangePackageCurrent(store.getState()).error).toBeNull();
  });
});

describe("changePackageSlice — mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("createPackageThunk sukses mengisi current.data", async () => {
    mockedCreate.mockResolvedValueOnce(pkg);
    const store = makeStore();

    await store.dispatch(createPackageThunk(draftInput));

    expect(selectChangePackageCurrentData(store.getState())).toEqual(pkg);
    expect(selectChangePackageCurrent(store.getState()).status).toBe("succeeded");
    expect(mockedCreate).toHaveBeenCalledWith(draftInput);
  });

  it("updatePackageThunk sukses update current + baris list yang cocok", async () => {
    mockedList.mockResolvedValueOnce({ packages: [pkg], meta });
    mockedUpdate.mockResolvedValueOnce(submittedPkg);
    const store = makeStore();
    await store.dispatch(fetchPackages({})); // seed list dengan baris lama

    await store.dispatch(updatePackageThunk({ packageId: 12, input: draftInput }));

    expect(selectChangePackageCurrentData(store.getState())).toEqual(submittedPkg);
    expect(selectChangePackageListItems(store.getState())).toEqual([submittedPkg]);
    expect(mockedUpdate).toHaveBeenCalledWith(12, draftInput);
  });

  it("submitPackageThunk + decidePackageThunk(approve|reject) memanggil API yang tepat", async () => {
    mockedSubmit.mockResolvedValueOnce(submittedPkg);
    mockedApprove.mockResolvedValueOnce({ ...submittedPkg, initiation: { ...submittedPkg.initiation, status: "approved" } });
    mockedReject.mockResolvedValueOnce({ ...submittedPkg, initiation: { ...submittedPkg.initiation, status: "rejected" } });
    const store = makeStore();

    await store.dispatch(submitPackageThunk({ packageId: 12, input: submitInput }));
    await store.dispatch(decidePackageThunk({ packageId: 12, approve: true }));
    await store.dispatch(decidePackageThunk({ packageId: 12, approve: false }));

    expect(mockedSubmit).toHaveBeenCalledWith(12, submitInput);
    expect(mockedApprove).toHaveBeenCalledWith(12);
    expect(mockedReject).toHaveBeenCalledWith(12);
    expect(selectChangePackageCurrentData(store.getState())?.initiation.status).toBe("rejected");
  });

  it("mutasi gagal menyimpan error siap tampil", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("This action is unauthorized."));
    const store = makeStore();

    await store.dispatch(submitPackageThunk({ packageId: 12, input: submitInput }));

    expect(selectChangePackageCurrent(store.getState()).status).toBe("failed");
    expect(selectChangePackageCurrent(store.getState()).error).toBe(
      "This action is unauthorized.",
    );
  });

  it("deletePackageThunk sukses membersihkan current + baris list", async () => {
    mockedList.mockResolvedValueOnce({ packages: [pkg], meta });
    mockedShow.mockResolvedValueOnce(pkg);
    mockedDelete.mockResolvedValueOnce("Paket dihapus.");
    const store = makeStore();
    await store.dispatch(fetchPackages({})); // seed list
    await store.dispatch(fetchPackage(12)); // seed current

    await store.dispatch(deletePackageThunk(12));

    expect(selectChangePackageCurrentData(store.getState())).toBeNull();
    expect(selectChangePackageListItems(store.getState())).toEqual([]);
    expect(mockedDelete).toHaveBeenCalledWith(12);
  });

  it("uploadAttachmentsThunk sukses menandai current succeeded (halaman refetch)", async () => {
    mockedUpload.mockResolvedValueOnce([{ id: 1, url: "/attachments/1/download", sort_order: 1 }]);
    const store = makeStore();
    const files = [new File(["x"], "a.txt")];

    await store.dispatch(uploadAttachmentsThunk({ packageId: 12, files }));

    expect(selectChangePackageCurrent(store.getState()).status).toBe("succeeded");
    expect(mockedUpload).toHaveBeenCalledWith(12, files);
  });
});

describe("changePackageSlice — fetchChangeTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sukses mengisi items; kedua dispatch TIDAK refetch (cache)", async () => {
    mockedChangeTypes.mockResolvedValue([changeType]);
    const store = makeStore();

    await store.dispatch(fetchChangeTypes());
    await store.dispatch(fetchChangeTypes());

    expect(selectChangePackageChangeTypes(store.getState()).items).toEqual([changeType]);
    expect(selectChangePackageChangeTypes(store.getState()).status).toBe("succeeded");
    expect(mockedChangeTypes).toHaveBeenCalledTimes(1);
  });

  it("gagal → status failed, dan tetap bisa refetch (belum succeeded)", async () => {
    mockedChangeTypes.mockRejectedValueOnce(new Error("Network error"));
    const store = makeStore();
    await store.dispatch(fetchChangeTypes());
    expect(selectChangePackageChangeTypes(store.getState()).status).toBe("failed");

    mockedChangeTypes.mockResolvedValueOnce([changeType]);
    await store.dispatch(fetchChangeTypes());
    expect(selectChangePackageChangeTypes(store.getState()).items).toEqual([changeType]);
    expect(mockedChangeTypes).toHaveBeenCalledTimes(2);
  });
});