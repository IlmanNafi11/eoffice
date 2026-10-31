import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("tooling wiring (Phase 0 / Task 1)", () => {
  it("root tsconfig compiles resources/js with strict mode", () => {
    const tsconfig = JSON.parse(read("tsconfig.json"));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.include).toContain("resources/js/**/*.ts");
    expect(tsconfig.include).toContain("resources/js/**/*.tsx");
    expect(tsconfig.compilerOptions.paths["@/*"]).toContain("./resources/js/*");
  });

  it("builds the React entry from resources/js/app.tsx", () => {
    const config = read("vite.config.js");
    expect(config).toContain("resources/js/app.tsx");
    expect(config).not.toContain("app.jsx");
  });

  it("serves the blade shell that mounts app.tsx", () => {
    const blade = read("resources/views/app.blade.php");
    expect(blade).toContain("resources/js/app.tsx");
    expect(blade).not.toContain("app.jsx");
  });

  it("declares every required dependency in package.json", () => {
    const pkg = JSON.parse(read("package.json"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of [
      "@animate-ui/react",
      "motion",
      "@reduxjs/toolkit",
      "react-redux",
      "lucide-react",
      "typescript",
      "vitest",
      "@testing-library/react",
      "axios",
      "react-router-dom",
    ]) {
      expect(deps[name], `${name} missing`).toBeDefined();
    }
  });

  it("defines the shadcn/Animate UI baseline via components.json", () => {
    const components = JSON.parse(read("components.json"));
    expect(components.aliases.components).toBe("@/components");
    expect(components.tailwind.css).toBe("resources/css/app.css");
  });

  it("exposes test and typecheck scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts.test).toBe("vitest run");
    expect(pkg.scripts.typecheck).toBe("tsc -p tsconfig.json --noEmit");
  });
});
