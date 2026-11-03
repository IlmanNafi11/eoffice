/**
 * Kamus meta pengaturan — satu sumber label + kontrol per key (spec
 * `SPEC-ux-settings.md`). Key tak dikenal selalu punya fallback teks: tidak
 * pernah disembunyikan dari daftar.
 */
export type SettingControl =
  | { kind: "day-checkbox" } // wfh_allowed_days — 7 hari ISO 1..7
  | { kind: "session-checkbox" } // wfh_sessions — pagi/siang/sore fixed
  | { kind: "time" } // wfh_notify_start_time — HH:mm 24-jam
  | { kind: "password" } // password_default_* — masked + konfirmasi
  | { kind: "text" }; // fallback key tak dikenal

export interface SettingMeta {
  label: string;
  description?: string;
  control: SettingControl;
}

/** Hari kerja WFH — label Senin..Minggu, value ISO 1..7. */
export const WFH_DAYS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: "Senin" },
  { value: 2, label: "Selasa" },
  { value: 3, label: "Rabu" },
  { value: 4, label: "Kamis" },
  { value: 5, label: "Jumat" },
  { value: 6, label: "Sabtu" },
  { value: 7, label: "Minggu" },
];

/** Sesi absensi WFH — tiga sesi fixed (tidak ada tambahan bebas). */
export const WFH_SESSIONS = ["pagi", "siang", "sore"] as const;

export const SETTING_META: Record<string, SettingMeta> = {
  wfh_allowed_days: {
    label: "Hari Kerja WFH",
    description: "Hari di mana absensi dan laporan WFH diizinkan.",
    control: { kind: "day-checkbox" },
  },
  wfh_sessions: {
    label: "Sesi Absensi WFH",
    description: "Sesi absensi yang aktif untuk laporan harian.",
    control: { kind: "session-checkbox" },
  },
  wfh_notify_start_time: {
    label: "Jam Mulai Notifikasi WFH",
    description: "Waktu (24 jam) pengingat absensi dikirim.",
    control: { kind: "time" },
  },
  password_default_admin: {
    label: "Password Default Admin",
    control: { kind: "password" },
  },
  password_default_user: {
    label: "Password Default User",
    control: { kind: "password" },
  },
};

/** Meta setting dengan fallback aman untuk key apa pun. */
export function settingMeta(key: string): SettingMeta {
  return SETTING_META[key] ?? { label: key, control: { kind: "text" } };
}