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
  WfhReport,
  WfhReportStatus,
  WfhReportLink,
  WfhAttendance,
  WfhSessionConfig,
  ListWfhReportsQuery,
  CreateWfhReportInput,
  ActivityInput,
  ActivityUpdateInput,
  ReorderInput,
  RejectReportRequest,
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

// Fixtures verbatim dari postman/specs/openapi.yaml (WFH Reports).

const reportUser = {
  id: 1,
  name: "Budi Santoso",
  nip: "199001012023011001",
  position: "Staf Pelaksana",
  rank: "Pengatur Muda",
} as const;

describe("api/types — kontrak domain WFH reports (openapi.yaml)", () => {
  it("WfhReportResource sesuai skema (field required + opsional)", () => {
    const report: WfhReport = {
      id: 23,
      user_id: 1,
      report_date: "2025-07-11",
      status: "pending",
      maker_signed_at: "2025-07-11T15:45:00.000000Z",
      supervisor_signed_at: null,
      reject_reason: null,
      created_at: "2025-07-11T14:00:00.000000Z",
      updated_at: "2025-07-11T14:30:00.000000Z",
      user: reportUser,
      supervisor: reportUser,
      activities: [
        {
          id: 67,
          start_time: "08:00",
          end_time: "10:00",
          activity: "Menyusun dokumentasi API modul WFH",
          sort_order: 1,
          links: [{ id: 89, url: "https://git.example/mr/12", sort_order: 1 }],
        },
      ],
      activity_count: 3,
      attendances: [
        { id: 45, session: "pagi", checked_in: true, photo_url: "http://localhost/storage/photo.jpg" },
      ],
    };
    expect(report.status).toBe("pending");
    expect(report.activities?.[0]?.links?.[0]?.sort_order).toBe(1);
    expect(report.attendances?.[0]?.session).toBe("pagi");
  });

  it("WfhReport list shape: tanpa attendances (relation tidak di-load di list)", () => {
    const row: WfhReport = {
      id: 24,
      user_id: 1,
      report_date: "2025-07-12",
      status: "draft",
      activity_count: 0,
    };
    expect(row.attendances).toBeUndefined();
    expect(row.user).toBeUndefined();
  });

  it("WfhReportStatus union literal — value di luar union tidak valid", () => {
    const statuses: WfhReportStatus[] = ["draft", "pending", "approved", "rejected"];
    expect(statuses).toHaveLength(4);
    // @ts-expect-error — bukan status kontrak
    const bad: WfhReportStatus = "closed";
    expect(bad).toBe("closed");
  });

  it("WfhReportLink: sort_order hanya opsional (sub-resource response tanpa sort_order)", () => {
    const subResourceLink: WfhReportLink = { id: 89, url: "https://git.example/mr/12" };
    const fullLink: WfhReportLink = { id: 89, url: "https://git.example/mr/12", sort_order: 1 };
    expect(subResourceLink.sort_order).toBeUndefined();
    expect(fullLink.sort_order).toBe(1);
  });

  it("WfhAttendance sesuai skema attendance di WfhReportResource", () => {
    const att: WfhAttendance = {
      id: 45,
      session: "siang",
      checked_in: true,
      photo_url: null,
    };
    expect(att.photo_url).toBeNull();
  });

  it("WfhSessionConfig sesuai skema WfhSessionConfigResponse", () => {
    const cfg: WfhSessionConfig = {
      sessions: ["pagi", "siang", "sore"],
      allowed_days: [1, 2, 3, 4, 5],
    };
    expect(cfg.sessions).toEqual(["pagi", "siang", "sore"]);
    expect(cfg.allowed_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("ListWfhReportsQuery: date, month, per_page opsional", () => {
    const q: ListWfhReportsQuery = { date: "2026-08-10", per_page: 25 };
    const qMonth: ListWfhReportsQuery = { month: "2026-08" };
    expect(q.date).toBe("2026-08-10");
    expect(qMonth.month).toBe("2026-08");
  });

  it("CreateWfhReportInput sesuai StoreReportRequest (aktivitas tautan string + foto per sesi)", () => {
    const input: CreateWfhReportInput = {
      report_date: "2025-07-11",
      status: "submit",
      activities: [
        {
          start_time: "08:00",
          end_time: "10:00",
          activity: "Menyusun dokumentasi API modul WFH",
          links: ["https://git.example/mr/12"],
        },
      ],
      attendances: {
        pagi: { photo: new File([], "foto.jpg", { type: "image/jpeg" }) },
      },
    };
    expect(input.status).toBe("submit");
    expect(input.activities?.[0]?.links).toEqual(["https://git.example/mr/12"]);
    expect(input.attendances?.pagi?.photo).toBeInstanceOf(File);
  });

  it("ActivityInput / ActivityUpdateInput sesuai StoreActivityRequest (links id-diff)", () => {
    const add: ActivityInput = {
      activity: "Mengikuti pelatihan diklat Kominfo",
      start_time: "08:00",
      end_time: "10:00",
      links: [{ url: "https://git.example/mr/12" }, { id: 90, url: "https://git.example/issue/34" }],
    };
    const update: ActivityUpdateInput = {
      id: null,
      activity: "Revisi kegiatan",
      start_time: null,
      end_time: null,
      links: [],
    };
    expect(add.links?.[1]?.id).toBe(90);
    expect(update.id).toBeNull();
  });

  it("ReorderInput hanya ids: number[]", () => {
    const reorder: ReorderInput = { ids: [69, 67, 68] };
    expect(reorder.ids).toEqual([69, 67, 68]);
  });

  it("RejectReportRequest wajib reason", () => {
    const reject: RejectReportRequest = {
      reason: "Rincian aktivitas kurang detail, mohon lengkapi deskripsi pekerjaan untuk sesi 10:00-12:00.",
    };
    // @ts-expect-error — reason wajib di kontrak
    const bad: RejectReportRequest = {};
    expect(reject.reason).toContain("kurang detail");
    expect(bad).toEqual({});
  });
});
