/**
 * Test unit modul `@/api/verification` (modul verification).
 *
 * Pola `fakeAdapter` mengikuti `change-package.test.ts`: antrean respons
 * {status, body} + rekaman request. baseURL client = `/api`, jadi URL
 * fungsional `/api/verify/{token}` muncul di rekaman sebagai `/verify/{token}`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { verifyQrToken } from "@/api/verification";
import { ApiError, httpClient, setAuthToken } from "@/api/client";
import type { QrVerification } from "@/api/types";

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
const notFound = (message: string) => queue.push({ status: 404, body: { success: false, message } });

/** Contoh kontrak openapi.yaml `QrVerificationResponse` (WFH Report). */
const wfhVerification: QrVerification = {
  doc_type: "WFH Report",
  doc_number: "WFH-23",
  report_date: "2025-07-11",
  status: "terverifikasi",
  message: "Dokumen telah ditandatangani secara elektronik.",
};

const TOKEN = "a".repeat(64);

describe("api/verification — verifyQrToken (envelope)", () => {
  it("verifyQrToken GET /verify/{token} persis dengan encode, TANPA query params", async () => {
    ok({ success: true, data: wfhVerification, message: null });

    // Karakter aman-hex tetap apa adanya; encodeURIComponent sudah di dalam fungsi.
    const out = await verifyQrToken(TOKEN);

    expect(requests[0]?.method).toBe("get");
    expect(requests[0]?.url).toBe(`/verify/${TOKEN}`);
    expect(requests[0]?.params).toBeUndefined();
    expect(out).toEqual(wfhVerification);
  });

  it("envelope 200 dengan report_date (WFH Report) → QrVerification via requireData", async () => {
    ok({ success: true, data: wfhVerification, message: "Dokumen telah ditandatangani secara elektronik." });

    const out = await verifyQrToken(TOKEN);

    expect(out.doc_type).toBe("WFH Report");
    expect(out.report_date).toBe("2025-07-11");
    expect(out.status).toBe("terverifikasi");
  });

  it("envelope 200 tanpa report_date (Change Initiation) → report_date absent, bukan null palsu", async () => {
    ok({
      success: true,
      data: {
        doc_type: "Change Initiation",
        doc_number: "001/9/1.1/114/2025",
        status: "terverifikasi",
      },
      message: null,
    });

    const out = await verifyQrToken(TOKEN);

    expect(out.doc_type).toBe("Change Initiation");
    expect("report_date" in out && out.report_date !== undefined ? out.report_date : undefined).toBeUndefined();
    expect(out.doc_number).toBe("001/9/1.1/114/2025");
  });

  it("404 envelope success:false → ApiError membawa message server (kind http)", async () => {
    notFound("Token verifikasi tidak ditemukan.");

    const err = await verifyQrToken(TOKEN).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.kind).toBe("http");
    expect(apiErr.status).toBe(404);
    expect(apiErr.message).toBe("Token verifikasi tidak ditemukan.");
  });
});
