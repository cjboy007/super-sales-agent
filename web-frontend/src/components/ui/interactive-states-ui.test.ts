import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const battlePageSource = readFileSync(join(process.cwd(), "src/components/ui/BattlePage.tsx"), "utf8");
const sidebarSource = readFileSync(join(process.cwd(), "src/components/Sidebar.tsx"), "utf8");
const settingsSource = readFileSync(join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
const providerOptionsSource = readFileSync(join(process.cwd(), "src/lib/llm-provider-options.ts"), "utf8");

describe("interactive UI affordances", () => {
  it("gives shared controls visible hover, focus, active, disabled, and loading states", () => {
    expect(battlePageSource).toContain("focus-visible:ring-2");
    expect(battlePageSource).toContain("active:translate-y-px");
    expect(battlePageSource).toContain("disabled:cursor-not-allowed");
    expect(battlePageSource).toContain("aria-busy");
    expect(battlePageSource).toContain("loading");
    expect(battlePageSource).toContain("focus-visible:border-emerald-400");
  });

  it("makes sidebar navigation and icon buttons visibly focusable", () => {
    expect(sidebarSource).toContain("focus-visible:ring-2");
    expect(sidebarSource).toContain("aria-current");
    expect(sidebarSource).toContain("title=");
    expect(sidebarSource).toContain("hover:border");
  });

  it("adds local gateway, storage, and model settings as first-class tabs", () => {
    expect(settingsSource).toContain("local-gateway");
    expect(settingsSource).toContain("local-storage");
    expect(settingsSource).toContain("model");
    expect(settingsSource).toContain("/api/local-gateway");
    expect(settingsSource).toContain("/api/local-storage");
    expect(settingsSource).toContain("/api/llm/test");
  });

  it("auto-fills provider API base URLs while separating Coding Plan variants", () => {
    expect(settingsSource).toContain("LLM_PROVIDER_OPTIONS");
    expect(settingsSource).toContain("defaultBaseUrlForProvider");
    expect(providerOptionsSource).toContain("dashscope-coding-plan");
    expect(providerOptionsSource).toContain("kimi-code");
    expect(settingsSource).toContain("llmBaseUrl");
  });
});
