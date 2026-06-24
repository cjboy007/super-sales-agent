import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/ClientLayout.tsx"), "utf8");

describe("client layout first-run onboarding", () => {
  it("does not force users into onboarding after access is saved", () => {
    expect(source).toContain("children");
    expect(source).not.toContain("router.replace(\"/jadenos/onboarding\")");
    expect(source).not.toContain("onboarding?.completed === false");
  });
});
