import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as button from "@/components/ui/button";
import * as input from "@/components/ui/input";
import * as card from "@/components/ui/card";
import * as label from "@/components/ui/label";
import * as field from "@/components/ui/field";
import * as dialog from "@/components/ui/dialog";
import * as dropdownMenu from "@/components/ui/dropdown-menu";
import * as avatar from "@/components/ui/avatar";
import * as separator from "@/components/ui/separator";
import * as sidebar from "@/components/ui/sidebar";
import * as sheet from "@/components/ui/sheet";
import * as sonner from "@/components/ui/sonner";

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

describe("old scaffold removal (Phase 0 / Task 2)", () => {
  it("deletes the legacy jsx entry, bootstrap, and Root component", () => {
    for (const p of ["resources/js/app.jsx", "resources/js/bootstrap.js", "resources/js/Root.jsx"]) {
      expect(existsSync(resolve(root, p)), `${p} still exists`).toBe(false);
    }
  });

  it("removes the legacy scaffold directories and their .gitkeep placeholders", () => {
    // `components/` survives: it is the shadcn baseline home (`components.json` -> @/components).
    // `hooks/` survives for shadcn-owned helpers only (sidebar ships `use-mobile`);
    // legacy app hooks (`useAuth.ts` and friends) must stay gone.
    // `pages/` also survives from Phase 3 on: the spec's project structure puts
    // feature pages there (`pages/auth/LoginPage.tsx`, ...), so only the legacy
    // siblings (context, layouts, routes, utils) must stay gone. What must NOT
    // return are the legacy scaffold files inside pages/ — asserted below via
    // the entries Phase 1 actually ships.
    for (const dir of ["context", "layouts", "routes", "utils"]) {
      expect(existsSync(resolve(root, `resources/js/${dir}`)), `resources/js/${dir} still exists`).toBe(false);
    }
    expect(existsSync(resolve(root, "resources/js/pages/auth/LoginPage.tsx")), "pages/auth/LoginPage.tsx missing").toBe(true);
    expect(existsSync(resolve(root, "resources/js/hooks/.gitkeep")), "resources/js/hooks/.gitkeep still exists").toBe(false);
    expect(existsSync(resolve(root, "resources/js/components/common")), "resources/js/components/common still exists").toBe(false);
    expect(existsSync(resolve(root, "resources/js/components/layout/.gitkeep")), "layout .gitkeep still exists").toBe(false);
  });

  it("mounts app.tsx from the blade shell with no reference to app.jsx", () => {
    const blade = read("resources/views/app.blade.php");
    expect(blade).toContain("resources/js/app.tsx");
    expect(blade).not.toContain("app.jsx");
  });
});

describe("shadcn/Animate UI component baseline (Phase 0 / Task 3)", () => {
  // components.json pins style "radix-nova", whose registry ships `field`
  // (native form primitives, no react-hook-form) and `sonner` as its toast
  // implementation — the lock reflects what the pinned style distributes.
  const REQUIRED_UI = [
    "button",
    "input",
    "card",
    "label",
    "field",
    "dialog",
    "dropdown-menu",
    "avatar",
    "separator",
    "sidebar",
    "sheet",
    "sonner",
  ] as const;

  it("contains every shell-required UI component in components/ui", () => {
    for (const name of REQUIRED_UI) {
      expect(existsSync(resolve(root, `resources/js/components/ui/${name}.tsx`)), `${name}.tsx missing`).toBe(true);
    }
  });

  it("exports each required component from its module", () => {
    const expected: Array<[Record<string, unknown>, string, string[]]> = [
      [button, "button", ["Button"]],
      [input, "input", ["Input"]],
      [card, "card", ["Card"]],
      [label, "label", ["Label"]],
      [field, "field", ["Field", "FieldLabel", "FieldError", "FieldGroup", "FieldContent", "FieldTitle"]],
      [dialog, "dialog", ["Dialog", "DialogContent", "DialogHeader", "DialogTitle", "DialogTrigger"]],
      [dropdownMenu, "dropdown-menu", ["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuTrigger"]],
      [avatar, "avatar", ["Avatar", "AvatarImage", "AvatarFallback"]],
      [separator, "separator", ["Separator"]],
      [sidebar, "sidebar", ["Sidebar", "SidebarProvider"]],
      [sheet, "sheet", ["Sheet", "SheetContent"]],
      [sonner, "sonner", ["Toaster"]],
    ];
    for (const [mod, name, symbols] of expected) {
      for (const symbol of symbols) {
        expect(mod, `${name} must export ${symbol}`).toHaveProperty(symbol);
      }
    }
  });
});
