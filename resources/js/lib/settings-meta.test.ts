/**
 * Unit test `lib/settings-meta` — kamus label/kontrol setting + fallback.
 *
 * Kontrak (spec SPEC-ux-settings.md):
 * - seluruh key seeded (`SettingsSeeder`) tercakup kamus dengan label Indonesia
 *   dan kontrol khusus;
 * - key tak dikenal → fallback `{ label: key, control: { kind: "text" } }`
 *   (tidak pernah disembunyikan);
 * - opsi hari ISO 1..7 (Senin..Minggu) dan sesi fixed {pagi,siang,sore}
 *   dipakai SettingsPage sebagai satu sumber.
 */
import { describe, expect, it } from "vitest";

import {
  WFH_DAYS,
  WFH_SESSIONS,
  settingMeta,
} from "@/lib/settings-meta";

describe("lib/settings-meta — kamus key seeded", () => {
  it("mencakup seluruh key SettingsSeeder dengan label Indonesia", () => {
    const seeded = [
      "wfh_allowed_days",
      "wfh_sessions",
      "wfh_notify_start_time",
      "password_default_admin",
      "password_default_user",
    ];

    for (const key of seeded) {
      const meta = settingMeta(key);
      expect(meta.label, key).not.toBe("");
      expect(meta.label, key).not.toBe(key);
    }
  });

  it("memetakan setiap key ke kontrol khusus yang benar", () => {
    expect(settingMeta("wfh_allowed_days").control).toEqual({ kind: "day-checkbox" });
    expect(settingMeta("wfh_sessions").control).toEqual({ kind: "session-checkbox" });
    expect(settingMeta("wfh_notify_start_time").control).toEqual({ kind: "time" });
    expect(settingMeta("password_default_admin").control).toEqual({ kind: "password" });
    expect(settingMeta("password_default_user").control).toEqual({ kind: "password" });
  });
});

describe("lib/settings-meta — fallback key tak dikenal", () => {
  it("mengembalikan label dari key + kontrol text, tidak pernah undefined", () => {
    const meta = settingMeta("brand_new_setting");

    expect(meta.label).toBe("brand_new_setting");
    expect(meta.control).toEqual({ kind: "text" });
  });

  it("selalu objek meta valid untuk sembarang string", () => {
    for (const key of ["", "x", "a_b_c"]) {
      expect(settingMeta(key).control.kind).toBe("text");
    }
  });
});

describe("lib/settings-meta — opsi hari & sesi (satu sumber)", () => {
  it("WFH_DAYS menutup ISO 1..7 Senin..Minggu", () => {
    expect(WFH_DAYS.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(WFH_DAYS.map((d) => d.label)).toEqual([
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
      "Minggu",
    ]);
  });

  it("WFH_SESSIONS tetap tiga sesi fixed", () => {
    expect(WFH_SESSIONS).toEqual(["pagi", "siang", "sore"]);
  });
});