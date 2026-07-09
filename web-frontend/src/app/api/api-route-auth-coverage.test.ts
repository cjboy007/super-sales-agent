import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

const allowedPublicRoutes = new Set([
  "src/app/api/health/route.ts",
  "src/app/api/trial-access/send-code/route.ts",
  "src/app/api/trial-access/verify-code/route.ts",
  "src/app/api/webhooks/okki/route.ts",
]);

describe("API route workspace coverage", () => {
  it("keeps every non-public API route behind workspace context checks", () => {
    const routeFiles = globSync("src/app/api/**/route.ts", { cwd: process.cwd(), absolute: true }).sort();
    expect(routeFiles.length).toBeGreaterThan(0);

    const unguarded = routeFiles
      .map((file) => ({
        file: relative(process.cwd(), file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ file }) => !allowedPublicRoutes.has(file))
      .filter(({ source }) =>
        !source.includes("requireWorkspaceAccess") &&
        !source.includes("requireResolvedWorkspaceAccess") &&
        !source.includes("requireWorkspaceSession") &&
        !source.includes("requireAdminWorkspaceAccess")
      )
      .map(({ file }) => file);

    expect(unguarded).toEqual([]);
  });
});
