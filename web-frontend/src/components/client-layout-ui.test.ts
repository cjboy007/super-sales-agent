import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/ClientLayout.tsx"), "utf8");

describe("client layout first-run onboarding", () => {
  it("opens local gateway onboarding once access is saved and onboarding is incomplete", () => {
    expect(source).toContain("/api/local-gateway");
    expect(source).toContain("onboarding?.completed");
    expect(source).toContain("router.replace(\"/jadenos/onboarding\")");
    expect(source).toContain("betaToken");
  });
});
