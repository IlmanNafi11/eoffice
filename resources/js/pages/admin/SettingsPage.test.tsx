/**
 * Unit test SettingsPage (modul admin — plan Task 6 ux-fixes).
 *
 * Kontrak: tiap baris membaca `settingMeta(key)` → label Indonesia + kontrol
 * per kind (day-checkbox, session-checkbox, TimeInput, password, text
 * fallback). `Simpan` mengirim nilai ter-decode ke `updateSettingThunk`
 * (array tetap array; jam `HH:mm` string). Password tetap masked + dialog
 * konfirmasi. Key tak dikenal tetap tampil sebagai input teks berlabel key.
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
  wfh_allowed_days: [1, 2, 3, 4, 5, 6, 7],
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

function saveButtonOf(row: HTMLElement): HTMLButtonElement | null {
  return within(row).queryByRole("button", {
    name: /simpan/i,
  }) as HTMLButtonElement | null;
}

function dayCheckbox(row: HTMLElement, label: string): HTMLElement {
  return within(row).getByRole("checkbox", { name: label });
}

/** State Checkbox animate-ui (role=checkbox) via aria-checked. */
function checked(el: HTMLElement): string {
  return el.getAttribute("aria-checked") ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedListSettings.mockResolvedValue(settingsMap);
  mockedUpdateSetting.mockImplementation(async (key: string, value: unknown) => ({
    key,
    value,
  }));
});

describe("SettingsPage — label & kontrol per kind", () => {
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

  it("label manusiawi (bukan nama key mentah) untuk semua key seeded", async () => {
    renderPageAs(["setting.manage"]);
    await findRow("wfh_allowed_days");

    expect(rowOf("wfh_allowed_days").textContent).toContain("Hari Kerja WFH");
    expect(rowOf("wfh_sessions").textContent).toContain("Sesi Absensi WFH");
    expect(rowOf("wfh_notify_start_time").textContent).toContain(
      "Jam Mulai Notifikasi WFH",
    );
    expect(rowOf("password_default_admin").textContent).toContain(
      "Password Default Admin",
    );
    // Label = meta, bukan key mentah.
    expect(rowOf("wfh_allowed_days").textContent).not.toContain("wfh_allowed_days");
  });

  it("wfh_allowed_days → 7 checkbox Senin..Minggu dengan state dari server", async () => {
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_allowed_days");

    for (const label of [
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ]) {
      expect(dayCheckbox(row, label)).toBeTruthy();
    }
    expect(checked(dayCheckbox(row, "Senin"))).toBe("true");
    expect(checked(dayCheckbox(row, "Minggu"))).toBe("true");
    // JSON string mentah tak lagi muncul sebagai nilai input.
    expect(within(row).queryByDisplayValue("[1,2,3,4,5,6,7]")).toBeNull();
  });

  it("wfh_sessions → 3 checkbox pagi/siang/sore; state sesuai server", async () => {
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_sessions");

    expect(checked(within(row).getByRole("checkbox", { name: "pagi" }))).toBe("true");
    expect(checked(within(row).getByRole("checkbox", { name: "siang" }))).toBe("true");
    expect(checked(within(row).getByRole("checkbox", { name: "sore" }))).toBe("true");
  });

  it("wfh_notify_start_time → TimeInput non-native (tanpa input type=time)", async () => {
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_notify_start_time");

    expect(within(row).getByRole("button", { name: /15:00/ })).toBeTruthy();
    // Audit: tak ada kontrol native waktu.
    expect(row.querySelector('input[type="time"]')).toBeNull();
    expect(document.querySelector('input[type="time"]')).toBeNull();
  });

  it("key tak dikenal → input teks berlabel key, tetap tampil & editable", async () => {
    mockedListSettings.mockResolvedValue({ fitur_baru: "aktif" });
    renderPageAs(["setting.manage"]);

    const row = await findRow("fitur_baru");
    expect(row.textContent).toContain("fitur_baru");
    const input = within(row).getByTestId("setting-input-fitur_baru") as HTMLInputElement;
    expect(input.value).toBe("aktif");
    expect(input.disabled).toBe(false);
  });

  it("password_default_* dimask (type=password) + tombol reveal", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("password_default_admin");
    const input = within(row).getByTestId(
      "setting-input-password_default_admin",
    ) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.value).toBe("admin123");

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

describe("SettingsPage — simpan nilai ter-decode per kind", () => {
  it("uncheck Sabtu+Minggu → updateSetting kirim array angka [1,2,3,4,5]", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_allowed_days");

    await user.click(dayCheckbox(row, "Sabtu"));
    await user.click(dayCheckbox(row, "Minggu"));
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("wfh_allowed_days", [1, 2, 3, 4, 5]);
    });
    expect(mockedUpdateSetting).toHaveBeenCalledTimes(1);
  });

  it("uncheck sesi 'sore' → updateSetting kirim array nama subset", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_sessions");

    await user.click(within(row).getByRole("checkbox", { name: "sore" }));
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("wfh_sessions", ["pagi", "siang"]);
    });
  });

  it("pilih jam via TimeInput → updateSetting kirim string HH:mm", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);
    const row = await findRow("wfh_notify_start_time");

    await user.click(within(row).getByRole("button", { name: /15:00/ }));
    await user.click(await screen.findByRole("button", { name: /^jam 08$/i }));
    await user.click(await screen.findByRole("button", { name: /^menit 30$/i }));
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("wfh_notify_start_time", "08:30");
    });
  });

  it("pasca-sukses cache diperbarui dengan respons server (slice fulfilled)", async () => {
    const user = userEvent.setup();
    const store = renderPageAs(["setting.manage"]);
    mockedUpdateSetting.mockResolvedValue({
      key: "wfh_allowed_days",
      value: [1, 2, 3, 4, 5],
    });

    const row = await findRow("wfh_allowed_days");
    await user.click(dayCheckbox(row, "Sabtu"));
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(store.getState().admin.current.status).toBe("succeeded");
    });
    expect(store.getState().admin.settings.items?.wfh_allowed_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("404 'Setting tidak ditemukan.' dirender dan tak lenyap", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);
    mockedUpdateSetting.mockRejectedValue(
      new Error("Setting 'wfh_allowed_days' tidak ditemukan."),
    );

    const row = await findRow("wfh_allowed_days");
    await user.click(dayCheckbox(row, "Sabtu"));
    await user.click(saveButtonOf(row)!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Setting 'wfh_allowed_days' tidak ditemukan.",
    );
    expect(screen.queryByTestId("setting-row-password_default_user")).toBeTruthy();
  });
});

describe("SettingsPage — konfirmasi password_default_*", () => {
  it("simpan key non-password TIDAK membuka dialog konfirmasi", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("wfh_allowed_days");
    await user.click(dayCheckbox(row, "Sabtu"));
    await user.click(saveButtonOf(row)!);

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("edit key password_default_* → dialog konfirmasi dulu; batal = tak mengirim", async () => {
    const user = userEvent.setup();
    renderPageAs(["setting.manage"]);

    const row = await findRow("password_default_user");
    const input = within(row).getByTestId("setting-input-password_default_user");
    await user.clear(input);
    await user.type(input, "rahasia123");
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
    const input = within(row).getByTestId("setting-input-password_default_user");
    await user.clear(input);
    await user.type(input, "rahasia123");
    await user.click(saveButtonOf(row)!);

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /lanjutkan/i }));

    await waitFor(() => {
      expect(mockedUpdateSetting).toHaveBeenCalledWith("password_default_user", "rahasia123");
    });
  });
});

describe("SettingsPage — gate setting.manage", () => {
  it("tanpa setting.manage: kontrol disabled + tombol Simpan hilang", async () => {
    renderPageAs(["user.manage"]);

    const daysRow = await findRow("wfh_allowed_days");
    expect((dayCheckbox(daysRow, "Senin") as HTMLButtonElement).disabled).toBe(true);
    expect(saveButtonOf(daysRow)).toBeNull();

    const timeRow = rowOf("wfh_notify_start_time");
    expect(
      (within(timeRow).getByRole("button", { name: /15:00/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(saveButtonOf(timeRow)).toBeNull();

    const passwordRow = rowOf("password_default_user");
    expect(
      (within(passwordRow).getByTestId(
        "setting-input-password_default_user",
      ) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(saveButtonOf(passwordRow)).toBeNull();
  });
});
