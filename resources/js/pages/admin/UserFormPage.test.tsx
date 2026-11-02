/**
 * Unit test UserFormPage (modul admin — Task 5).
 * Kontrak yang dijaga (plan Task 5 + spec):
 * - satu file untuk create `/admin/users/new` + edit `/admin/users/:userId/edit`
 *   (edit prefill via `getUserById`);
 * - field: NIP/nama/email wajib + format email; tim dropdown `listTeams`
 *   (pinjaman, tanpa `field_id`); role checkbox 4 nama kontrak; password
 *   (create; kosong = default server + hint tersaji); direct permissions
 *   multi-select dari cache `listPermissions` (Resolved #3; prefill gabungan +
 *   hint Open Question #1); toggle `is_active` edit-saja;
 * - gate: create → `user.create`, edit → `user.update` (tombol hilang bila
 *   permission dipangkas — permission sintetik, bukan role);
 * - validasi klien required; 422 duplikat nip/email dirender per field;
 * - create tanpa password → field password DI-OMIT (bukan kirim null/kosong);
 *   edit mengirim hanya field berubah + `permissions` penuh bila disentuh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/api/client";
import type { AdminUser, AdminPermission, TeamResource } from "@/api/types";

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

vi.mock("@/api/wfh-team", () => ({
  listTeams: vi.fn(),
}));

import * as adminApi from "@/api/admin";
import { listTeams } from "@/api/wfh-team";
import { UserFormPage } from "@/pages/admin/UserFormPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";

const mockedGetUser = adminApi.getUserById as unknown as Mock;
const mockedCreate = adminApi.createUser as unknown as Mock;
const mockedUpdate = adminApi.updateUser as unknown as Mock;
const mockedPermissions = adminApi.listPermissions as unknown as Mock;
const mockedListTeams = listTeams as unknown as Mock;

const teams: TeamResource[] = [
  { id: 3, name: "Tim Aplikasi", leader_id: 5, field_id: 1 },
  { id: 4, name: "Tim Jaringan", leader_id: null, field_id: 2 },
];

const permissions: AdminPermission[] = [
  { id: 1, name: "wfh.report.create" },
  { id: 2, name: "wfh.report.approve" },
  { id: 3, name: "change.implementation.review" },
];

const existingUser: AdminUser = {
  id: 12,
  name: "Dewi Lestari",
  nip: "199503152024011002",
  email: "dewi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  phone: "081345678901",
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.report.create", "wfh.report.approve"],
  team: { id: 3, name: "Tim Aplikasi", leader: { id: 5, name: "Siti" }, field: { id: 1, name: "Bidang TI" } },
};

/** Admin dengan permission create+update (persona digate per test). */
const adminPersona = {
  id: 1,
  name: "Admin Utama",
  nip: "198001012023011001",
  email: "admin@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["admin"],
  permissions: ["user.manage", "user.create", "user.update"],
};

function renderForm(route: string, overrides?: Partial<typeof adminPersona>) {
  const store = makeStore();
  store.dispatch(setUser({ ...adminPersona, ...overrides }));

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/admin/users/new" element={<UserFormPage />} />
          <Route path="/admin/users/:userId/edit" element={<UserFormPage />} />
          <Route path="/admin/users" element={<div>users-list-stub</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

/** Isi field wajib create + pilih role staf. */
async function fillRequired(opts?: { nip?: string; email?: string }) {
  await userEvent.type(screen.getByLabelText("Nama"), "Budi Santoso");
  await userEvent.type(
    screen.getByLabelText("NIP"),
    opts?.nip ?? "199001012023011001",
  );
  await userEvent.type(
    screen.getByLabelText("Email"),
    opts?.email ?? "budi@kominfo.go.id",
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "staf" }));
}

/** Payload create yang diharapkan dari fillRequired() tanpa password. */
const expectedCreateInput = {
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  team_id: 3,
  rank: "Penata Muda",
  position: "Programmer",
  phone: "081234567890",
  roles: ["staf"],
};

function createInputWithoutPasswords(input: unknown): Record<string, unknown> {
  const { password: _password, permissions: _permissions, ...rest } = input as Record<string, unknown>;
  return rest;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListTeams.mockResolvedValue(teams);
  mockedPermissions.mockResolvedValue(permissions);
  mockedGetUser.mockResolvedValue(existingUser);
  mockedCreate.mockResolvedValue(existingUser);
  mockedUpdate.mockResolvedValue(existingUser);
});

describe("UserFormPage — render form (create mode)", () => {
  it("render semua field: nama, NIP, email, tim dropdown, pangkat, jabatan, telepon, role checkbox, password", async () => {
    renderForm("/admin/users/new");
    expect(screen.getByLabelText("Nama")).toBeTruthy();
    expect(screen.getByLabelText("NIP")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(await screen.findByLabelText("Tim")).toBeTruthy();
    expect(screen.getByLabelText("Pangkat")).toBeTruthy();
    expect(screen.getByLabelText("Jabatan")).toBeTruthy();
    expect(screen.getByLabelText("Telepon")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    for (const role of ["admin", "kepala_bidang", "kepala_tim", "staf"]) {
      expect(screen.getByRole("checkbox", { name: role })).toBeTruthy();
    }
    // Toggle is_active TIDAK ada di create (edit-saja).
    expect(screen.queryByLabelText("Status aktif")).toBeNull();
  });

  it("dropdown tim terisi dari listTeams pinjaman (semua tim, tanpa field_id)", async () => {
    renderForm("/admin/users/new");
    const select = screen.getByLabelText("Tim") as HTMLSelectElement;
    await waitFor(() => expect(select.options.length).toBe(3)); // placeholder + 2 tim
    expect(mockedListTeams).toHaveBeenCalledWith(); // tanpa argumen — semua tim
    expect(within(select).getByText("Tim Aplikasi")).toBeTruthy();
    expect(within(select).getByText("Tim Jaringan")).toBeTruthy();
  });

  it("direct permissions multi-select render dari cache listPermissions (Resolved #3)", async () => {
    renderForm("/admin/users/new");
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );
    expect(screen.getByRole("checkbox", { name: "wfh.report.approve" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "change.implementation.review" })).toBeTruthy();
  });

  it("hint password default tersaji (kosong = default server per role)", async () => {
    renderForm("/admin/users/new");
    expect(
      screen.getByText(/kosongkan untuk memakai password default server/i),
    ).toBeTruthy();
  });

  it("hint prefill direct permissions gabungan role+direct tersaji (Open Question #1)", async () => {
    renderForm("/admin/users/new");
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );
    expect(screen.getByText(/gabungan role dan direct permission/i)).toBeTruthy();
  });
});

describe("UserFormPage — create submit", () => {
  it("isi form lengkap tanpa password → createUser DIKIRIM dengan field terisi, password DI-OMIT", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");
    await userEvent.type(screen.getByLabelText("Pangkat"), "Penata Muda");
    await userEvent.type(screen.getByLabelText("Jabatan"), "Programmer");
    await userEvent.type(screen.getByLabelText("Telepon"), "081234567890");

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));

    const input = mockedCreate.mock.calls[0]?.[0];
    // Password kosong DI-OMIT — bukan null, bukan string kosong.
    expect("password" in input).toBe(false);
    // Field lain persis.
    expect(createInputWithoutPasswords(input)).toEqual(expectedCreateInput);
  });

  it("isi password → dikirim apa adanya", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");
    await userEvent.type(screen.getByLabelText("Password"), "rahasiaBudi123");

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0]?.[0].password).toBe("rahasiaBudi123");
  });

  it("pilih direct permission → permissions[] terkirim (Resolved #3)", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");
    // Tunggu permissions termuat lalu centang satu.
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );
    await u.click(screen.getByRole("checkbox", { name: "wfh.report.create" }));

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0]?.[0].permissions).toEqual(["wfh.report.create"]);
  });
});

describe("UserFormPage — validasi klien (create)", () => {
  it("kosong → tidak memanggil createUser; pesan required (nama/NIP/email) tampil", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await u.click(screen.getByRole("button", { name: /simpan/i }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Nama wajib diisi.")).toBeTruthy();
    expect(screen.getByText("NIP wajib diisi.")).toBeTruthy();
    expect(screen.getByText("Email wajib diisi.")).toBeTruthy();
  });


  it("email format salah → tidak memanggil createUser; pesan format tampil", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired({ email: "bukan-email" });
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");

    await u.click(screen.getByRole("button", { name: /simpan/i }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(screen.getByText("Format email tidak valid.")).toBeTruthy();
  });
});

describe("UserFormPage — 422 duplikat nip/email dirender per field", () => {
  it("create 422 duplikat → pesan per field nip & email dirender (ApiError.errors)", async () => {
    mockedCreate.mockRejectedValueOnce(
      new ApiError("validation", "The nip has already been taken.", {
        status: 422,
        errors: {
          nip: ["The nip has already been taken."],
          email: ["The email has already been taken."],
        },
      }),
    );
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");

    await u.click(screen.getByRole("button", { name: /simpan/i }));

    await waitFor(() =>
      expect(screen.getAllByText("The nip has already been taken.").length).toBeGreaterThan(0),
    );
    expect(
      screen.getAllByText("The email has already been taken.").length,
    ).toBeGreaterThan(0);
    // Form tetap termuat — tidak navigasi.
    expect(screen.getByLabelText("Nama")).toBeTruthy();
  });
});

describe("UserFormPage — edit mode (/admin/users/:userId/edit)", () => {
  it("mount → getUserById(12) → prefill semua field + role + is_active checked", async () => {
    renderForm("/admin/users/12/edit");

    await waitFor(() => expect(mockedGetUser).toHaveBeenCalledWith(12));
    await waitFor(() => {
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari");
    });
    expect((screen.getByLabelText("NIP") as HTMLInputElement).value).toBe("199503152024011002");
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("dewi@kominfo.go.id");
    expect((screen.getByLabelText("Pangkat") as HTMLInputElement).value).toBe("Pengatur Muda");
    expect((screen.getByLabelText("Jabatan") as HTMLInputElement).value).toBe("Staf Pelaksana");
    expect((screen.getByLabelText("Telepon") as HTMLInputElement).value).toBe("081345678901");
    // Tim prefill sesuai team nested.
    await waitFor(() => {
      expect((screen.getByLabelText("Tim") as HTMLSelectElement).value).toBe("3");
    });
    expect(
      (screen.getByRole("checkbox", { name: "staf" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "admin" }) as HTMLInputElement).checked,
    ).toBe(false);
    // Toggle is_active HANYA di edit.
    expect((screen.getByLabelText("Status aktif") as HTMLInputElement).checked).toBe(true);
  });

  it("prefill permissions gabungan role+direct ditandai (Open Question #1) + hint", async () => {
    renderForm("/admin/users/12/edit");
    await waitFor(() =>
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari"),
    );
    await waitFor(() =>
      expect(
        (screen.getByRole("checkbox", { name: "wfh.report.create" }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect(
      (screen.getByRole("checkbox", { name: "wfh.report.approve" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "change.implementation.review" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });

  it("ubah satu field + sentuh permissions → updateUser mengirim field berubah + permissions PENUH", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/12/edit");

    await waitFor(() =>
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari"),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );

    // Ubah nama dan jabatan; sentuh permissions (uncheck + recheck satu = tetap tercentang).
    await userEvent.clear(screen.getByLabelText("Nama"));
    await userEvent.type(screen.getByLabelText("Nama"), "Dewi Lestari Wijaya");
    await userEvent.clear(screen.getByLabelText("Jabatan"));
    await userEvent.type(screen.getByLabelText("Jabatan"), "Analis Sistem Informasi");
    await u.click(screen.getByRole("checkbox", { name: "wfh.report.create" }));
    await u.click(screen.getByRole("checkbox", { name: "wfh.report.create" }));
    // (checkbox disentuh dua kali → tetap tercentang)

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    const [userId, input] = mockedUpdate.mock.calls[0] as [number, Record<string, unknown>];
    expect(userId).toBe(12);

    // Field berubah dikirim.
    expect(input.name).toBe("Dewi Lestari Wijaya");
    expect(input.position).toBe("Analis Sistem Informasi");
    // Field tak berubah TIDAK dikirim (edit = hanya field berubah).
    expect("nip" in input).toBe(false);
    expect("email" in input).toBe(false);
    expect("roles" in input).toBe(false);
    expect("rank" in input).toBe(false);
    expect("phone" in input).toBe(false);
    expect("team_id" in input).toBe(false);
    // Permissions disentuh → sync penuh dikirim eksplisit (REQuery #4).
    // Gabungan prefill [wfh.report.create, wfh.report.approve] tetap utuh.
    expect(input.permissions).toEqual(["wfh.report.create", "wfh.report.approve"]);
  });

  it("edit TANPA menyentuh permissions → permissions TIDAK dikirim", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/12/edit");

    await waitFor(() =>
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari"),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );

    await userEvent.clear(screen.getByLabelText("Telepon"));
    await userEvent.type(screen.getByLabelText("Telepon"), "081999888777");

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    const [, input] = mockedUpdate.mock.calls[0] as [number, Record<string, unknown>];
    expect(input.phone).toBe("081999888777");
    expect("permissions" in input).toBe(false);
  });

  it("toggle is_active false → updateUser {is_active: false}", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/12/edit");

    await waitFor(() =>
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari"),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );

    await u.click(screen.getByLabelText("Status aktif"));

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    const [, input] = mockedUpdate.mock.calls[0] as [number, Record<string, unknown>];
    expect(input.is_active).toBe(false);
  });
  it("uncheck SEMUA direct permissions → updateUser mengirim permissions: [] (bukan omit)", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/12/edit");

    // Prefill gabungan [wfh.report.create, wfh.report.approve].
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.approve" })).toBeTruthy(),
    );

    await u.click(screen.getByRole("checkbox", { name: "wfh.report.create" }));
    await u.click(screen.getByRole("checkbox", { name: "wfh.report.approve" }));

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    const [, input] = mockedUpdate.mock.calls[0] as [number, Record<string, unknown>];
    expect("permissions" in input).toBe(true);
    expect(input.permissions).toEqual([]);
  });

  it("uncheck role lalu centang role lain → roles[] dikirim; permissions TIDAK (tak disentuh)", async () => {
    const u = userEvent.setup();
    renderForm("/admin/users/12/edit");

    await waitFor(() =>
      expect((screen.getByLabelText("Nama") as HTMLInputElement).value).toBe("Dewi Lestari"),
    );
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "wfh.report.create" })).toBeTruthy(),
    );

    await u.click(screen.getByRole("checkbox", { name: "staf" }));
    await u.click(screen.getByRole("checkbox", { name: "kepala_tim" }));

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));

    const [, input] = mockedUpdate.mock.calls[0] as [number, Record<string, unknown>];
    expect(input.roles).toEqual(["kepala_tim"]);
    expect("permissions" in input).toBe(false);
  });
});

describe("UserFormPage — gate permission (sintetik, bukan role)", () => {
  it("create tanpa user.create → tombol Simpan hilang", async () => {
    renderForm("/admin/users/new", { permissions: ["user.manage"] });
    await waitFor(() => expect(mockedListTeams).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /simpan/i })).toBeNull();
  });

  it("edit tanpa user.update → tombol Simpan hilang", async () => {
    renderForm("/admin/users/12/edit", { permissions: ["user.manage"] });
    await waitFor(() => expect(mockedGetUser).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /simpan/i })).toBeNull();
  });

  it("create dengan user.create → tombol Simpan tampil", async () => {
    renderForm("/admin/users/new");
    await waitFor(() => expect(mockedListTeams).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /simpan/i })).toBeTruthy();
  });

  it("edit dengan user.update → tombol Simpan tampil", async () => {
    renderForm("/admin/users/12/edit");
    await waitFor(() => expect(mockedGetUser).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /simpan/i })).toBeTruthy();
  });
});

describe("UserFormPage — navigasi pasca-sukses", () => {
  it("create sukses → navigate ke /admin/users", async () => {
    mockNavigate.mockClear();
    const u = userEvent.setup();
    renderForm("/admin/users/new");

    await fillRequired();
    await userEvent.selectOptions(screen.getByLabelText("Tim"), "3");

    await u.click(screen.getByRole("button", { name: /simpan/i }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith("/admin/users");
  });
});
