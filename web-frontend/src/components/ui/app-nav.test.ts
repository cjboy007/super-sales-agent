import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "./app-nav";

const topBarSource = readFileSync(join(process.cwd(), "src/components/ui/AppTopBar.tsx"), "utf8");

describe("global app navigation", () => {
  it("keeps onboarding out of the interface nav", () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).not.toContain("/jadenos/onboarding");
  });

  it("labels the email workspace as drafts in Chinese", () => {
    expect(APP_NAV_ITEMS.find((item) => item.href === "/emails")).toMatchObject({
      label: "Email Drafts",
      zhLabel: "邮件草稿",
    });
  });

  it("keeps the primary navigation focused on the layered workbench IA", () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).toEqual([
      "/",
      "/reviews",
      "/growth",
      "/leads",
      "/emails",
      "/quotations",
      "/agent-status",
      "/customers",
      "/settings",
    ]);
    expect(APP_NAV_ITEMS.find((item) => item.href === "/reviews")).toMatchObject({
      label: "Pending Review",
      zhLabel: "待确认",
    });
    expect(APP_NAV_ITEMS.find((item) => item.href === "/customers")).toMatchObject({
      label: "Customer Records",
      zhLabel: "客户档案",
    });
  });

  it("uses customer follow-up as the primary account workspace label", () => {
    expect(APP_NAV_ITEMS.find((item) => item.href === "/leads")).toMatchObject({
      label: "Customer Follow-up",
      zhLabel: "客户跟进",
    });
  });

  it("includes a task progress entry for beta health checks", () => {
    expect(APP_NAV_ITEMS.find((item) => item.href === "/agent-status")).toMatchObject({
      label: "Task Progress",
      zhLabel: "任务进度",
    });
  });

  it("uses a compact mobile modules switcher instead of a full horizontal module rail", () => {
    expect(topBarSource).toContain("Modules");
    expect(topBarSource).toContain("aria-expanded");
    expect(topBarSource).toContain("setMobileMenuOpen");
    expect(topBarSource).not.toContain("overflow-x-auto border-t border-slate-700 px-4 lg:hidden");
    expect(topBarSource).toContain("lg:flex");
  });

  it("moves mobile language and theme controls into a compact preferences menu", () => {
    expect(topBarSource).toContain("Preferences");
    expect(topBarSource).toContain("mobile-preferences-menu");
    expect(topBarSource).toContain("setMobilePreferencesOpen");
    expect(topBarSource).toContain("hidden shrink-0 rounded border border-slate-600 bg-slate-900/70 p-0.5 lg:flex");
  });
});
