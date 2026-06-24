import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "src/app/reviews/page.tsx"), "utf8");

describe("pending review page UI", () => {
  it("creates a dedicated pending review workspace with business-facing labels", () => {
    expect(source).toContain("Pending Review");
    expect(source).toContain("待确认");
    expect(source).toContain("待确认事项");
    expect(source).toContain("客户动作复核");
    expect(source).toContain("继续处理");
    expect(source).toContain("/api/approvals");
    expect(source).toContain("/api/runtime?action=side-effects&limit=20");
  });

  it("uses confirm/review language instead of approve language in visible controls", () => {
    expect(source).toContain("Confirm");
    expect(source).toContain("确认");
    expect(source).toContain("Review Items");
    expect(source).not.toContain("Approve");
    expect(source).not.toContain("批准");
    expect(source).not.toContain("审批");
  });

  it("routes page-level Jaden commands through the shared approvals envelope", () => {
    expect(source).toContain("PageCommandPanel");
    expect(source).toContain('surface="approvals"');
    expect(source).toContain('mode="review"');
    expect(source).toContain('type: "approval"');
    expect(source).toContain("Ask Jaden to summarize review risk");
  });
});
