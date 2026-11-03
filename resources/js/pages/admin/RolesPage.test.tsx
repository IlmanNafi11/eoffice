/**
 * Unit test RolesPage (modul admin — Task 6).
 * Kontrak yang dijaga (plan Task 6):
 * - mount → dispatch `fetchRoles`; bila pemegang `permission.manage` juga
 *   `fetchPermissions` (cache sekali per sesi di slice);
 * - kolom grid dari cache `listPermissions` bila pemegang
 *   `permission.manage`; FALLBACK derived distinct dari `listRoles` bila
 *   tanpa `permission.manage` (REQuery #4, ter-test kedua arah);
 * - simpan per role → `updateRolePermissions` sync penuh persis checklist;
 *   role tak berubah tak mengirim (tombol Simpan disabled/absen aksi);
 * - 422 lockout kritis admin dirender dan tak lenyap (slice a602c46);
 * - dialog konfirmasi uncheck permission kritis (`user.manage`,
 *   `role.manage`, `permission.manage`) pada role `admin`; role lain tanpa
 *   dialog;
 * - gate `role.manage`: tanpa itu tak ada aksi simpan.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { userEvent } from "@/test/portal";
import { render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import type { AdminPermission, AdminRole } from "@/api/types";

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
import { RolesPage } from "@/pages/admin/RolesPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";
import { permissionMeta } from "@/lib/permissions-meta";

const mockedListRoles = adminApi.listRoles as unknown as Mock;
const mockedListPermissions = adminApi.listPermissions as unknown as Mock;
const mockedSyncRoles = adminApi.updateRolePermissions as unknown as Mock;

const adminRole: AdminRole = {
  id: 1,
  name: "admin",
  permissions: ["user.manage", "user.create", "role.manage", "permission.manage", "wfh.report.approve"],
};

const timRole: AdminRole = {
  id: 3,
  name: "kepala_tim",
  permissions: ["wfh.report.approve", "wfh.report.reject"],
};

const allPermissions: AdminPermission[] = [
  { id: 1, name: "user.manage" },
  { id: 2, name: "user.create" },
  { id: 3, name: "role.manage" },
  { id: 4, name: "permission.manage" },
  { id: 8, name: "wfh.report.approve" },
];

const adminUser = {
  id: 1,
  name: "Admin Utama",
  nip: "198001012023011001",
  email: "admin@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["admin"],
  permissions: ["user.manage", "role.manage", "permission.manage"],
};

function renderPageAs(permissions: string[]) {
  const store = makeStore();
  store.dispatch(setUser({ ...adminUser, permissions }));
  render(
    <Provider store={store}>
      <RolesPage />
    </Provider>,
  );
  return store;
}

function rowOf(roleId: number): HTMLElement {
  return screen.getByTestId(`role-row-${roleId}`);
}

/**
 * Checkbox di-query lewat LABEL kamus (Task 7/8): UI merender label
 * Indonesia, bukan nama permission mentah (nama mentah hanya di
 * fallback "Lainnya").
 */
function labelOf(permission: string): string {
  return permissionMeta(permission).label;
}

function checkboxOf(row: HTMLElement, permission: string): HTMLElement {
  return within(row).getByRole("checkbox", { name: labelOf(permission) });
}

/** Query checkbox boleh-absen (label kamus; nama mentah hanya fallback). */
function cbQuery(row: HTMLElement, permission: string): HTMLElement | null {
  return within(row).queryByRole("checkbox", { name: labelOf(permission) });
}

/** State Checkbox animate-ui (role=checkbox) via aria-checked. */
function checkedOf(row: HTMLElement, permission: string): string {
  return checkboxOf(row, permission).getAttribute("aria-checked") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListPermissions.mockResolvedValue(allPermissions);
});

describe("RolesPage — grid render & sumber kolom", () => {
  it("mount → fetchRoles; grid render role sebagai baris", async () => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
    renderPageAs(["role.manage", "permission.manage"]);

    await waitFor(() => expect(mockedListRoles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(rowOf(1)).toBeTruthy());
    expect(within(rowOf(1)).getByText("admin")).toBeTruthy();
    expect(within(rowOf(3)).getByText("kepala_tim")).toBeTruthy();
  });

  it("pemegang permission.manage → kolom dari cache listPermissions (fetchPermissions dispatched); kolom reject dari luar cache tak ada", async () => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
    renderPageAs(["role.manage", "permission.manage"]);

    await waitFor(() => expect(rowOf(3)).toBeTruthy());
    expect(mockedListPermissions).toHaveBeenCalledTimes(1);
    // Kolom = daftar permissions dari server; `wfh.report.reject` hanya
    // dimiliki role kepala_tim, bukan bagian cache listPermissions fixture.
    expect(within(rowOf(3)).getByRole("checkbox", { name: labelOf("wfh.report.approve") })).toBeTruthy();
    expect(cbQuery(rowOf(3), "wfh.report.reject")).toBeNull();
  });

  it("tanpa permission.manage → fallback kolom derived distinct dari listRoles; listPermissions TIDAK dipanggil (REQuery #4)", async () => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
    renderPageAs(["role.manage"]);

    await waitFor(() => expect(rowOf(3)).toBeTruthy());
    expect(mockedListPermissions).not.toHaveBeenCalled();
    // Derived union kedua role — termasuk reject yang cuma di kepala_tim.
    expect(checkedOf(rowOf(3), "wfh.report.reject")).toBe("true");
    expect(checkedOf(rowOf(1), "user.manage")).toBe("true");
    // checkbox kepalan_tim untuk permission yang bukan miliknya: unchecked.
    expect(checkedOf(rowOf(3), "user.manage")).toBe("false");
  });

  it("checkbox berlabel Indonesia + permission dikelompokkan per section dalam card role", async () => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    const row = rowOf(1);
    expect(checkboxOf(row, "user.manage")).toBeTruthy();
    expect(within(row).getByText(labelOf("user.manage"))).toBeTruthy();
    expect(within(row).getByText(labelOf("wfh.report.approve"))).toBeTruthy();

    expect(within(row).getByText("WFH")).toBeTruthy();
    expect(within(row).getByText("Manajemen Pengguna")).toBeTruthy();
  });

  it("permission tak dikenal tampil di section 'Lainnya' dengan nama mentah dan tetap checkable", async () => {
    const strangeRole: AdminRole = {
      id: 9,
      name: "audit",
      permissions: ["legacy.tool"],
    };
    mockedListRoles.mockResolvedValue([strangeRole]);
    // Tanpa permission.manage → kolom derived dari listRoles, sehingga
    // permission tak dikenal ikut masuk kolom dan terlihat.
    renderPageAs(["role.manage"]);
    await waitFor(() => expect(rowOf(9)).toBeTruthy());

    const row = rowOf(9);
    expect(within(row).getByText("Lainnya")).toBeTruthy();
    expect(within(row).getByText("legacy.tool")).toBeTruthy();
    const box = within(row).getByRole("checkbox", { name: "legacy.tool" });
    // Dimiliki role → checked; klik membuktikan tetap interaktif.
    expect(box.getAttribute("aria-checked")).toBe("true");
    await userEvent.click(box);
    expect(box.getAttribute("aria-checked")).toBe("false");
  });
});

describe("RolesPage — simpan per role (sync penuh)", () => {
  beforeEach(() => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
  });

  it("uncheck satu permission → Simpan → updateRolePermissions(roleId, checklist penuh)", async () => {
    mockedSyncRoles.mockResolvedValue({ ...timRole, permissions: ["wfh.report.reject"] });
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(3)).toBeTruthy());

    await userEvent.click(checkboxOf(rowOf(3), "wfh.report.approve"));
    await userEvent.click(within(rowOf(3)).getByRole("button", { name: /simpan/i }));

    await waitFor(() =>
      expect(mockedSyncRoles).toHaveBeenCalledWith(3, ["wfh.report.reject"]),
    );
  });

  it("role tak berubah tidak mengirim — hanya tombol role yang disimpan yang memicu call", async () => {
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());
    await waitFor(() => expect(rowOf(3)).toBeTruthy());

    // Ubah hanya kepala_tim; admin tak disentuh.
    await userEvent.click(checkboxOf(rowOf(3), "wfh.report.approve"));
    await userEvent.click(within(rowOf(3)).getByRole("button", { name: /simpan/i }));

    await waitFor(() => expect(mockedSyncRoles).toHaveBeenCalledTimes(1));
    expect(mockedSyncRoles).toHaveBeenCalledWith(3, ["wfh.report.reject"]);
  });

  it("tanpa perubahan → tombol Simpan disabled", async () => {
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    const save = within(rowOf(1)).getByRole("button", { name: /simpan/i }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it("422 lockout → pesan server dirender dan tetap tampil", async () => {
    mockedSyncRoles.mockRejectedValueOnce(
      new Error("Role 'admin' tidak boleh kehilangan permission kritis: user.manage."),
    );
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    await userEvent.click(checkboxOf(rowOf(1), "user.create"));
    await userEvent.click(within(rowOf(1)).getByRole("button", { name: /simpan/i }));

    await waitFor(() =>
      expect(
        screen.getByText("Role 'admin' tidak boleh kehilangan permission kritis: user.manage."),
      ).toBeTruthy(),
    );
    expect(mockedSyncRoles).toHaveBeenCalledTimes(1);
  });
});

describe("RolesPage — dialog konfirmasi uncheck kritis pada role admin", () => {
  beforeEach(() => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
  });

  it("uncheck user.manage pada role admin → dialog konfirmasi; Batal → checkbox tetap tercentang", async () => {
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    await userEvent.click(checkboxOf(rowOf(1), "user.manage"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeTruthy();

    await userEvent.click(within(dialog).getByRole("button", { name: /batal/i }));
    expect(checkedOf(rowOf(1), "user.manage")).toBe("true");
  });

  it("konfirmasi → checkbox unchecked; Simpan mengirim checklist tanpa permission kritis", async () => {
    mockedSyncRoles.mockResolvedValue({
      ...adminRole,
      permissions: ["role.manage", "permission.manage", "wfh.report.approve"],
    });
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    await userEvent.click(checkboxOf(rowOf(1), "user.manage"));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /lanjut/i }));

    await waitFor(() =>
      expect(checkedOf(rowOf(1), "user.manage")).toBe("false"),
    );

    await userEvent.click(within(rowOf(1)).getByRole("button", { name: /simpan/i }));
    await waitFor(() =>
      expect(mockedSyncRoles).toHaveBeenCalledWith(1, [
        "user.create",
        "role.manage",
        "permission.manage",
        "wfh.report.approve",
      ]),
    );
  });

  it("uncheck permission biasa pada role kepala_tim → TANPA dialog", async () => {
    renderPageAs(["role.manage", "permission.manage"]);
    await waitFor(() => expect(rowOf(3)).toBeTruthy());

    await userEvent.click(checkboxOf(rowOf(3), "wfh.report.approve"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(checkedOf(rowOf(3), "wfh.report.approve")).toBe("false");
  });
});

describe("RolesPage — gate role.manage", () => {
  it("tanpa role.manage → tanpa tombol Simpan", async () => {
    mockedListRoles.mockResolvedValue([adminRole, timRole]);
    renderPageAs(["permission.manage"]);
    await waitFor(() => expect(rowOf(1)).toBeTruthy());

    expect(within(rowOf(1)).queryByRole("button", { name: /simpan/i })).toBeNull();
    expect(within(rowOf(3)).queryByRole("button", { name: /simpan/i })).toBeNull();
  });

  it("fetchRoles gagal 403 → pesan server dirender", async () => {
    mockedListRoles.mockRejectedValueOnce(new Error("This action is unauthorized."));
    renderPageAs(["role.manage"]);

    await waitFor(() =>
      expect(screen.getByText("This action is unauthorized.")).toBeTruthy(),
    );
  });
});
