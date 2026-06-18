import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/components/ui/PageCommandPanel.tsx"), "utf8");

describe("PageCommandPanel UI", () => {
  it("shows a business-facing receipt instead of internal command ids", () => {
    expect(source).not.toContain("json.data?.id");
    expect(source).not.toContain("cmd-");
    expect(source).toContain("queuedTasks");
    expect(source).toMatch(/saved for review/i);
  });
});
