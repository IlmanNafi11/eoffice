/**
 * Test unit modul `@/api/change-package` (modul change-package).
 * Mengunci kontrak 12 operasi `openapi.yaml` tag `Change Package`: bentuk
 * payload JSON, params query, pemetaan envelope `ApiResponse::paginated` →
 * `{ packages, meta }` (pola a78e547), envelope tunggal via `requireData`,
 * multipart `files[]` via `postForm`, approve/reject tanpa `reason`, dan blob
 * PDF yang bypass unwrap interceptor.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import {
  listPackages,
  createPackage,
  showPackage,
  updatePackage,
  deletePackage,
  submitPackage,
  approvePackage,
  rejectPackage,
  uploadPackageAttachments,
  exportInitiationPdf,
  exportImplementationPdf,
  listChangeTypes,
} from "@/api/change-package";
import { httpClient, setAuthToken } from "@/api/client";
import type {
  ChangePackage,
  ChangeType,
  PackageDraftInput,
  PackageSubmitInput,
} from "@/api/types";

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

// Body JSON yang tiba di adapter: axios sudah serialize ke string.
function jsonBody(i = 0): unknown {
  const raw = requests[i]?.data;
  return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

describe("api/change-package — list + change-types (envelope)", () => {
  it("listPackages meneruskan query terisi dan memetakan envelope paginated → { packages, meta }", async () => {
    ok({
      success: true,
      data: [pkg],
      message: null,
      meta: { current_page: 2, last_page: 3, per_page: 15, total: 32 },
    });

    const out = await listPackages({ per_page: 15, page: 2, status: "draft" });

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/changes");
    expect(requests[0]?.params).toEqual({ per_page: 15, page: 2, status: "draft" });
    expect(out.packages).toEqual([pkg]);
    expect(out.meta).toEqual({ current_page: 2, last_page: 3, per_page: 15, total: 32 });
  });

  it("listPackages tanpa query mengirim tanpa params dan memetakan meta default", async () => {
    ok({
      success: true,
      data: [],
      message: null,
      meta: { current_page: 1, last_page: 1, per_page: 15, total: 0 },
    });

    const out = await listPackages();

    expect(requests[0]?.params).toBeUndefined();
    expect(out.packages).toEqual([]);
    expect(out.meta).toEqual({ current_page: 1, last_page: 1, per_page: 15, total: 0 });
  });

  it("listChangeTypes melepas envelope {data: ChangeType[]} via requireData", async () => {
    ok({ success: true, data: [changeType], message: null });

    const out = await listChangeTypes();

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/change-types");
    expect(out).toEqual([changeType]);
  });
});

describe("api/change-package — create/show/update/delete", () => {
  it("createPackage POST draft JSON persis skema tanpa evaluator/field state", async () => {
    const input: PackageDraftInput = {
      initiation: {
        field_id: 3,
        needed_by_date: "2025-12-15",
        description: "Migrasi server aplikasi e-Office.",
        reason: "On-premise tidak memadai.",
      },
      implementation: {
        priority: "normal",
        impact: "Minor",
        change_type_ids: [1, 3],
      },
    };
    created({ success: true, data: pkg, message: "Paket disimpan." });

    const out = await createPackage(input);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/changes");
    expect(jsonBody()).toEqual(input);
    expect(out).toEqual(pkg);
  });

  it("showPackage GET /changes/{id} via requireData", async () => {
    ok({ success: true, data: pkg, message: null });

    const out = await showPackage(12);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/changes/12");
    expect(out).toEqual(pkg);
  });

  it("updatePackage PUT draft JSON persis skema", async () => {
    const input: PackageDraftInput = {
      initiation: { field_id: 3, description: "Revisi deskripsi", reason: "Alasan revisi" },
    };
    ok({ success: true, data: pkg, message: "Paket diperbarui." });

    const out = await updatePackage(12, input);

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/changes/12");
    expect(jsonBody()).toEqual(input);
    expect(out).toEqual(pkg);
  });

  it("deletePackage DELETE /changes/{id} mengembalikan message (tanpa data)", async () => {
    ok({ success: true, data: null, message: "Paket dihapus." });

    const out = await deletePackage(12);

    expect(requests[0]?.method).toBe("delete");
    expect(requests[0]?.url).toBe("/changes/12");
    expect(out).toBe("Paket dihapus.");
  });
});

describe("api/change-package — submit/approve/reject", () => {
  it("submitPackage POST full payload persis skema", async () => {
    const input: PackageSubmitInput = {
      initiation: {
        field_id: 3,
        needed_by_date: "2025-12-15",
        description: "Migrasi server aplikasi e-Office.",
        reason: "On-premise tidak memadai.",
      },
      implementation: {
        priority: "normal",
        impact: "Minor",
        change_type_ids: [1, 3],
        test_plan: "Smoke test semua endpoint.",
        execution_date: "2025-11-10",
        release_date: "2025-11-15",
        implementation_result: "Migrasi selesai.",
      },
    };
    ok({ success: true, data: { ...pkg, initiation: { ...pkg.initiation, status: "pending" } }, message: "Dikirim." });

    const out = await submitPackage(12, input);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/changes/12/submit");
    expect(jsonBody()).toEqual(input);
    expect(out.initiation.status).toBe("pending");
  });

  it("approvePackage POST body kosong tanpa reason", async () => {
    ok({ success: true, data: { ...pkg, initiation: { ...pkg.initiation, status: "approved" } }, message: "Disetujui." });

    await approvePackage(12);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/changes/12/approve");
    expect(jsonBody()).toEqual({});
  });

  it("rejectPackage POST body kosong tanpa reason", async () => {
    ok({ success: true, data: { ...pkg, initiation: { ...pkg.initiation, status: "rejected" } }, message: "Ditolak." });

    await rejectPackage(12);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/changes/12/reject");
    expect(jsonBody()).toEqual({});
  });
});

describe("api/change-package — upload attachments (multipart)", () => {
  it("uploadPackageAttachments mengirim FormData berkunci files[] dan melepas envelope array", async () => {
    const fileA = new File(["lampiran-a"], "a.png", { type: "image/png" });
    const fileB = new File(["lampiran-b"], "b.png", { type: "image/png" });
    const attachments = [
      { id: 15, url: "/api/changes/12/attachments/15/download", sort_order: 1 },
      { id: 16, url: "/api/changes/12/attachments/16/download", sort_order: 2 },
    ];
    ok({ success: true, data: attachments, message: "Lampiran berhasil diunggah." });

    const out = await uploadPackageAttachments(12, [fileA, fileB]);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/changes/12/attachments");
    const form = requests[0]?.data as FormData;
    expect(form.get("files[0]")).toBe(fileA);
    expect(form.get("files[1]")).toBe(fileB);
    expect(out).toEqual(attachments);
  });
});

describe("api/change-package — PDF export (blob bypass unwrap)", () => {
  it("exportInitiationPdf GET dengan responseType blob, bytes apa adunya", async () => {
    const pdf = new Blob(["%PDF-1.7 init"], { type: "application/pdf" });
    queue.push({ status: 200, body: pdf });

    const out = await exportInitiationPdf(12);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe("/changes/12/pdf/initiation");
    expect(out).toBeInstanceOf(Blob);
  });

  it("exportImplementationPdf GET dengan responseType blob", async () => {
    const pdf = new Blob(["%PDF-1.7 impl"], { type: "application/pdf" });
    queue.push({ status: 200, body: pdf });

    const out = await exportImplementationPdf(12);

    expect(requests[0]?.url).toBe("/changes/12/pdf/implementation");
    expect(out).toBeInstanceOf(Blob);
  });

  it("exportInitiationPdf 422 body Blob didekode ke pesan server (tanda tangan)", async () => {
    const errBody = new Blob(
      [JSON.stringify({ success: false, message: "Budi belum mengatur tanda tangan." })],
      { type: "application/json" },
    );
    queue.push({ status: 422, body: errBody });

    await expect(exportInitiationPdf(12)).rejects.toMatchObject({
      kind: "validation",
      status: 422,
      message: "Budi belum mengatur tanda tangan.",
    });
  });
});