import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/inbox/page.tsx"), "utf8");

describe("inbox page Jaden command wiring", () => {
  it("routes page-level Jaden commands through the shared inbox envelope", () => {
    expect(source).toContain("PageCommandPanel");
    expect(source).toContain('surface="inbox"');
    expect(source).toContain('mode="reply_draft"');
    expect(source).toContain('type: "email"');
    expect(source).toContain("Ask Jaden to inspect the selected email");
  });
});
