import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const topBarSource = readFileSync(join(process.cwd(), "src/components/ui/AppTopBar.tsx"), "utf8");
const topStatusBarSource = readFileSync(join(process.cwd(), "src/components/battle-station/TopStatusBar.tsx"), "utf8");

describe("global operations status placement", () => {
  it("binds the SSA runtime indicator to the Ops nav item instead of a floating widget", () => {
    expect(topBarSource).toContain("opsStatus");
    expect(topBarSource).toContain("ops-status-dot");
    expect(topBarSource).toContain("activeItem?.href === \"/agent-status\"");
    expect(topBarSource).not.toContain("fixed bottom");
    expect(topBarSource).not.toContain("right-4");
  });

  it("reuses the existing topbar secondary row for runtime status copy", () => {
    expect(topStatusBarSource).toContain("summarizeOpsStatus");
    expect(topStatusBarSource).toContain("runtimeSummary");
    expect(topStatusBarSource).toContain("runtimeStatus.summary");
  });
});
