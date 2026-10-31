/**
 * Kontrak tipe API — sumber tunggal: `postman/specs/openapi.yaml`.
 * Jangan menambah field yang tidak ada di skema; backend adalah sumber kebenaran
 * (`app/Support/Http/ApiResponse.php` untuk bentuk envelope).
 */

// ── Envelope wrappers ───────────────────────────────────────────────

/**
 * Bentuk semua respons sukses dari `ApiResponse::ok|created|paginated`.
 * `data` null untuk aksi tanpa payload (logout), `message` null bila backend
 * tidak mengirim pesan, `meta` null untuk respons non-paginated.
 */
export interface Envelope<T> {
  success: true;
  data: T | null;
  message: string | null;
  meta?: PaginationMeta | null;
}

/** Respons gagal (`ApiResponse::fail`). `errors` hanya ada pada 422 validasi. */
export interface ErrorResponse {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

/** `ApiResponse::paginated` — `per_page` ikut dikirim backend. */
export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page?: number;
  total: number;
}

// ── Shared resources ────────────────────────────────────────────────

/** `#/components/schemas/TeamNested` */
export interface TeamNested {
  id: number;
  name: string;
  leader?: { id: number; name: string } | null;
  field?: { id: number; name: string } | null;
}

/** `#/components/schemas/AuthUser` — payload user dari login & `/auth/me`. */
export interface AuthUser {
  id: number;
  name: string;
  nip: string;
  email: string;
  rank?: string | null;
  position?: string | null;
  phone?: string | null;
  signature_path?: string | null;
  signature_url?: string | null;
  must_change_password: boolean;
  is_active: boolean;
  roles: string[];
  permissions: string[];
  team?: TeamNested | null;
}

/**
 * `#/components/schemas/ProfileData` — sejak v6.6.0 semua endpoint user
 * (login, `/auth/me`, `GET|PUT /profile`) memakai `UserResource` yang sama,
 * jadi strukturnya identik dengan `AuthUser`.
 */
export type ProfileData = AuthUser;

/** `#/components/schemas/UpdateProfileRequest` — field boleh null untuk mengosongkan. */
export interface UpdateProfileRequest {
  phone?: string | null;
  position?: string | null;
  rank?: string | null;
}

// ── Auth ────────────────────────────────────────────────────────────

/** `#/components/schemas/LoginRequest` */
export interface LoginRequest {
  email: string;
  password: string;
}

/** `#/components/schemas/LoginResponse` — isi `data` pada `POST /auth/login`. */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** `#/components/schemas/ChangePasswordRequest` */
export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
}

/** `#/components/schemas/ForgotPasswordRequest` */
export interface ForgotPasswordRequest {
  email: string;
}

/** `#/components/schemas/VerifyOtpRequest` — kode OTP 6 digit, field `code`. */
export interface VerifyOtpRequest {
  email: string;
  code: string;
}

/** `#/components/schemas/ResetPasswordRequest` */
export interface ResetPasswordRequest {
  reset_token: string;
  new_password: string;
  new_password_confirmation: string;
}

