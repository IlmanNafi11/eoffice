/**
 * Unit test SettingsPage (modul admin — Task 7).
 *
 * Kontrak terkunci (SPEC-admin.md + plan Task 7):
 * - mount → `fetchSettings` (cache sekali per sesi di slice, condition);
 * - scalar (string | number | boolean) → input teks editable, display
 *   `String(value)`; structured (array/objek) → `JSON.stringify` READ-ONLY
 *   (Resolved #2);
 * - simpan per key → `updateSettingThunk` body `{value}` string (plan
 *   Acceptance: body `{value}` string; refresh cache pasca-sukses di slice);
 * - pesan 404 "Setting 'unknown_key' tidak ditemukan." dirender apa adanya
 *   dan tak lenyap saat refetch (a602c46 ditegakkan di slice — current.error);
 * - konfirmasi khusus key berawalan `password_default_*` sebelum kirim;
 * - gate `setting.manage` → input read-only + tombol "Simpan" hilang bila
 *   dipangkas (permission sintetik, bukan role name).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";

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
import { SettingsPage } from "@/pages/admin/SettingsPage";
import { makeStore } from "@/store";
import { setUser } from "@/store/authSlice";
import type { AuthUser } from "@/api/types";

const mockedListSettings = adminApi.listSettings as unknown as Mock;
const mockedUpdateSetting = adminApi.updateSetting as unknown as Mock;

const settingsMap = {
  password_default_admin: "admin123",
  password_default_user: "user1234",
  wfh_allowed_days: [1, 2, 3, 4, 5],
  wfh_sessions: ["pagi", "siang", "sore"],
  wfh_notify_start_time: "15:00",
};

const adminUser: AuthUser = {
  id: 1,
  name: "Admin Utama",
  nip: "198001012023011001",
  email: "admin@kominfo.go.id",
  must_change_password: false,
  is_active: true,
  roles: ["admin"],
  permissions: ["setting.manage"],
};

function renderPageAs(permissions: string[]) {
  const store = makeStore();
  store.dispatch(setUser({ ...adminUser, permissions }));
  render(
    <Provider store={store}>
      <SettingsPage />
    </Provider>,
  );
  return store;
}

/** Baris satu setting — di-scope per key supaya asersi tak silang. */
function rowOf(key: string): HTMLElement {
  return screen.getByTestId(`setting-row-${key}`);
}

async function findRow(key: string): Promise<HTMLElement> {
  return await screen.findByTestId(`setting-row-${key}`);
}

function inputOf(row: HTMLElement): HTMLInputElement {
  // Query by testid (bukan role): input `password_default_*` bertype
  // `password` — TIDAK memperoleh role aksesibel `textbox` (jsdom).
  const testid = row.getAttribute("data-testid") ?? "";
  return within(row).getByTestId(`setting-input-${testid.replace("setting-row-", "")}`) as HTMLInputElement;
}

function saveButtonOf(row: HTMLElement): HTMLButtonElement | null {
  return within(row).queryByRole("button", { name: /simpan/i }) as HTMLButtonElement | null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListSettings.mockResolvedValue(settingsMap);
  mockedUpdateSetting.mockImplementation(async (key: string, value: string) => ({
    key,
    value,
  }));
});

describe("SettingsPage — render daftar & bentuk editor", () => {
  it("mount → fetchSettings (sekali); setiap key dirender sebagai baris", async () => {
    renderPageAs(["setting.manage"]);

    await findRow("password_default_admin");
    for (const key of [
      "password_default_user",
      "wfh_allowed_days",
      "wfh_sessions",
      "wfh_notify_start_time",
    ]) {
      expect(screen.queryByTestId(`setting-row-${key}`)).toBeTruthy();
    }
    expect(mockedListSettings).toHaveBeenCalledTimes(1);
  });

  it("scalar string → input teks editable berisi nilai apa adanya", async () => {
    renderPageAs(["setting.manage"]);

    const row = await findRow("wfh_notify_start_time");
    const input = inputOf(row);
    expect(input instanceof HTMLInputElement).toBe(true);
    expect(input.disabled).toBe(false);
    expect(input.value).toBe("15:00");
  });

  it("scalar number/boolean dinormalisasi String untuk display", async () => {
    const store = makeStore();
    store.dispatch(setUser({ ...adminUser, permissions: ["setting.manage"] }));
    mockedListSettings.mockResolvedValue({ max_upload: 10, fitur_aktif: true });
    render(
      <Provider store={store}>
        <SettingsPage />
      </Provider>,
    );

    const numRow = await findRow("max_upload");
    expect(inputOf(numRow).value).toBe("10");

    const boolRow = rowOf("fitur_aktif");
    expect(inputOf(boolRow).value).toBe("true");
  });

  it("structured (array/objek) → JSON.stringify READ-ONLY tanpa tombol simpan", async () => {
    renderPageAs(["setting.manage"]);

    const daysRow = await findRow("wfh_allowed_days");
    const daysInput = inputOf(daysRow);
    expect(daysInput.value).toBe("[1,2,3,4,5]");
    expect(daysInput.disabled).toBe(true);
    expect(saveButtonOf(daysRow)).toBeNull();

    const sessionsRow = rowOf("wfh_sessions");
    const sessionsInput = inputOf(sessionsRow);
    expect(sessionsInput.value).toBe('["pagi","siang","sore"]');
    expect(sessionsInput.disabled).toBe(true);
    expect(saveButtonOf(sessionsRow)).toBeNull();
  });

  it("password_default_* dimask (type=password) + tombol reveal", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("password_default_admin");
    const input = within(row).getByTestId("setting-input-password_default_admin") as HTMLInputElement;
    expect(input.type).toBe("password");

    // Nilai tetap ada di value (draft), visual dimask oleh type=password.
    expect(input.value).toBe("admin123");

    // Reveal → type text; tombol kembali menyembunyikan.
    await user.click(within(row).getByRole("button", { name: /tampilkan nilai/i }));
    expect(input.type).toBe("text");
    await user.click(within(row).getByRole("button", { name: /sembunyikan nilai/i }));
    expect(input.type).toBe("password");
  });

  it("gagal fetch → pesan error tersaji", async () => {
    mockedListSettings.mockRejectedValue(new Error("Gagal memuat setting."));
    renderPageAs(["setting.manage"]);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Gagal memuat setting.");
  });
});

describe("SettingsPage — simpan per key (body {value} string)", () => {
  it("edit scalar lalu Simpan → updateSetting(key, nilai string dari input)", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("wfh_notify_start_time");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "16:30");
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("wfh_notify_start_time", "16:30");
    });
    expect(mockedUpdateSetting).toHaveBeenCalledTimes(1);
  });

  it("pasca-sukses cache diperbarui dengan respons server (slice fulfilled)", async () => {
    const user = userEvent.setup();
    const store = renderPageAs(["setting.manage"]);
    mockedUpdateSetting.mockResolvedValue({
      key: "wfh_notify_start_time",
      value: "16:30",
    });

    const row = await findRow("wfh_notify_start_time");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "16:30");
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(store.getState().admin.current.status).toBe("succeeded");
    });
    expect(store.getState().admin.settings.items?.wfh_notify_start_time).toBe("16:30");
  });

  it("404 'Setting tidak ditemukan.' dirender dan tak lenyap", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);
    mockedUpdateSetting.mockRejectedValue(
      new Error("Setting 'wfh_notify_start_time' tidak ditemukan."),
    );

    const row = await findRow("wfh_notify_start_time");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "16:30");
    await user.click(saveButtonOf(row)!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Setting 'wfh_notify_start_time' tidak ditemukan.",
    );
    // Daftar setting tetap tampil — error tak menutup halaman.
    expect(screen.queryByTestId("setting-row-password_default_user")).toBeTruthy();
  });
});

describe("SettingsPage — konfirmasi password_default_*", () => {
  it("simpan key non-password TIDAK membuka dialog konfirmasi", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("wfh_notify_start_time");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "16:30");
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("wfh_notify_start_time", "16:30");
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("edit key password_default_* → dialog konfirmasi dulu; batal = tak mengirim", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("password_default_user");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "rahasia123");
    await user.click(saveButtonOf(row)!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/password_default_user/)).toBeTruthy();
    expect(mockedUpdateSetting).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: /batal/i }));
    expect(mockedUpdateSetting).not.toHaveBeenCalled();
  });

  it("konfirmasi password_default_* → updateSetting terkirim", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("password_default_user");
    await user.clear(inputOf(row));
    await user.type(inputOf(row), "rahasia123");
    await user.click(saveButtonOf(row)!);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /lanjutkan/i }));

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("password_default_user", "rahasia123");
    });
  });
});

describe("SettingsPage — gate setting.manage", () => {
  it("tanpa setting.manage: input read-only + tombol Simpan hilang di semua baris", async () => {
    renderPageAs(["user.manage"]);

    const row = await findRow("wfh_notify_start_time");
    expect(inputOf(row)).toBeTruthy();
    expect(inputOf(row).disabled).toBe(true);
    expect(saveButtonOf(row)).toBeNull();
  });
});
