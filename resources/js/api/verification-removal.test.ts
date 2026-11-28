/**
 * Guard: the QR document verification module is cut off (SPEC.md
 * wfh-ux-remediation, Task 3). The SPA page, its API client, the route, and
 * the OpenAPI Verification surface must all stay gone.
 *
 * Failures here mean a removed piece is creeping back in.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

const readSource = (relativePath: string) =>
  readFileSync(resolve(ROOT, relativePath), "utf8");

describe("QR verification SPA removal (Task 3)", () => {
  it("no verification module files remain", () => {
    for (const p of [
      "resources/js/api/verification.ts",
      "resources/js/api/verification.test.ts",
      "resources/js/pages/verification/VerifyPage.tsx",
      "resources/js/pages/verification/VerifyPage.test.tsx",
    ]) {
      expect(
        () => readFileSync(resolve(ROOT, p), "utf8"),
        `${p} must not exist`,
      ).toThrow();
    }
  });

  it("router no longer serves /verify/:token", () => {
    expect(readSource("resources/js/routes/index.tsx")).not.toMatch(
      /VerifyPage|verify\/:token/,
    );
  });

  it("api/types.ts no longer declares QrVerification", () => {
    expect(readSource("resources/js/api/types.ts")).not.toMatch(/QrVerification/);
  });

  it("openapi.yaml paths and tags carry no Verification surface", () => {
    const yaml = readSource("postman/specs/openapi.yaml");
    // Indented path/tag keys only — the redirect example text mentioned the
    // path but is gone with the whole operation anyway.
    const pathKeys = [...yaml.matchAll(/^ {2}(\/[^\s:]+):$/gm)].map(([, path]) => path ?? "");
    expect(pathKeys.some((p) => p.startsWith("/api/verify"))).toBe(false);
    const tagNames = [...yaml.matchAll(/^ {2}- name: ([A-Za-z ]+)$/gm)].map(([, name]) => name ?? "");
    expect(tagNames).not.toContain("Verification");
  });
});
