import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const customersSource = readFileSync(join(process.cwd(), "src/app/customers/page.tsx"), "utf8");
const leadsSource = readFileSync(join(process.cwd(), "src/app/leads/page.tsx"), "utf8");

describe("customer records page UI", () => {
  it("keeps the old customer records route as a compatibility redirect into Customers", () => {
    expect(customersSource).toContain("redirect");
    expect(customersSource).toContain("/leads");
    expect(customersSource).not.toContain("/leads?view=records");
    expect(leadsSource).toContain('title="Customers"');
    expect(leadsSource).toContain('zhTitle="客户"');
    expect(leadsSource).toContain("Customer List / Customer Detail");
    expect(leadsSource).toContain("客户列表 / 客户详情");
    expect(leadsSource).not.toContain("Customer Records");
    expect(leadsSource).not.toContain("客户档案");
    expect(leadsSource).not.toContain("Customer Follow-up");
    expect(leadsSource).not.toContain("客户跟进");
    expect(leadsSource).not.toContain('searchParams.get("view")');
  });
});
