/**
 * Unit test ChangesPage (modul change-package — Phase 3 Task 4).
 * Kontrak yang dijaga (plan Task 4 + spec):
 * - mount → dispatch `fetchPackages` dengan query bersih (halaman 1);
 * - baris render `doc_number`, deskripsi, inisiator, bidang, badge status via
 *   `WfhStatusBadge` (union status sama — satu sumber label);
 * - filter status lokal sampai "Terapkan" → fetch `{status, page: 1}`;
 *   kosong → fetch TANPA `status` (reset);
 * - pagination → fetch halaman tujuan dengan filter aktif dipertahankan;
 * - "Terapkan" setelah pindah halaman → kembali ke halaman 1;
 * - tombol "Buat Paket" digate `can(user, "change.initiation.create")` +
 *   `user.team.field` terisi (Resolved #2 — admin tanpa tim tak melihat);
 *   klik → navigasi `/changes/new`;
 * - klik baris → navigasi `/changes/:packageId`;
 * - list kosong → empty state bahasa Indonesia; fetch gagal → pesan error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ChangePackage, PaginationMeta } from "@/api/types";

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
  exportInitiationPdf: vi.fn(),
  exportImplementationPdf: vi.fn(),
  listChangeTypes: vi.fn(),
}));

import * as changePackageApi from "@/api/change-package";
import { ChangesPage } from "@/pages/changes/ChangesPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedList = changePackageApi.listPackages as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 3, per_page: 15, total: 25 };

const pkgA: ChangePackage = {
  initiation: {
    id: 12,
    field_id: 3,
    initiator_id: 8,
    doc_number: "001/9/1.1/114/2025",
    description: "Migrasi server aplikasi e-Office ke cloud Kominfo",
    reason: "Server on-premise sudah tidak memadai.",
    status: "draft",
    field: { id: 3, name: "Bidang Aplikasi" },
    initiator: { id: 8, name: "Budi Santoso", nip: "199001012023011001" },
  },
  implementation: null,
};

const pkgB: ChangePackage = {
  initiation: {
    ...pkgA.initiation,
    id: 13,
    initiator_id: 9,
    doc_number: "002/9/1.1/114/2025",
    description: "Penggantian perangkat jaringan edge",
    status: "pending",
    field: { id: 3, name: "Bidang Aplikasi" },
    initiator: { id: 9, name: "Siti Aminah", nip: "198001012023011002" },
  },
  implementation: null,
};

/** Staf pembuat paket: punya `create` + tim dengan bidang (sumber field_id). */
const staf = {
  id: 8,
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
  permissions: ["change.initiation.view", "change.initiation.create"],
  team: { id: 5, name: "Tim Aplikasi", field: { id: 3, name: "Bidang Aplikasi" } },
};

/** renderPage dengan user khusus (default: staf pembuat paket). */
function renderPageAs(overrides?: Partial<typeof staf>) {
  const store = makeStore();
  store.dispatch(setUser({ ...staf, ...overrides }));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/changes"]}>
        <Routes>
          <Route path="/changes" element={<ChangesPage />} />
          <Route path="/changes/new" element={<div>changes-form-stub</div>} />
          <Route path="/changes/:packageId" element={<div>changes-detail-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

function renderPage() {
  return renderPageAs();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedList.mockResolvedValue({ packages: [pkgA, pkgB], meta });
});

describe("ChangesPage — fetch awal & render", () => {
  it("mount mem-fetch daftar dengan query bersih dan menampilkan baris", async () => {
    renderPage();

    await waitFor(() => {
      expect(mockedList).toHaveBeenCalledTimes(1);
    });
    // Query bersih: tanpa status/page/per_page (default 15 tak dikirim).
    expect(mockedList).toHaveBeenCalledWith({});

    // Baris tabel: doc_number, inisiator, bidang, badge status.
    await screen.findByText("001/9/1.1/114/2025");
    expect(screen.getByText("002/9/1.1/114/2025")).toBeTruthy();
    expect(screen.getByText("Migrasi server aplikasi e-Office ke cloud Kominfo")).toBeTruthy();
    expect(screen.getByText("Budi Santoso")).toBeTruthy();
    // "Bidang Aplikasi" juga ada di filter select user → cek dalam baris.
    expect(screen.getByTestId("change-package-row-12").textContent).toContain("Bidang Aplikasi");
    // Badge status: label "Draf"/"pending" juga muncul di select filter, jadi
    // di-scope ke badge itu sendiri (satu sumber label Indonesia).
    const badges = screen.getAllByTestId("wfh-status-badge");
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.textContent)).toEqual(["Draf", "Menunggu persetujuan"]);
  });

  it("klik baris → navigasi ke /changes/:packageId", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByText("001/9/1.1/114/2025"));

    expect(await screen.findByText("changes-detail-stub")).toBeTruthy();
  });

  it("list kosong → empty state bahasa Indonesia, tanpa tabel", async () => {
    mockedList.mockResolvedValueOnce({ packages: [], meta: { ...meta, total: 0, last_page: 1 } });
    renderPage();

    expect(await screen.findByText(/belum ada paket perubahan/i)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("fetch gagal → pesan error tampil", async () => {
    mockedList.mockRejectedValueOnce(new Error("Server sibuk"));
    renderPage();

    expect(await screen.findByText("Server sibuk")).toBeTruthy();
  });
});

describe("ChangesPage — tombol Buat Paket (gate create + tim, Resolved #2)", () => {
  it("staf pemegang create dengan tim → tombol tampil; klik → /changes/new", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /buat paket/i }));

    expect(await screen.findByText("changes-form-stub")).toBeTruthy();
  });

  it("pemegang view tanpa create → tombol tak dirender", async () => {
    renderPageAs({
      id: 9,
      permissions: ["change.initiation.view"],
      team: { id: 5, name: "Tim Aplikasi", field: { id: 3, name: "Bidang Aplikasi" } },
    });
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("button", { name: /buat paket/i })).toBeNull();
  });

  it("pemegang create tanpa tim/bidang (admin) → tombol tak dirender", async () => {
    renderPageAs({
      roles: ["admin"],
      team: undefined,
    });
    await screen.findByText("001/9/1.1/114/2025");

    expect(screen.queryByRole("button", { name: /buat paket/i })).toBeNull();
  });
});

describe("ChangesPage — filter & paginate", () => {
  it("filter status + Terapkan → fetch {status, page: 1}", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");
    mockedList.mockClear();

    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 1 });
    });
  });

  it("Terapkan tanpa filter → fetch tanpa status (reset)", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it("pagination mempertahankan filter aktif; Terapkan kembali ke halaman 1", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");

    // 1. Terapkan filter status pending.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "pending" } });
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 1 });
    });

    // 2. Pagination halaman 2 — filter dipertahankan.
    await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 2 });
    });

    // 3. Terapkan lagi → reset ke halaman 1.
    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ status: "pending", page: 1 });
    });
  });

  it("Terapkan setelah pindah halaman tanpa filter → reset bersih ke halaman 1", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");

    await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));
    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ page: 2 });
    });

    await userEvent.click(screen.getByRole("button", { name: /terapkan/i }));
    await waitFor(() => {
      // Bukan gabungan query lama ({page: 2}) — reset bersih ke halaman 1.
      expect(mockedList).toHaveBeenLastCalledWith({ page: 1 });
    });
  });

  it("ubah per halaman → fetch dengan per_page, kembali ke halaman 1", async () => {
    renderPage();
    await screen.findByText("001/9/1.1/114/2025");
    mockedList.mockClear();

    await userEvent.selectOptions(screen.getByLabelText("Per halaman"), "25");

    await waitFor(() => {
      expect(mockedList).toHaveBeenLastCalledWith({ per_page: 25, page: 1 });
    });
  });
});
