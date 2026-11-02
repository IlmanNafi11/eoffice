/**
 * Test unit modul `@/api/admin` (modul admin).
 * Mengunci kontrak 11 operasi `openapi.yaml` (tag User Management / RBAC
 * Management / Settings): path, params query, payload JSON, FormData import,
 * dan pemetaan envelope `ApiResponse::paginated` → `{ users, meta }`.
 * `listTeams` TIDAK dites di sini — sudah terkunci di `wfh-team.test.ts`
 * (op pinjaman, tidak diduplikasi di modul admin).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  listUsers,
  createUser,
  getUserById,
  updateUser,
  deleteUser,
  importUsers,
  listRoles,
  updateRolePermissions,
  listPermissions,
  listSettings,
  updateSetting,
} from "@/api/admin";
import { httpClient, setAuthToken } from "@/api/client";
import type { AdminUser, AdminRole, SettingsMap, StoreUserInput } from "@/api/types";

type Recorded = {
  method?: string;
  url?: string;
  headers: AxiosHeaders;
  params?: unknown;
  data?: unknown;
};

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({
    method: config.method,
    url: config.url,
    headers: AxiosHeaders.from(config.headers),
    params: config.params,
    data: config.data,
  });
  const next = queue.shift();
  if (!next) throw new Error("fakeAdapter: no queued response");
  const response = {
    status: next.status,
    statusText: next.status === 200 ? "OK" : "Error",
    data: next.body,
    headers: {},
    config,
  } as AxiosResponse;
  if (next.status >= 200 && next.status < 300) return Promise.resolve(response);
  return Promise.reject(
    new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, config, {}, response),
  );
}

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  httpClient.defaults.adapter = fakeAdapter;
});

const ok = (body: unknown) => queue.push({ status: 200, body });
const created = (body: unknown) => queue.push({ status: 201, body });

// Fixture verbatim contoh openapi.yaml (UserResource example).
const adminUser: AdminUser = {
  id: 12,
  name: "Dewi Lestari",
  nip: "199503152024011002",
  email: "dewi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  phone: "081345678901",
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.attendance.create", "wfh.report.create", "wfh.report.update"],
  created_at: "2025-07-14T08:30:00.000000Z",
  team: {
    id: 3,
    name: "Tim Aplikasi",
    leader: { id: 5, name: "Siti Nurhaliza" },
    field: { id: 1, name: "Bidang Teknologi Informasi" },
  },
};

const roleResource: AdminRole = {
  id: 2,
  name: "kepala_bidang",
  permissions: ["wfh.report.approve", "wfh.report.reject", "wfh.monitoring.view"],
};

const settingsMap: SettingsMap = {
  password_default_admin: "admin123",
  password_default_user: "user1234",
  wfh_allowed_days: [1, 2, 3, 4, 5],
  wfh_sessions: ["pagi", "siang", "sore"],
};

// Body JSON yang tiba di adapter: axios sudah serialize ke string.
function jsonBody(i = 0): unknown {
  const raw = requests[i]?.data;
  return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

// ── listUsers: envelope paginated → { users, meta } (pola a78e547) ──

describe("api/admin — listUsers (envelope paginated)", () => {
  it("meneruskan per_page/page hanya bila terisi dan memetakan → { users, meta }", async () => {
    ok({
      success: true,
      data: [adminUser],
      message: null,
      meta: { current_page: 2, last_page: 3, per_page: 15, total: 32 },
    });

    const out = await listUsers({ per_page: 15, page: 2 });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/users");
    expect(requests[0]?.params).toEqual({ per_page: 15, page: 2 });
    expect(out.users).toEqual([adminUser]);
    expect(out.meta).toEqual({ current_page: 2, last_page: 3, per_page: 15, total: 32 });
  });

  it("tanpa query → tanpa params; meta default bila backend tak mengirim", async () => {
    ok({ success: true, data: [], message: null, meta: null });

    const out = await listUsers();

    expect(requests[0]?.params).toBeUndefined();
    expect(out.users).toEqual([]);
    expect(out.meta).toEqual({ current_page: 1, last_page: 1, per_page: undefined, total: 0 });
  });

  it("query parsial: hanya field terisi yang dikirim (page saja / per_page saja)", async () => {
    ok({ success: true, data: [], message: null, meta: null });
    await listUsers({ page: 3 });
    expect(requests[0]?.params).toEqual({ page: 3 });

    ok({ success: true, data: [], message: null, meta: null });
    await listUsers({ per_page: 25 });
    expect(requests[1]?.params).toEqual({ per_page: 25 });
  });
});

// ── create / getUserById / update / delete ──────────────────────────

describe("api/admin — create/get/update/delete user", () => {
  it("createUser POST payload persis skema StoreUserRequest → 201", async () => {
    created({ success: true, data: adminUser, message: null, meta: null });

    const input: StoreUserInput = {
      name: "Budi Santoso",
      nip: "199503152024011002",
      email: "budi@kominfo.go.id",
      roles: ["staf"],
    };
    const out = await createUser(input);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/admin/users");
    expect(jsonBody(0)).toEqual(input);
    expect(out).toEqual(adminUser);
  });

  it("createUser mengirim permissions dan password bila diisi", async () => {
    created({ success: true, data: adminUser, message: null, meta: null });

    await createUser({
      name: "Budi",
      nip: "199503152024011002",
      email: "budi@kominfo.go.id",
      password: "rahasiaBudi123",
      roles: ["staf"],
      permissions: ["wfh.report.approve"],
    });

    expect(jsonBody(0)).toEqual({
      name: "Budi",
      nip: "199503152024011002",
      email: "budi@kominfo.go.id",
      password: "rahasiaBudi123",
      roles: ["staf"],
      permissions: ["wfh.report.approve"],
    });
  });

  it("getUserById GET /admin/users/{id} dan melepas envelope", async () => {
    ok({ success: true, data: adminUser, message: null, meta: null });

    const out = await getUserById(12);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/users/12");
    expect(out).toEqual(adminUser);
  });

  it("updateUser PUT payload hanya field dikirim; permissions [] DIKIRIM, bukan omit", async () => {
    ok({ success: true, data: adminUser, message: null, meta: null });

    const out = await updateUser(12, { permissions: [], is_active: false });

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/admin/users/12");
    expect(jsonBody(0)).toEqual({ permissions: [], is_active: false });
    expect(out).toEqual(adminUser);
  });

  it("deleteUser DELETE dan mengembalikan pesan envelope", async () => {
    ok({ success: true, data: null, message: "User berhasil dihapus.", meta: null });

    const message = await deleteUser(12);

    expect(requests[0]?.method).toBe("delete");
    expect(requests[0]?.url).toBe("/admin/users/12");
    expect(message).toBe("User berhasil dihapus.");
  });
});

// ── importUsers: multipart FormData `file` ──────────────────────────

describe("api/admin — importUsers (FormData)", () => {
  it("POST multipart dengan field `file` dan memetakan {imported, skipped, errors[]}", async () => {
    ok({
      success: true,
      message: "Import selesai.",
      data: { imported: 3, skipped: 1, errors: ["Baris 4: NIP 199001012023011001 sudah terdaftar."] },
    });

    const file = new File(["nip,name\n1,x"], "users.csv", { type: "text/csv" });
    const out = await importUsers(file);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/admin/users/import");
    const form = requests[0]?.data;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get("file")).toBe(file);
    expect(out).toEqual({
      imported: 3,
      skipped: 1,
      errors: ["Baris 4: NIP 199001012023011001 sudah terdaftar."],
    });
  });
});

// ── RBAC: roles / permissions ───────────────────────────────────────

describe("api/admin — roles & permissions", () => {
  it("listRoles GET /admin/roles → AdminRole[]", async () => {
    ok({ success: true, data: [roleResource], message: null, meta: null });

    const out = await listRoles();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/roles");
    expect(out).toEqual([roleResource]);
  });

  it("updateRolePermissions PUT body {permissions} sync penuh ([] dikirim eksplisit)", async () => {
    ok({ success: true, data: roleResource, message: null, meta: null });

    const out = await updateRolePermissions(2, ["wfh.report.approve"]);

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/admin/roles/2/permissions");
    expect(jsonBody(0)).toEqual({ permissions: ["wfh.report.approve"] });
    expect(out).toEqual(roleResource);
  });

  it("updateRolePermissions mengirim array kosong apa adanya (replace, bukan omit)", async () => {
    ok({ success: true, data: { ...roleResource, permissions: [] }, message: null, meta: null });

    await updateRolePermissions(2, []);

    expect(jsonBody(0)).toEqual({ permissions: [] });
  });

  it("listPermissions GET /admin/permissions → {id, name}[]", async () => {
    ok({ success: true, data: [{ id: 7, name: "wfh.report.approve" }], message: null, meta: null });

    const out = await listPermissions();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/permissions");
    expect(out).toEqual([{ id: 7, name: "wfh.report.approve" }]);
  });
});

// ── Settings ────────────────────────────────────────────────────────

describe("api/admin — settings", () => {
  it("listSettings GET /admin/settings → map {key: value}", async () => {
    ok({ success: true, data: settingsMap, message: null, meta: null });

    const out = await listSettings();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/admin/settings");
    expect(out).toEqual(settingsMap);
    expect(out.wfh_allowed_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("updateSetting PUT body {value} string + encodeURIComponent(key)", async () => {
    ok({ success: true, data: { key: "password_default_user", value: "BaruUser123!" }, message: null, meta: null });

    const out = await updateSetting("password_default_user", "BaruUser123!");

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/admin/settings/password_default_user");
    expect(jsonBody(0)).toEqual({ value: "BaruUser123!" });
    expect(out).toEqual({ key: "password_default_user", value: "BaruUser123!" });
  });

  it("updateSetting meng-encode karakter khusus pada key", async () => {
    ok({ success: true, data: { key: "k/ey", value: "v" }, message: null, meta: null });

    await updateSetting("k/ey", "v");

    expect(requests[0]?.url).toBe("/admin/settings/k%2Fey");
  });
});
