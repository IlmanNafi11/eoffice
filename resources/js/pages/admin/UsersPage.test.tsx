/**
 * Unit test UsersPage (modul admin — Task 4).
 * Kontrak yang dijaga (plan Task 4):
 * - mount → dispatch `fetchUsers` query bersih (halaman 1);
 * - tabel render nama/NIP/email/tim/role/aktif; pagination → fetch halaman
 *   tujuan dengan per_page aktif;
 * - gate permission sintetik (bukan role): tanpa `user.create` tanpa tombol
 *   "Buat User", tanpa `user.import` tanpa "Import", tanpa `user.delete`
 *   tanpa hapus; gate by DATA resource (`can()`), never by role name;
 * - import: file input `.xlsx,.xls,.csv` → panel hasil {imported, skipped,
 *   errors[]}; list di-refresh pasca import sukses;
 * - hapus per baris + confirm dialog; list refresh pasca hapus sukses;
 * - klik baris → navigasi ke `/admin/users/{id}/edit`;
 * - error pasca-mutasi TIDAK lenyap saat refetch (a602c46 di level slice).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider } from "react-redux";
import type { AdminUser, PaginationMeta } from "@/api/types";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/api/admin", () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  importUsers: vi.fn(),
  listRoles: vi.fn(),
  updateRolePermissions: vi.fn(),
  listPermissions: vi.fn(),
  listSettings: vi.fn(),
  updateSetting: vi.fn(),
}));

import * as adminApi from "@/api/admin";
import { UsersPage } from "@/pages/admin/UsersPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedListUsers = adminApi.listUsers as unknown as Mock;
const mockedDelete = adminApi.deleteUser as unknown as Mock;
const mockedImport = adminApi.importUsers as unknown as Mock;

const meta: PaginationMeta = { current_page: 1, last_page: 2, per_page: 15, total: 18 };

const userA: AdminUser = {
  id: 12,
  name: "Dewi Lestari",
  nip: "199503152024011002",
  email: "dewi@kominfo.go.id",
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.report.create"],
  team: { id: 3, name: "Tim Aplikasi", leader: { id: 5, name: "Siti" }, field: { id: 1, name: "Bidang TI" } },
};

const userB: AdminUser = {
  id: 13,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  is_active: false,
  roles: ["kepala_tim"],
  permissions: [],
};

const adminUser = {
  id: 1,
  name: "Admin Utama",
  nip: "198001012023011001",
  email: "admin@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["admin"],
  permissions: ["user.manage", "user.create", "user.update", "user.delete", "user.import"],
};

function renderPageAs(permissions: string[]) {
  const store = makeStore();
  store.dispatch(setUser({ ...adminUser, permissions }));
  mockNavigate.mockClear();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/admin/users"]}>
        <Routes>
          <Route path="/admin/users" element={<UsersPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListUsers.mockResolvedValue({ users: [userA, userB], meta });
});

describe("UsersPage — list & pagination", () => {
  it("mount → fetchUsers query bersih (tanpa params, page 1)", async () => {
    renderPageAs(["user.manage"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());
    expect(mockedListUsers).toHaveBeenCalledWith({});
  });

  it("baris render nama, NIP, email, tim, role, status aktif", async () => {
    renderPageAs(["user.manage"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    const row = screen.getByTestId("user-row-12");
    expect(within(row).getByText("199503152024011002")).toBeTruthy();
    expect(within(row).getByText("dewi@kominfo.go.id")).toBeTruthy();
    expect(within(row).getByText("Tim Aplikasi")).toBeTruthy();
    expect(within(row).getByText("staf")).toBeTruthy();
    expect(within(row).getByText("Aktif")).toBeTruthy();

    const rowB = screen.getByTestId("user-row-13");
    expect(within(rowB).getByText("Nonaktif")).toBeTruthy();
  });

  it("pagination → fetch halaman 2", async () => {
    const u = userEvent.setup();
    renderPageAs(["user.manage"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    await u.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenLastCalledWith({ page: 2 }),
    );
  });
});

describe("UsersPage — permission gates (sintetik, bukan role)", () => {
  it("admin penuh melihat tombol Buat User, Import, hapus per baris", async () => {
    renderPageAs(["user.manage", "user.create", "user.import", "user.delete"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    expect(screen.getByRole("button", { name: /buat user/i })).toBeTruthy();
    expect(screen.getByLabelText(/pilih file import/i)).toBeTruthy();
    expect(screen.getByTestId(`delete-user-12`)).toBeTruthy();
  });

  it("tanpa user.create → tanpa tombol Buat User", async () => {
    renderPageAs(["user.manage", "user.import", "user.delete"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /buat user/i })).toBeNull();
    expect(screen.getByLabelText(/pilih file import/i)).toBeTruthy();
  });

  it("tanpa user.import → tanpa input file import", async () => {
    renderPageAs(["user.manage", "user.create", "user.delete"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());
    expect(screen.queryByLabelText(/pilih file import/i)).toBeNull();
  });

  it("tanpa user.delete → tanpa tombol hapus per baris", async () => {
    renderPageAs(["user.manage", "user.create", "user.import"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());
    expect(screen.queryByTestId("delete-user-12")).toBeNull();
    expect(screen.queryByTestId("delete-user-13")).toBeNull();
  });
});

describe("UsersPage — import", () => {
  it("upload file → importUsers(file) → panel hasil {imported, skipped, errors[]} + list refresh", async () => {
    const u = userEvent.setup();
    mockedImport.mockResolvedValueOnce({
      imported: 3,
      skipped: 1,
      errors: ["Baris 4: NIP 199001012023011001 sudah terdaftar."],
    });
    renderPageAs(["user.manage", "user.import"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    const file = new File(["nip,name"], "users.csv", { type: "text/csv" });
    await u.upload(screen.getByLabelText(/pilih file import/i), file);

    await waitFor(() => expect(mockedImport).toHaveBeenCalledTimes(1));
    expect(mockedImport.mock.calls[0]?.[0]).toBeInstanceOf(File);

    // Panel hasil tersaji.
    await waitFor(() => expect(screen.getByTestId("import-result")).toBeTruthy());
    const panel = screen.getByTestId("import-result");
    expect(within(panel).getByText(/3.*diimpor/i)).toBeTruthy();
    expect(within(panel).getByText(/1.*dilewati/i)).toBeTruthy();
    expect(
      within(panel).getByText("Baris 4: NIP 199001012023011001 sudah terdaftar."),
    ).toBeTruthy();

    // List di-refresh pasca import sukses.
    await waitFor(() =>
      expect(mockedListUsers).toHaveBeenCalledTimes(2),
    );
  });

  it("import gagal (422) → pesan server tersaji; list tidak di-refresh", async () => {
    mockedImport.mockRejectedValueOnce(new Error("Import gagal. Silakan periksa format file."));
    const u = userEvent.setup();
    renderPageAs(["user.manage", "user.import"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    await u.upload(
      screen.getByLabelText(/pilih file import/i),
      new File(["x"], "bad.csv", { type: "text/csv" }),
    );

    await waitFor(() =>
      expect(screen.getByText("Import gagal. Silakan periksa format file.")).toBeTruthy(),
    );
    expect(mockedListUsers).toHaveBeenCalledTimes(1);
  });
});

describe("UsersPage — hapus user", () => {
  it("klik hapus → confirm dialog → deleteUser → list refresh", async () => {
    const u = userEvent.setup();
    mockedDelete.mockResolvedValueOnce("User berhasil dihapus.");
    renderPageAs(["user.manage", "user.delete"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    await u.click(screen.getByTestId("delete-user-13"));
    // Confirm dialog muncul.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();

    await u.click(within(dialog).getByRole("button", { name: /hapus/i }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith(13));
    // List di-refresh pasca hapus sukses.
    await waitFor(() => expect(mockedListUsers).toHaveBeenCalledTimes(2));
  });

  it("hapus gagal → pesan server tampil; user tidak hilang dari list", async () => {
    const u = userEvent.setup();
    mockedDelete.mockRejectedValueOnce(new Error("This action is unauthorized."));
    renderPageAs(["user.manage", "user.delete"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    await u.click(screen.getByTestId("delete-user-13"));
    const dialog = await screen.findByRole("dialog");
    await u.click(within(dialog).getByRole("button", { name: /hapus/i }));

    await waitFor(() =>
      expect(screen.getByText("This action is unauthorized.")).toBeTruthy(),
    );
    expect(screen.getByText("Budi Santoso")).toBeTruthy();
    expect(mockedListUsers).toHaveBeenCalledTimes(1);
  });
});

describe("UsersPage — navigasi edit", () => {
  it("klik baris → navigate ke /admin/users/{id}/edit", async () => {
    const u = userEvent.setup();
    renderPageAs(["user.manage"]);
    await waitFor(() => expect(screen.getByText("Dewi Lestari")).toBeTruthy());

    await u.click(screen.getByTestId("user-row-12"));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/users/12/edit");
  });
});
