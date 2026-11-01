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


// ── WFH Reports (Phase 2) ────────────────────────────────────────────

/** Status laporan WFH — union literal, BUKAN `string` bebas. */
export type WfhReportStatus = "draft" | "pending" | "approved" | "rejected";

/** Nama sesi absensi WFH — default Setting `wfh_sessions`. */
export type WfhSession = "pagi" | "siang" | "sore";

/** `#/components/schemas/ReportUserNested` — pembuat/atasan pada laporan. */
export interface WfhReportUser {
  id: number;
  name: string;
  nip: string;
  position?: string | null;
  rank?: string | null;
}

/**
 * `#/components/schemas/WfhReportActivity.links[]` — `sort_order` hadir saat
 * dipancarkan lewat `WfhReportResource` (index/show), tapi DIHILANGKAN pada
 * respons sub-resource POST/PUT activity (asimetri kontrak v6.0.0).
 */
export interface WfhReportLink {
  id?: number;
  url: string;
  sort_order?: number;
}

/** `#/components/schemas/WfhReportActivity` — satu baris kegiatan. */
export interface WfhReportActivity {
  id?: number;
  activity: string;
  start_time?: string | null;
  end_time?: string | null;
  sort_order?: number;
  links?: WfhReportLink[];
}

/**
 * Baris absensi dalam `WfhReportResource.attendances[]` — hanya dipancarkan
 * saat relasi `attendances` di-load (endpoint show), tidak ada di list.
 */
export interface WfhAttendance {
  id?: number;
  session: WfhSession;
  checked_in?: boolean;
  photo_url?: string | null;
}

/** `#/components/schemas/WfhReportResource` — resource laporan WFH personal. */
export interface WfhReport {
  id: number;
  user_id: number;
  report_date: string;
  status: WfhReportStatus;
  maker_signed_at?: string | null;
  supervisor_signed_at?: string | null;
  reject_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  user?: WfhReportUser | null;
  supervisor?: WfhReportUser | null;
  activities?: WfhReportActivity[];
  activity_count?: number;
  attendances?: WfhAttendance[];
}

/** `#/components/schemas/WfhSessionConfigResponse.data` — sesi + hari boleh WFH. */
export interface WfhSessionConfig {
  sessions: WfhSession[];
  allowed_days: number[];
}

/** Query `GET /wfh/reports` — filter opsional; `date` menang atas `month`. */
export interface ListWfhReportsQuery {
  per_page?: number;
  date?: string;
  month?: string;
  /**
   * Halaman paginator — dibaca Laravel `paginate()` dari query `page` walau
   * tidak dideklarasikan di openapi.yaml (meta `current_page` membuktikannya).
   */
  page?: number;
}

/** `#/components/schemas/ReportActivityInput` — aktivitas pada create (link = URI string[]). */
export interface ReportActivityInput {
  activity: string;
  start_time?: string;
  end_time?: string;
  links?: string[] | null;
}

/**
 * `#/components/schemas/StoreReportRequest` — payload POST /wfh/reports
 * (multipart). `status` hanya "draft" (default) atau "submit".
 */
export interface CreateWfhReportInput {
  report_date: string;
  status?: "draft" | "submit";
  activities?: ReportActivityInput[] | null;
  attendances?: Partial<Record<WfhSession, { photo: Blob }>> | null;
}

/** Link id-diff pada `StoreActivityRequest.links[]`. */
export interface ActivityLinkInput {
  id?: number | null;
  url: string;
}

/** `#/components/schemas/StoreActivityRequest` — POST activity sub-resource. */
export interface ActivityInput {
  activity: string;
  start_time?: string | null;
  end_time?: string | null;
  links?: ActivityLinkInput[] | null;
}

/** PUT activity — sama seperti POST, plus `id` (id-diff link, skema tunggal). */
export interface ActivityUpdateInput extends ActivityInput {
  id?: number | null;
}

/** `PATCH /wfh/reports/{report}/activities/reorder` — urutan id persis. */
export interface ReorderInput {
  ids: number[];
}

/** `#/components/schemas/RejectReportRequest` — alasan penolakan wajib. */
export interface RejectReportRequest {
  reason: string;
}

/** `#/components/schemas/AppendAttendanceRequest` — POST attendance sub-resource. */
export interface AttendanceUploadInput {
  session: WfhSession;
  photo: Blob;
}
