/**
 * axios client — satu titik unwrap envelope & satu titik penanganan 401
 * (docs/SPEC-frontend-phase1.md: "Envelope di-unwrap satu tempat saja").
 *
 * `api` dipakai modul-modul `api/*.ts`; hasilnya `Unwrapped<T>` (data sudah
 * dilepas dari envelope). Komponen tidak boleh mengimpor axios langsung.
 *
 * Token disimpan di `localStorage["auth_token"]` (satu-satunya tempat
 * yang disepakati spesifikasi); interceptor membacanya per request sehingga
 * rehydrate setelah refresh otomatis terpakai.
 */

import axios from "axios";
import type {
  AxiosError,
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import type { Envelope, PaginationMeta } from "@/api/types";
import { UI_ERROR_COPY } from "@/lib/ui-errors";

/** Key localStorage tempat bearer token disimpan (kontrak spesifikasi). */
export const AUTH_TOKEN_KEY = "auth_token";

/**
 * Hasil unwrap envelope: komponen menerima data mentah + message/meta,
 * bukan bentuk `Envelope<T>` mentah.
 */
export interface Unwrapped<T> {
  data: T | null;
  message: string | null;
  meta: PaginationMeta | null;
}

/**
 * Hasil mutasi: payload resource + `message` envelope (selalu string, `""`
 * bila server tidak mengirim pesan). Halaman memakainya langsung untuk
 * `toast.success`, tanpa membuka `ApiError`/axios (spec ui-feedback T4).
 */
export type Messaged<T> = T & { message: string };

/** Kategori error setelah interceptor — menentukan cara UI menampilkannya. */
export type ApiErrorKind = "http" | "api" | "validation" | "network";

/** Error tunggal yang dilempar semua request; `kind` memandu handling UI. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly errors: Record<string, string[]> | null;
  /** Body respons mentah (mis. Blob untuk responseType blob) untuk decode pesan. */
  readonly responseBody: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number | null;
      errors?: Record<string, string[]> | null;
      responseBody?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = options.status ?? null;
    this.errors = options.errors ?? null;
    this.responseBody = options.responseBody ?? null;
  }
}

/**
 * Endpoint yang kontraknya menjamin `data` ada; envelope tanpa `data` = bug
 * backend dan harus gagal-nyata (bukan `null` yang diam-diam dirender UI).
 * Satu definisi dipakai semua modul API (auth, profile, dst.).
 */
export function requireData<T>(value: T | null, endpoint: string): T {
  if (value === null) {
    throw new Error(`Respons ${endpoint} tidak berisi data.`);
  }
  return value;
}

/** Label Indonesia untuk kunci field internal yang dikenal UI (spec ui-feedback S6). */
export const FIELD_LABELS: Record<string, string> = {
  photo: "Foto absensi",
  signature: "Tanda tangan",
  files: "Lampiran",
  session: "Sesi absensi",
  value: "Nilai setting",
  name: "Nama",
  email: "Email",
  nip: "NIP",
  role: "Peran",
  phone: "Telepon",
  position: "Jabatan",
  rank: "Pangkat",
};

/** Baca body Blob sebagai teks (FileReader, agar jalan di jsdom juga). */
function blobToText(blob: Blob): Promise<string> {
  const { promise, resolve } = Promise.withResolvers<string>();
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result ?? ""));
  reader.onerror = () => resolve("");
  reader.readAsText(blob);
  return promise;
}

/** Ambil `message`/`errors` dari envelope JSON dalam body Blob 4xx. */
export async function decodeBlobEnvelope(
  blob: Blob,
): Promise<{ message: string; errors: Record<string, string[]> | null }> {
  const text = await blobToText(blob);
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return { message: "", errors: null };
    }
    const message =
      "message" in parsed && typeof parsed.message === "string"
        ? parsed.message
        : "";
    const errors =
      "errors" in parsed &&
      typeof parsed.errors === "object" &&
      parsed.errors !== null
        ? (parsed.errors as Record<string, string[]>)
        : null;
    return { message, errors };
  } catch {
    return { message: "", errors: null };
  }
}

/** Ambil pesan pertama tiap field; entri tanpa pesan dijatuhkan. */
function firstMessages(errors: Record<string, string[]> | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors ?? {})) {
    const first = messages[0];
    if (first) out[field] = first;
  }
  return out;
}

/**
 * Kunci field internal → label manusia. `files.N` → "Lampiran N+1"; kunci
 * tidak dikenal DIBUANG (tidak diteruskan mentah ke UI — spec ui-feedback S6).
 */
export function fieldErrorMessages(
  errors: Record<string, string[]> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(firstMessages(errors))) {
    const indexed = /^(.+)\.(\d+)$/.exec(field);
    if (indexed) {
      const [, base, index] = indexed;
      const label = base ? FIELD_LABELS[base] : undefined;
      if (label && index) out[`${label} ${Number(index) + 1}`] = message;
    } else {
      const label = FIELD_LABELS[field];
      if (label) out[label] = message;
    }
  }
  return out;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: "/api",
  headers: { Accept: "application/json" },
});

// ── Token: storage + header ─────────────────────────────────────────

export function getStoredToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

/** Set/clear token: persist ke localStorage (sumber kebenaran) untuk interceptor. */
export function setAuthToken(token: string | null): void {
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  else window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

/** Titik sambung Redux — di-set dari store/authSlice (menghindari siklus impor). */
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Daftarkan callback yang dipanggil saat 401 memaksa logout (pass null untuk lepas). */
export function onUnauthorized(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

const REDIRECT_LOGIN = "/login";

httpClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

// ── Response: unwrap + error mapping ────────────────────────────────

/** Envelope yang success:false tetap dikirim backend dengan HTTP 200/201. */
function isFailureEnvelope(
  body: unknown,
): body is { success: false; message: string } {
  if (typeof body !== "object" || body === null) return false;
  if (!("success" in body)) return false;
  return body.success === false;
}

/**
 * Unwrap `Envelope<T>` → `Unwrapped<T>`. Respons non-envelope (mis. resource
 * tanpa envelope di kontrak) diteruskan apa adanya sebagai `data`.
 */
function unwrap<T>(body: unknown): Unwrapped<T> {
  if (typeof body === "object" && body !== null && "success" in body) {
    const { success, data, message, meta } = body as Partial<Envelope<T>>;
    if (success === true) {
      return { data: data ?? null, message: message ?? null, meta: meta ?? null };
    }
  }
  return { data: body as T, message: null, meta: null };
}

/** Copy aman bila body tidak berisi pesan domain dari server (ui-feedback S5/S6). */
function fallbackCopy(status: number | null): string {
  if (status === null) return UI_ERROR_COPY.network;
  if (status === 422) return UI_ERROR_COPY.validation;
  if (status >= 500) return UI_ERROR_COPY.server;
  if (status === 401) return UI_ERROR_COPY.auth;
  if (status === 403) return UI_ERROR_COPY.forbidden;
  if (status === 404) return UI_ERROR_COPY.notFound;
  if (status === 409) return UI_ERROR_COPY.conflict;
  if (status === 429) return UI_ERROR_COPY.rateLimited;
  return UI_ERROR_COPY.unknown;
}

async function toApiError(error: AxiosError): Promise<ApiError> {
  const status: number | null = error.response?.status ?? null;
  const body: unknown = error.response?.data;

  if (
    status === 401 &&
    getStoredToken() &&
    // Bandingkan header Authorization yang DIKIRIM dengan token aktif sekarang:
    // 401 dari request in-flight yang dikirim DENGAN token lama (basi, keluar
    // sebelum re-login) tidak boleh menghapus token baru (ship review #4:
    // logout race setelah re-login).
    error.config?.headers?.Authorization === `Bearer ${getStoredToken()}`
  ) {
    // Debounce: banyak request paralel yang sama-sama 401 cukup memicu satu
    // logout-redirect — `setAuthToken(null)` membuat panggilan berikutnya
    // gagal guard `getStoredToken()` secara alami.
    setAuthToken(null);
    unauthorizedHandler?.();
    window.location.assign(REDIRECT_LOGIN);
  }

  const hasServerMessage =
    typeof body === "object" && body !== null && "message" in body &&
    typeof body.message === "string" && body.message.length > 0;
  const decoded = body instanceof Blob ? await decodeBlobEnvelope(body) : null;
  const serverMessage = decoded?.message || (hasServerMessage ? String(body.message) : "");
  const message = serverMessage || fallbackCopy(status);
  const errors =
    decoded?.errors ??
    (typeof body === "object" && body !== null && "errors" in body &&
    typeof body.errors === "object" && body.errors !== null
      ? (body.errors as Record<string, string[]>)
      : null);

  if (status === 422) {
    return new ApiError("validation", message, { status, errors, responseBody: body });
  }
  if (status !== null) {
    return new ApiError("http", message, { status, responseBody: body });
  }
  return new ApiError("network", message);
}

httpClient.interceptors.response.use(
  (response: AxiosResponse) => {
    if (isFailureEnvelope(response.data)) {
      // Envelope gagal tanpa status error (kontrak login 200 tidak memakai ini,
      // tapi backend bisa mengirim success:false pada 200/201 di masa depan).
      return Promise.reject(new ApiError("api", response.data.message));
    }
    return response;
  },
  (error: AxiosError) =>
    // `toApiError` async hanya saat perlu decode Blob; interceptor tetap
    // mengembalikan Promise yang reject dengan ApiError.
    toApiError(error).then((apiError) => Promise.reject(apiError)),
);

/**
 * Instance tingkat aplikasi: resolve `Unwrapped<T>` (envelope sudah dilepas),
 * reject `ApiError`.
 */
export const api = {
  async get<T>(url: string, options: { params?: Record<string, unknown> } = {}): Promise<Unwrapped<T>> {
    const res = await httpClient.get<unknown, AxiosResponse<unknown>>(url, { params: options.params });
    return unwrap<T>(res.data);
  },
  async post<T>(url: string, body?: unknown): Promise<Unwrapped<T>> {
    const res = await httpClient.post<unknown, AxiosResponse<unknown>>(url, body);
    return unwrap<T>(res.data);
  },
  async put<T>(url: string, body?: unknown): Promise<Unwrapped<T>> {
    const res = await httpClient.put<unknown, AxiosResponse<unknown>>(url, body);
    return unwrap<T>(res.data);
  },
  async patch<T>(url: string, body?: unknown): Promise<Unwrapped<T>> {
    const res = await httpClient.patch<unknown, AxiosResponse<unknown>>(url, body);
    return unwrap<T>(res.data);
  },
  async del<T>(url: string): Promise<Unwrapped<T>> {
    const res = await httpClient.delete<unknown, AxiosResponse<unknown>>(url);
    return unwrap<T>(res.data);
  },
  async postForm<T>(url: string, form: FormData): Promise<Unwrapped<T>> {
    const res = await httpClient.postForm<unknown, AxiosResponse<unknown>>(url, form);
    return unwrap<T>(res.data);
  },
  async putForm<T>(url: string, form: FormData): Promise<Unwrapped<T>> {
    const res = await httpClient.putForm<unknown, AxiosResponse<unknown>>(url, form);
    return unwrap<T>(res.data);
  },
};
