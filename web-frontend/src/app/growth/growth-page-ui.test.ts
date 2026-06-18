import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/growth/page.tsx"), "utf8");
const navSource = readFileSync(join(process.cwd(), "src/components/ui/app-nav.ts"), "utf8");

describe("Autonomous Growth control center page", () => {
  it("renders the five required operation panels instead of a landing page", () => {
    expect(pageSource).toContain("Autonomous Growth");
    expect(pageSource).toContain("Automation Mode");
    expect(pageSource).toContain("HITL Policy Matrix");
    expect(pageSource).toContain("Review Queue");
    expect(pageSource).toContain("Autonomous Prospecting Preview");
    expect(pageSource).toContain("Decision Learning");
    expect(pageSource).not.toContain("hero section");
    expect(pageSource).not.toContain("Start your journey");
  });

  it("shows autopilot as visible but unavailable", () => {
    expect(pageSource).toContain("autopilot");
    expect(pageSource).toMatch(/not ready|disabled/i);
    expect(pageSource).toContain("allowed={false}");
  });

  it("surfaces high-risk policy defaults directly in the UI", () => {
    expect(pageSource).toContain("payment.bank");
    expect(pageSource).toContain("blocked");
    expect(pageSource).toContain("email.send");
    expect(pageSource).toContain("review");
  });

  it("uses the beta-aware API client and does not expose internal implementation data", () => {
    expect(pageSource).toContain("useProject");
    expect(pageSource).toContain("apiFetch(\"/api/growth/control-center\"");
    expect(pageSource).not.toContain("fetch(\"/api/growth/control-center");
    expect(pageSource).not.toContain("SSA_DATA_ROOT");
    expect(pageSource).not.toContain("/Users/");
    expect(pageSource).not.toContain("payload");
  });

  it("adds a compact global navigation entry for growth operations", () => {
    expect(navSource).toContain("Growth");
    expect(navSource).toContain("增长");
    expect(navSource).toContain("/growth");
  });
});
