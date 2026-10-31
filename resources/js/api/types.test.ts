import { describe, it, expect } from "vitest";
import type {
  AuthUser,
  ProfileData,
  UpdateProfileRequest,
  LoginRequest,
  LoginResponse,
  Envelope,
  ErrorResponse,
  PaginationMeta,
} from "@/api/types";

// Fixtures verbatim dari postman/specs/openapi.yaml (examples).

const authUser: AuthUser = {
  id: 1,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  phone: "081234567890",
  signature_path: "signatures/budi-signature.png",
  signature_url: "http://localhost/storage/signatures/budi-signature.png",
  must_change_password: true,
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.attendance.create", "wfh.report.create"],
  team: {
    id: 3,
    name: "Tim Aplikasi",
    leader: { id: 5, name: "Siti Nurhaliza" },
    field: { id: 1, name: "Bidang Teknologi Informasi" },
  },
};

describe("api/types — contract dari openapi.yaml (Phase 1 / Tipe API)", () => {
  it("AuthUser punya semua field required dari skema", () => {
    const required = [
      "id",
      "name",
      "nip",
      "email",
      "must_change_password",
      "is_active",
      "roles",
      "permissions",
    ] as const;
    for (const key of required) {
      expect(authUser).toHaveProperty(key);
    }
    expect(authUser.roles).toEqual(["staf"]);
    expect(authUser.team?.leader?.name).toBe("Siti Nurhaliza");
  });

  it("AuthUser membolehkan field opsional kosong/null", () => {
    const bare: AuthUser = {
      id: 2,
      name: "Tanpa Tim",
      nip: "199501012023011002",
      email: "bare@kominfo.go.id",
      must_change_password: false,
      is_active: true,
      roles: [],
      permissions: [],
      rank: null,
      position: null,
      phone: null,
      signature_path: null,
      signature_url: null,
      team: null,
    };
    expect(bare.team).toBeNull();
    expect(bare.signature_url).toBeNull();
  });

  it("ProfileData identik dengan AuthUser (shared UserResource v6.6.0)", () => {
    const profile: ProfileData = authUser;
    expect(profile.email).toBe("budi@kominfo.go.id");
  });

  it("LoginRequest & LoginResponse sesuai skema auth", () => {
    const req: LoginRequest = {
      email: "budi@kominfo.go.id",
      password: "rahasia123",
    };
    expect(Object.keys(req).sort()).toEqual(["email", "password"]);

    const res: Envelope<LoginResponse> = {
      success: true,
      message: "Login berhasil.",
      data: {
        token: "1|abcdef1234567890abcdef1234567890abcdef12",
        user: authUser,
      },
      meta: null,
    };
    expect(res.data?.token).toMatch(/^1\|/);
    expect(res.data?.user.name).toBe("Budi Santoso");
  });

  it("UpdateProfileRequest hanya phone/position/rank, boleh null", () => {
    const req: UpdateProfileRequest = {
      phone: "081298765432",
      position: "Analis Sistem Informasi",
      rank: "Penata Muda",
    };
    const partial: UpdateProfileRequest = { phone: null };
    expect(Object.keys(req).sort()).toEqual(["phone", "position", "rank"]);
    expect(partial.phone).toBeNull();
  });

  it("ErrorResponse menandai failure + errors per field (422)", () => {
    const err: ErrorResponse = {
      success: false,
      message: "Validasi gagal.",
      errors: { phone: ["The phone may not be greater than 20 characters."] },
    };
    const plain: ErrorResponse = { success: false, message: "Unauthorized." };
    expect(err.success).toBe(false);
    expect(err.errors?.phone).toHaveLength(1);
    expect(plain.errors).toBeUndefined();
  });

  it("PaginationMeta sesuai skema (+ per_page dari backend)", () => {
    const meta: PaginationMeta = {
      current_page: 1,
      last_page: 5,
      per_page: 15,
      total: 72,
    };
    const minimal: Envelope<AuthUser[]> = {
      success: true,
      message: null,
      data: [authUser],
      meta: { current_page: 2, last_page: 5, total: 72 },
    };
    expect(meta.total).toBe(72);
    expect(minimal.meta?.current_page).toBe(2);
    expect(minimal.data?.[0]?.id).toBe(1);
  });
});
