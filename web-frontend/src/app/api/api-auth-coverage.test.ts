import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.join(process.cwd(), "src", "app", "api");

const AUTH_MARKERS = [
  "requireResolvedWorkspaceAccess",
  "requireWorkspaceAccess",
  "requireAdminWorkspaceAccess",
  "requireWorkspaceSession",
  "verifyTrialSmsCode",
  "requestTrialSmsCode",
  "handleOkkiWebhook",
];

const EXPLICIT_PUBLIC_ROUTES = new Set([
  "health/route.ts",
  "trial-access/send-code/route.ts",
  "trial-access/verify-code/route.ts",
  "webhooks/okki/route.ts",
]);

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(entryPath);
    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

describe("API workspace coverage", () => {
  it("requires every API route to resolve workspace context or be listed as an explicit public/signed exception", () => {
    const missingAuth = routeFiles(API_ROOT)
      .map((file) => path.relative(API_ROOT, file))
      .filter((route) => {
        if (EXPLICIT_PUBLIC_ROUTES.has(route)) return false;
        const source = fs.readFileSync(path.join(API_ROOT, route), "utf-8");
        return !AUTH_MARKERS.some((marker) => source.includes(marker));
      });

    expect(missingAuth).toEqual([]);
  });
});
