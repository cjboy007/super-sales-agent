import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const customersSource = readFileSync(join(process.cwd(), "src/app/customers/page.tsx"), "utf8");
const leadsSource = readFileSync(join(process.cwd(), "src/app/leads/page.tsx"), "utf8");

describe("customer records page UI", () => {
  it("adds customer records as a separate navigation destination without duplicating the customer workspace", () => {
    expect(customersSource).toContain("redirect");
    expect(customersSource).toContain("/leads?view=records");
    expect(leadsSource).toContain('searchParams.get("view") === "records"');
    expect(leadsSource).toContain("Customer Records");
    expect(leadsSource).toContain("客户档案");
    expect(leadsSource).toContain("Customer Follow-up");
    expect(leadsSource).toContain("客户跟进");
  });
});
