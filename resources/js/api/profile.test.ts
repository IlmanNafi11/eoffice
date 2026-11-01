/**
 * Test unit modul `@/api/profile` (frontend-phase1 — Modul auth & profile).
 * GET/PUT /profile terenvelope; POST /profile/signature multipart FormData.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { updateProfile, uploadSignature, fetchSignatureObjectUrl } from "@/api/profile";
import { httpClient, setAuthToken } from "@/api/client";
import type { AuthUser } from "@/api/types";

type Recorded = { method?: string; url?: string; body?: unknown; headers: AxiosHeaders };

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  const headers = AxiosHeaders.from(config.headers);
  const raw = config.data;
  const isForm = typeof FormData !== "undefined" && raw instanceof FormData;
  if (isForm) {
    headers.set("content-type", "multipart/form-data");
  }
  // axios sudah serialize JSON ke string saat tiba di adapter.
  const body: unknown = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  // axios menyetel FormData sebagai objek FormData asli; simpan referensinya.
  requests.push({ method: config.method, url: config.url, body, headers });
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
  return Promise.reject(new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, config, {}, response));
}

const profile: AuthUser = {
  id: 1,
  name: "Budi Santoso",
  nip: "199001012023011001",
  email: "budi@kominfo.go.id",
  rank: "Pengatur Muda",
  position: "Staf Pelaksana",
  phone: "081234567890",
  signature_url: "http://localhost/storage/signatures/budi-signature.png",
  is_active: true,
  roles: ["staf"],
  permissions: ["wfh.report.create"],
  team: null,
  must_change_password: false,
};

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  httpClient.defaults.adapter = fakeAdapter;
});

const ok = (body: unknown) => queue.push({ status: 200, body });

describe("api/profile — endpoint & multipart (frontend-phase1)", () => {
  it("updateProfile PUT /profile mengirim field yang diberikan", async () => {
    ok({ success: true, data: { ...profile, phone: "081298765432" }, message: "Profil berhasil diperbarui." });

    const result = await updateProfile({ phone: "081298765432", rank: "Penata Muda", position: "Analis Sistem Informasi" });

    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.url).toBe("/profile");
    expect(requests[0]?.body).toEqual({
      phone: "081298765432",
      rank: "Penata Muda",
      position: "Analis Sistem Informasi",
    });
    expect(result.phone).toBe("081298765432");
  });

  it("uploadSignature POST /profile/signature memakai FormData multipart", async () => {
    ok({
      success: true,
      data: {
        signature_url: "http://localhost/storage/signatures/1-signature.png",
      },
      message: null,
    });

    const file = new File(["png-bytes"], "ttd.png", { type: "image/png" });
    const form = new FormData();
    form.append("signature", file);

    const result = await uploadSignature(form);

    expect(requests[0]?.method).toBe("post");
    expect(requests[0]?.url).toBe("/profile/signature");
    expect(requests[0]?.body).toBe(form);
    expect(requests[0]?.headers.get("content-type")).toContain("multipart/form-data");
    expect(result).toEqual({
      signature_url: "http://localhost/storage/signatures/1-signature.png",
    });
  });

  it("uploadSignature validasi 422 melempar ApiError kind 'validation'", async () => {
    queue.push({
      status: 422,
      body: {
        success: false,
        message: "The signature must be a file of type: png, jpg, jpeg.",
        errors: { signature: ["The signature must be a file of type: png, jpg, jpeg."] },
      },
    });

    const form = new FormData();
    form.append("signature", new File(["x"], "ttd.gif", { type: "image/gif" }));

    await expect(uploadSignature(form)).rejects.toMatchObject({ kind: "validation", status: 422 });
  });

  it("fetchSignatureObjectUrl memakai bearer token (bukan <img src> polos)", async () => {
    // `/api/signatures/{user}` wajib auth. Elemen <img> tidak membawa header
    // Authorization, jadi preview harus mengambil bytes lewat client ini.
    setAuthToken("tok-preview");
    queue.push({ status: 200, body: new Blob([new Uint8Array([0x89, 0x50])], { type: "image/png" }) });
    const createObjectURL = vi.fn(() => "blob:preview");
    const originalCreate = URL.createObjectURL;
    URL.createObjectURL = createObjectURL;

    try {
      const url = await fetchSignatureObjectUrl("/signatures/1");

      expect(requests[0]?.url).toBe("/signatures/1");
      expect(requests[0]?.headers.get("authorization")).toBe("Bearer tok-preview");
      expect(url).toBe("blob:preview");
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });

  it("updateProfile dengan envelope tanpa data → gagal-nyata (requireData)", async () => {
    ok({ success: true, message: "Profil berhasil diperbarui.", data: null });

    await expect(
      updateProfile({ phone: "081234567890", position: null, rank: null }),
    ).rejects.toThrow(/tidak berisi data/);
  });

});
