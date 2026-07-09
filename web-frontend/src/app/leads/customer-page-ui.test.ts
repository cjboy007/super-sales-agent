import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/leads/page.tsx"), "utf8");

describe("customer page business-facing UI", () => {
  it("wraps the search-param driven workspace in Suspense for production builds", () => {
    expect(pageSource).toContain('import { Suspense, useCallback');
    expect(pageSource).toContain("<Suspense fallback={null}>");
    expect(pageSource).toContain("<CustomerWorkspacePage />");
  });

  it("does not render internal order identifiers in customer-facing rows", () => {
    expect(pageSource).not.toContain("{order.id}</span>");
    expect(pageSource).not.toContain("customer.orders[0]?.id");
  });

  it("turns API authorization failures into a customer-facing recovery prompt", () => {
    expect(pageSource).toContain("res.status === 401");
    expect(pageSource).toContain("/settings");
    expect(pageSource).toContain("客户、订单和时间线暂时无法加载");
    expect(pageSource).toContain("User guide");
    expect(pageSource).toContain("使用指南");
    expect(pageSource).toContain("/user-guide");
    expect(pageSource).not.toContain("Beta access token is required");
    expect(pageSource).not.toContain("Workspace access is not allowed");
    expect(pageSource).not.toContain("backend internals");
    expect(pageSource).not.toContain("backend");
  });

  it("shows locked customer metrics instead of zeroes while access is blocked", () => {
    expect(pageSource).toContain("metricValue");
    expect(pageSource).toContain('accessIssue !== "none" ? "--"');
    expect(pageSource).toContain('value={metricValue(stats.total)}');
    expect(pageSource).toContain('value={metricValue(stats.active)}');
    expect(pageSource).toContain('value={metricValue(stats.risk)}');
    expect(pageSource).toContain('value={metricValue(stats.countries)}');
  });

  it("shows payment, fulfillment, and exception lifecycle details in customer orders", () => {
    expect(pageSource).toContain("orderPaymentLabel");
    expect(pageSource).toContain("orderFulfillmentLabel");
    expect(pageSource).toContain("Payment");
    expect(pageSource).toContain("Fulfillment");
    expect(pageSource).toContain("Next Step");
    expect(pageSource).toContain("After-sales");
    expect(pageSource).toContain("Refund");
    expect(pageSource).toContain("Exception");
    expect(pageSource).toContain("paymentStatus");
    expect(pageSource).toContain("fulfillmentStatus");
  });

  it("gives first-time users a self-serve way to create demo customers or start setup", () => {
    expect(pageSource).toContain("/api/demo/seed");
    expect(pageSource).toContain("Create demo customers");
    expect(pageSource).toContain("创建演示客户");
    expect(pageSource).toContain("/intake");
    expect(pageSource).toContain("/settings");
    expect(pageSource).toContain("Import customers");
    expect(pageSource).toContain("Connect mailbox");

    expect(pageSource).not.toContain("jobId");
    expect(pageSource).not.toContain("workflow");
    expect(pageSource).not.toContain("provider");
    expect(pageSource).not.toContain("channel_audit");
    expect(pageSource).not.toContain("dataRoot");
    expect(pageSource).not.toContain("workspaceId");
  });
});
