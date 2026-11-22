import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { api, decodeBlobEnvelope, fieldErrorMessages, FIELD_LABELS, httpClient, setAuthToken, getStoredToken, onUnauthorized } from "@/api/client";
import { UI_ERROR_COPY } from "@/lib/ui-errors";

type Recorded = { method?: string; url?: string; headers: AxiosHeaders; params?: unknown; data?: unknown };

const queue: Array<{ status: number; body: unknown }> = [];
const requests: Recorded[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
  requests.push({ method: config.method, url: config.url, headers: AxiosHeaders.from(config.headers), params: config.params, data: config.data });
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

const logoutSpy = vi.fn();
const assignSpy = vi.fn();

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
  window.localStorage.clear();
  setAuthToken(null);
  onUnauthorized(logoutSpy);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign: assignSpy },
  });
  httpClient.defaults.adapter = fakeAdapter;
});

afterEach(() => {
  onUnauthorized(null);
  logoutSpy.mockClear();
  assignSpy.mockClear();
});

const ok = (body: unknown) => queue.push({ status: 200, body });

describe("api/client — instance & interceptor (frontend-phase1 / axios client)", () => {
  it("baseURL instance adalah '/api'", () => {
    expect(httpClient.defaults.baseURL).toBe("/api");
  });

  it("request interceptor menempelkan 'Authorization: Bearer <token>'", async () => {
    setAuthToken("tok-123");
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("tanpa token, header Authorization tidak dikirim", async () => {
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBeUndefined();
  });

  it("setAuthToken menyimpan ke localStorage dan setAuthToken(null) membersihkannya", () => {
    setAuthToken("tok-x");
    expect(getStoredToken()).toBe("tok-x");
    expect(window.localStorage.getItem("auth_token")).toBe("tok-x");
    setAuthToken(null);
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem("auth_token")).toBeNull();
  });

  it("token hasil rehydrate dari localStorage ikut terpakai sebagai Bearer", async () => {
    window.localStorage.setItem("auth_token", "tok-rehydrated");
    ok({ success: true, data: null, message: null });
    await api.get("/auth/me");
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer tok-rehydrated");
  });

  it("response interceptor meng-unwrap envelope → data + message", async () => {
    ok({ success: true, data: { token: "t", user: { id: 1 } }, message: "Login berhasil." });
    const result = await api.post<{ token: string; user: { id: number } }>("/auth/login", { email: "a@b.c", password: "x" });
    expect(result.data).toEqual({ token: "t", user: { id: 1 } });
    expect(result.message).toBe("Login berhasil.");
    expect(result.meta).toBeNull();
  });

  it("unwrap: respons tanpa payload (logout) → data null, message tetap", async () => {
    ok({ success: true, data: null, message: "Logout berhasil." });
    const result = await api.post("/auth/logout");
    expect(result.data).toBeNull();
    expect(result.message).toBe("Logout berhasil.");
  });

  it("unwrap: meta pagination ikut diteruskan", async () => {
    ok({ success: true, data: [], message: null, meta: { current_page: 1, last_page: 3, per_page: 15, total: 40 } });
    const result = await api.get<unknown[]>("/admin/users");
    expect(result.meta).toEqual({ current_page: 1, last_page: 3, per_page: 15, total: 40 });
  });

  it("respons 200 dengan success:false → reject ApiError kind 'api'", async () => {
    ok({ success: false, message: "Gagal tak terduga." });
    const err = await api.get("/auth/me").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ kind: "api", message: "Gagal tak terduga." });
  });

  it("HTTP 422 → reject ApiError kind 'validation' dengan errors per field", async () => {
    queue.push({
      status: 422,
      body: { success: false, message: "The phone must not be greater than 20 characters.", errors: { phone: ["The phone must not be greater than 20 characters."] } },
    });
    const err = await api.put("/profile", { phone: "x".repeat(21) }).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "validation", status: 422 });
    expect((err as { errors?: Record<string, string[]> }).errors?.phone?.[0]).toContain("20 characters");
  });

  it("HTTP 401 pada request bertoken → token dibersihkan, callback logout jalan, redirect '/login'", async () => {
    setAuthToken("leaked-token");
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });
    await expect(api.get("/auth/me")).rejects.toMatchObject({ kind: "http", status: 401 });
    expect(getStoredToken()).toBeNull();
    expect(window.localStorage.getItem("auth_token")).toBeNull();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith("/login");
  });

  it("401 konkuren (dua request paralel) → satu redirect + satu kali logout", async () => {
    setAuthToken("shared-token");
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });

    const [a, b] = await Promise.allSettled([api.get("/a"), api.get("/b")]);
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
    // Debounce: hanya panggilan 401 pertama yang memicu logout+redirect.
    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledTimes(1);
  });

  it("401 basi (dikirim DENGAN token lama) TIDAK menghapus token baru pasca re-login", async () => {
    setAuthToken("old-token");

    // Adapter deferred: tahan respons sampai test melepaskannya — meniru
    // request in-flight yang dikirim DENGAN token lama sebelum re-login.
    let reject401!: (e: unknown) => void;
    let sentAuthorization: unknown;
    let sent!: () => void;
    const sentGate = new Promise<void>((r) => {
      sent = r;
    });
    httpClient.defaults.adapter = (config) => {
      sentAuthorization = config.headers?.Authorization;
      sent();
      return new Promise((_resolve, reject) => {
        reject401 = reject;
      });
    };

    const pending = api.get("/auth/me");
    await sentGate; // event aktual: request sudah terkirim ber-bearer lama.
    setAuthToken("new-token");

    // Respons 401 untuk request bertoken LAMA baru tiba sekarang.
    reject401(
      new AxiosError("Request failed", AxiosError.ERR_BAD_REQUEST, {} as InternalAxiosRequestConfig, {}, {
        status: 401,
        data: { success: false, message: "Unauthenticated." },
        headers: {},
      } as unknown as AxiosResponse),
    );
    await expect(pending).rejects.toMatchObject({ kind: "http", status: 401 });

    // Token baru HARUS bertahan — 401 milik request yang dikirim bertoken lama.
    expect(sentAuthorization).toBe("Bearer old-token");
    expect(getStoredToken()).toBe("new-token");
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("error jaringan tanpa respons → ApiError kind 'network'", async () => {
    httpClient.defaults.adapter = (config) =>
      Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));
    const err = await api.get("/auth/me").catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "network" });
  });

  it("HTTP 500 tanpa body envelope → ApiError kind 'http' dengan status sesuai", async () => {
    queue.push({ status: 500, body: "Internal Server Error" });
    const err = await api.get("/auth/me").catch((e: unknown) => e);
    // 500 → kind 'http' (bukan 'network'), status diteruskan untuk handle UI.
    expect(err).toMatchObject({ kind: "http", status: 500 });
    expect(logoutSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("onUnauthorized(null) melepas handler — 401 tidak lagi memanggil callback", async () => {
    setAuthToken("tok-detach");
    onUnauthorized(null); // lepas handler
    queue.push({ status: 401, body: { success: false, message: "Unauthenticated." } });

    await expect(api.get("/auth/me")).rejects.toMatchObject({ kind: "http", status: 401 });
    // Token tetap dibersihkan & redirect tetap jalan (safety), tapi callback
    // user tidak dipanggil karena sudah dilepas.
    expect(getStoredToken()).toBeNull();
    expect(assignSpy).toHaveBeenCalledWith("/login");
  });
  it("api.get(url, { params }) mengirim query string", async () => {
    ok({ success: true, data: [], message: null, meta: null });
    await api.get("/wfh/reports", { params: { date: "2026-10-31", per_page: 25 } });
    expect(requests[0]?.params).toEqual({ date: "2026-10-31", per_page: 25 });
  });

  it("api.del meng-unwrap envelope DELETE (kontrak WFH 200 ber-envelope)", async () => {
    ok({ success: true, data: null, message: "Laporan WFH dihapus." });
    const result = await api.del("/wfh/reports/3");
    expect(requests[0]?.method).toBe("delete");
    expect(result.data).toBeNull();
    expect(result.message).toBe("Laporan WFH dihapus.");
  });

  it("api.patch meng-unwrap envelope PATCH", async () => {
    ok({ success: true, data: { id: 1, status: "approved" }, message: "Disetujui." });
    const result = await api.patch<{ id: number; status: string }>("/wfh/reports/1", { status: "approved" });
    expect(requests[0]?.method).toBe("patch");
    expect(JSON.parse(requests[0]?.data as string)).toEqual({ status: "approved" });
    expect(result.data).toEqual({ id: 1, status: "approved" });
  });

  it("api.putForm memakai httpClient.putForm multipart dan meng-unwrap", async () => {
    const form = new FormData();
    form.append("report_date", "2026-10-31");
    ok({ success: true, data: { id: 7 }, message: "Laporan dibuat." });
    const result = await api.putForm<{ id: number }>("/wfh/reports/7", form);
    expect(requests[0]?.method).toBe("put");
    expect(requests[0]?.data).toBe(form);
    expect(result.data).toEqual({ id: 7 });
  });

  it("api.del error mapping → reject ApiError", async () => {
    queue.push({ status: 422, body: { success: false, message: "Gagal.", errors: { id: ["tidak valid"] } } });
    const err = await api.del("/wfh/reports/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: "validation", status: 422 });
  });
 });

describe("api/client — blob decode + tanpa teks axios + label field (ui-feedback T2)", () => {
  it("HTTP 422 dengan responseBody Blob → pesan server, bukan teks axios", async () => {
    const blob = new Blob(
      [JSON.stringify({ success: false, message: "Anda belum mengatur tanda tangan. Atur tanda tangan terlebih dahulu sebelum mengekspor PDF." })],
      { type: "application/json" },
    );
    queue.push({ status: 422, body: blob });

    const err = await api.get("/wfh/reports/7/pdf").catch((e: unknown) => e);

    expect(err).toMatchObject({
      kind: "validation",
      status: 422,
      message: "Anda belum mengatur tanda tangan. Atur tanda tangan terlebih dahulu sebelum mengekspor PDF.",
    });
    expect(err instanceof Error && err.message).not.toMatch(/Request failed/);
  });

  it("blob 4xx tanpa JSON → copy per kind, bukan teks axios", async () => {
    queue.push({ status: 403, body: new Blob(["<html>forbidden</html>"], { type: "text/html" }) });

    const err = await api.get("/admin/wfh/teams/3/pdf").catch((e: unknown) => e);

    expect(err).toMatchObject({ kind: "http", status: 403, message: "Anda tidak memiliki izin." });
    expect(err instanceof Error && err.message).not.toMatch(/Request failed/);
  });

  it("network error → message copy, bukan 'Network Error'", async () => {
    httpClient.defaults.adapter = (config) =>
      Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK, config));

    const err = await api.get("/auth/me").catch((e: unknown) => e);

    expect(err).toMatchObject({ kind: "network", message: "Koneksi bermasalah, coba lagi." });
  });

  it("decodeBlobEnvelope: envelope JSON → {message, errors}; non-JSON → {message:'', errors:null}", async () => {
    const decoded = await decodeBlobEnvelope(
      new Blob(
        [JSON.stringify({ success: false, message: "Gagal.", errors: { photo: ["Ukuran foto maksimal 2MB."] } })],
        { type: "application/json" },
      ),
    );
    expect(decoded).toEqual({ message: "Gagal.", errors: { photo: ["Ukuran foto maksimal 2MB."] } });

    const raw = await decodeBlobEnvelope(new Blob(["<html>oops</html>"], { type: "text/html" }));
    expect(raw).toEqual({ message: "", errors: null });
  });

  it("decodeBlobEnvelope: body kosong → {message:'', errors:null} (degraded, ship #13)", async () => {
    const empty = await decodeBlobEnvelope(new Blob([], { type: "application/json" }));
    expect(empty).toEqual({ message: "", errors: null });
  });

  it("decodeBlobEnvelope: JSON non-object (42, null, string) → {message:'', errors:null}", async () => {
    for (const body of ["42", "null", '"teks"', "true"]) {
      const decoded = await decodeBlobEnvelope(new Blob([body], { type: "application/json" }));
      expect(decoded).toEqual({ message: "", errors: null });
    }
  });

  it("decodeBlobEnvelope: errors malformed (nilai non-array) → errors null, tak meledak", async () => {
    const decoded = await decodeBlobEnvelope(
      new Blob([JSON.stringify({ message: "Gagal.", errors: { photo: "bukan-array" } })], {
        type: "application/json",
      }),
    );
    expect(decoded).toEqual({ message: "Gagal.", errors: null });
  });

  it("decodeBlobEnvelope: errors berisi elemen non-string → errors null", async () => {
    const decoded = await decodeBlobEnvelope(
      new Blob([JSON.stringify({ message: "Gagal.", errors: { photo: [42] } })], {
        type: "application/json",
      }),
    );
    expect(decoded).toEqual({ message: "Gagal.", errors: null });
  });

  it("blob 5xx (HTML error page) → copy server, bukan teks axios (degraded)", async () => {
    queue.push({ status: 500, body: new Blob(["<html>Whoops</html>"], { type: "text/html" }) });

    const err = await api.get("/wfh/reports/7/pdf").catch((e: unknown) => e);

    expect(err).toMatchObject({ kind: "http", status: 500, message: UI_ERROR_COPY.server });
    expect(err instanceof Error && err.message).not.toMatch(/Request failed/);
  });

  it("fieldErrorMessages: kunci internal → label Indonesia; files.N → 'Lampiran N+1'; kunci tak dikenal dijatuhkan", () => {
    expect(
      fieldErrorMessages({ photo: ["Ukuran foto maksimal 2MB."], "files.0": ["Format file harus JPG, JPEG, atau PNG."] }),
    ).toEqual({
      "Foto absensi": "Ukuran foto maksimal 2MB.",
      "Lampiran 1": "Format file harus JPG, JPEG, atau PNG.",
    });
    // Kunci tak dikenal tidak diteruskan mentah; entri tanpa pesan juga dijatuhkan.
    expect(fieldErrorMessages({ "signature.dimensions": ["terlalu kecil"], photo: [] })).toEqual({});
    expect(fieldErrorMessages(null)).toEqual({});
  });

  it("FIELD_LABELS memuat kunci field yang dipakai form", () => {
    for (const key of ["photo", "signature", "files", "session", "value", "name", "email", "nip", "role", "phone", "position", "rank"]) {
      expect(FIELD_LABELS[key]).toBeTruthy();
    }
  });
});
