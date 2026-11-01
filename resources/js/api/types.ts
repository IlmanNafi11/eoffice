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

// ── WFH Team Reports ────────────────────────────────────────────────

/** `#/components/schemas/WfhTeamReport` — resource laporan WFH tim. */
export interface WfhTeamReport {
  id: number;
  team_id: number;
  report_date: string;
  status: WfhReportStatus;
  created_by: number;
  supervisor_id?: number | null;
  maker_signed_at?: string | null;
  supervisor_signed_at?: string | null;
  reject_reason?: string | null;
  verification_token?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  team?: TeamNested | null;
  creator?: WfhReportUser | null;
  supervisor?: WfhReportUser | null;
}

/** `#/components/schemas/TeamResource` — baris flat dropdown `GET /teams`. */
export interface TeamResource {
  id: number;
  name: string;
  leader_id: number | null;
  field_id: number | null;
}

/** `#/components/schemas/CreateTeamReportRequest` — `{team_id, report_date}`. */
export interface CreateTeamReportInput {
  team_id: number;
  report_date: string;
}

/** `#/components/schemas/RejectTeamReportRequest` — alasan wajib. */
export interface RejectTeamReportInput {
  reason: string;
}

/** Query `GET /admin/wfh/team-reports` — `per_page` (default 15, max 100). */
export interface ListTeamReportsQuery {
  per_page?: number;
  page?: number;
}

/**
 * Bentuk list team reports yang benar secara ground truth (E2E 2026-11-01):
 * backend membungkus paginator dalam `ApiResponse::paginated` —
 * `{success, data: WfhTeamReport[], meta: PaginationMeta}` (envelope), BUKAN
 * paginator raw tanpa `success` seperti deskripsi lama `TeamReportListResponse`.
 * Dipetakan ke `{ reports, meta }` di `api/wfh-team.ts`.
 */
// ── WFH Monitoring ──────────────────────────────────────────────────

/**
 * `#/components/schemas/MonitoringUser` — satu baris pada papan monitoring.
 * Bagian dari allowlist kolom `monitoringUserQuery` di backend: hanya kolom
 * publik, tanpa PII/timestamp (`select(['id', 'name', 'nip', 'email', 'rank',
 * 'position', 'phone', 'is_active', 'team_id'])->with('team:id,name')`).
 */
export interface MonitoringUser {
  id: number;
  name: string;
  nip: string;
  email: string;
  rank?: string | null;
  position?: string | null;
  phone?: string | null;
  is_active: boolean;
  team_id: number | null;
  team?: { id: number; name: string } | null;
}

/**
 * `#/components/schemas/WfhMonitoringResponse.data` — papan monitoring harian.
 * `team_id`/`field_id` selalu hadir (required di skema) tapi nullable: scope
 * murni keputusan server — admin = keduanya null, kepala bidang = `field_id`
 * terisi (`team_id` null), kepala tim = `team_id` terisi (`field_id` null).
 */
export interface WfhMonitoringData {
  date: string;
  team_id: number | null;
  field_id: number | null;
  not_checked_in: MonitoringUser[];
  no_report: MonitoringUser[];
}

/**
 * Query `GET /admin/wfh/reports` — semua filter opsional; presedensi
 * `date_from`/`date_to` > `date` > `month` diputuskan backend (jangan
 * dipaksakan client). `page` dibaca `paginate()` Laravel walau tak
 * dideklarasikan openapi (meta `current_page` membuktikannya).
 */
export interface ListAdminReportsQuery {
  per_page?: number;
  status?: WfhReportStatus;
  team_id?: number;
  date_from?: string;
  date_to?: string;
  date?: string;
  month?: string;
  page?: number;
}

// ── Change Package ─────────────────────────────────────────────────

/** Status paket perubahan — union literal, BUKAN `string` bebas. */
export type ChangePackageStatus = "draft" | "pending" | "approved" | "rejected";

/**
 * Status implementasi — union literal penuh tabel `change_implementations`
 * (migrasi `..._create_change_management_tables.php` + `CHILD_STATUS_MIRROR`
 * `draft|submitted|completed|rejected`); openapi hanya mencantumkan contoh
 * `submitted`/`completed`, nilai aktual ditentukan server.
 */
export type ChangeImplementationStatus = "draft" | "submitted" | "completed" | "rejected";

/**
 * `#/components/schemas/ChangeType` — referensi data `GET /change-types`.
 */
export interface ChangeType {
  id: number;
  name: string;
}

/**
 * `#/components/schemas/InitiationResource.field` — nested `{id, name}`.
 */
export interface PackageField {
  id: number;
  name: string;
}

/**
 * `#/components/schemas/InitiationResource.initiator` — nested user ringkas.
 * `signature_url` dipancarkan resource (`SignaturePath::urlFor`) walau tak
 * terdokumentasi openapi (drift kontrak v6.x; bagian UI profil & report PDF).
 */
export interface PackageInitiator {
  id: number;
  name: string;
  nip: string;
  position?: string | null;
  rank?: string | null;
  signature_url?: string | null;
}

/**
 * `#/components/schemas/InitiationResource` — resource inisiasi paket.
 * `status` kitai ke `ChangePackageStatus`; `review_status` string bebas
 * (nilai `approved|rejected|diterima|ditolak|revisi` server-side).
 */
export interface PackageInitiation {
  id: number;
  field_id: number;
  initiator_id: number;
  reviewer_id?: number | null;
  doc_number: string;
  initiation_date?: string | null;
  needed_by_date?: string | null;
  description: string;
  reason: string;
  status: ChangePackageStatus;
  review_status?: string | null;
  reviewed_at?: string | null;
  initiator_signed_at?: string | null;
  created_at?: string | null;
  field?: PackageField | null;
  initiator?: PackageInitiator | null;
}

/**
 * `#/components/schemas/ImplementationResource.attachments[]` — lampiran
 * paket perubahan. HANYA `id`/`url`/`sort_order`: `url` menunjuk
 * `attachments.download` (bearer), `path` internal tidak pernah diekspos
 * (ship review S2/S3).
 */
export interface PackageAttachment {
  id: number;
  url: string;
  sort_order: number;
}

/**
 * `#/components/schemas/ImplementationResource` — resource implementasi.
 * `cost_amount` dan `cost_needed` di-cast model (`boolean` + `decimal:2`);
 * `change_types`/`attachments` hanya hadir saat relasi di-load (show).
 */
export interface PackageImplementation {
  id: number;
  change_initiation_id: number;
  priority?: string | null;
  impact?: string | null;
  production_impact?: string | null;
  required_effort?: string | null;
  cost_needed?: boolean | null;
  cost_amount?: string | null;
  resources?: string | null;
  test_plan?: string | null;
  evaluator_id?: number | null;
  evaluator_signed_at?: string | null;
  review_status?: string | null;
  review_response?: string | null;
  execution_date?: string | null;
  reviewer_id?: number | null;
  reviewer_signed_at?: string | null;
  implementation_result?: string | null;
  release_date?: string | null;
  responsible_id?: number | null;
  responsible_signed_at?: string | null;
  status: ChangeImplementationStatus;
  change_types?: ChangeType[];
  attachments?: PackageAttachment[];
}

/**
 * `#/components/schemas/ChangePackageResource` — resource paket perubahan.
 * `implementation` nullable; relasi belum di-load pada list boleh absen.
 */
export interface ChangePackage {
  initiation: PackageInitiation;
  implementation?: PackageImplementation | null;
}

/**
 * `#/components/schemas/ChangePackageDraftRequest.implementation` — semua prop
 * nullable (backend `nullable`). `evaluator_id` TIDAK jadi masukan UI
 * (Resolved #1: diset server, bukan input client).
 */
export interface PackageImplementationDraftInput {
  priority?: "normal" | "emergency" | null;
  impact?: "Minor" | "Mayor" | null;
  change_type_ids?: number[] | null;
  test_plan?: string | null;
  execution_date?: string | null;
  release_date?: string | null;
  implementation_result?: string | null;
  production_impact?: string | null;
  required_effort?: string | null;
  cost_needed?: boolean | null;
  cost_amount?: string | null;
  resources?: string | null;
}

/**
 * `#/components/schemas/ChangePackageDraftRequest.initiation` — `field_id`
 * wajib (create), `needed_by_date` nullable; `description`+`reason` wajib.
 */
export interface PackageInitiationInput {
  field_id: number;
  needed_by_date?: string | null;
  description: string;
  reason: string;
}

/**
 * `#/components/schemas/ChangePackageDraftRequest` — payload POST/PUT draft.
 * `implementation` opsional (draft bisa tanpa impl).
 */
export interface PackageDraftInput {
  initiation: PackageInitiationInput;
  implementation?: PackageImplementationDraftInput;
}

/**
 * `#/components/schemas/ChangePackageSubmitRequest.implementation` — semua 7
 * field required (`priority`, `impact`, `change_type_ids`, `test_plan`,
 * `execution_date`, `release_date`, `implementation_result`) plus opsional
 * nullable lain; `change_type_ids` minimal 1 (backend `min:1`).
 */
export interface PackageImplementationSubmitInput {
  priority: "normal" | "emergency";
  impact: "Minor" | "Mayor";
  change_type_ids: number[];
  test_plan: string;
  execution_date: string;
  release_date: string;
  implementation_result: string;
  production_impact?: string | null;
  required_effort?: string | null;
  cost_needed?: boolean | null;
  cost_amount?: string | null;
  resources?: string | null;
}

/**
 * `#/components/schemas/ChangePackageSubmitRequest` — payload POST /submit
 * (full-payload; `field_id`, `needed_by_date`, `description`, `reason` wajib).
 */
export interface PackageSubmitInput {
  initiation: {
    field_id: number;
    needed_by_date: string;
    description: string;
    reason: string;
  };
  implementation: PackageImplementationSubmitInput;
}

/**
 * Query `GET /changes` — semua opsional; `status` dibatasi skema server
 * (`draft|pending|approved|rejected`); `field_id` ditambahkan controller
 * walau tak terdokumentasi (batasan scope tim/bidang).
 */
export interface ListPackagesQuery {
  per_page?: number;
  page?: number;
  status?: ChangePackageStatus;
  field_id?: number;
}
