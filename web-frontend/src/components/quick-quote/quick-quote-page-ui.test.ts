import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/components/quick-quote/QuickQuotePage.tsx"), "utf8");

describe("quick quote page UI", () => {
  it("keeps export and reference internals out of the external user page", () => {
    expect(pageSource).toContain("PI package is ready");
    expect(pageSource).toContain("Rate reference updated");
    expect(pageSource).not.toContain("packageDir");
    expect(pageSource).not.toContain("commitHash");
    expect(pageSource).not.toContain("reference.exchangeRate.provider");
  });
});
