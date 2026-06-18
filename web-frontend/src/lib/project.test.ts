import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectSource = readFileSync(join(process.cwd(), "src/lib/project.tsx"), "utf8");
const settingsSource = readFileSync(join(process.cwd(), "src/app/settings/page.tsx"), "utf8");
const sidebarSource = readFileSync(join(process.cwd(), "src/components/Sidebar.tsx"), "utf8");

describe("beta access UI plumbing", () => {
  it("stores a beta access token and attaches it to API requests", () => {
    expect(projectSource).toContain("ssa-beta-token");
    expect(projectSource).toContain("Authorization");
    expect(projectSource).toContain("authHeaders");
    expect(projectSource).toContain("apiFetch");
  });

  it("uses server-scoped workspaces instead of exposing hard-coded project choices", () => {
    expect(projectSource).not.toContain("export type ProjectId = \"farreach\" | \"hero-pumps\"");
    expect(projectSource).toContain("/api/runtime?action=workspaces");
    expect(projectSource).toContain("allowedWorkspaces");
    expect(projectSource).toContain("applyBetaAccessSession");
    expect(projectSource).toContain("useState<ProjectConfig[]>([])");
    expect(sidebarSource).not.toContain("Object.values(PROJECTS)");
    expect(sidebarSource).toContain("allowedWorkspaces");
    expect(sidebarSource).toContain("allowedWorkspaces.length > 0");
    expect(sidebarSource).toContain("canSwitchWorkspace");
  });

  it("does not hide the whole app while reading browser preferences", () => {
    expect(projectSource).not.toContain("{mounted ? children : null}");
    expect(projectSource).not.toContain("const [mounted");
  });

  it("exposes local gateway access and storage sections in settings", () => {
    expect(settingsSource).toContain("Access Pass");
    expect(settingsSource).toContain("访问口令");
    expect(settingsSource).toContain("Local Gateway");
    expect(settingsSource).toContain("本地网关");
    expect(settingsSource).toContain("Local Storage");
    expect(settingsSource).toContain("本地存储");
    expect(settingsSource).toContain("/api/local-storage");
    expect(settingsSource).toContain("dataRoot");
    expect(settingsSource).toContain("setBetaToken");
    expect(settingsSource).not.toContain("jobId");
    expect(settingsSource).not.toContain("channel_audit");
    expect(settingsSource).not.toContain("runtimeBoundary");
    expect(settingsSource).toContain("productBoundary");
  });

  it("shows mailbox readiness in settings without exposing backend internals", () => {
    expect(settingsSource).toContain("mailboxTone");
    expect(settingsSource).toContain("/api/health");
    expect(settingsSource).toContain("Email Connection Settings");
    expect(settingsSource).toContain("邮件连接设置");
    expect(settingsSource).toContain("requiredActions");
    expect(settingsSource).not.toContain("imap.example.com");
    expect(settingsSource).not.toContain("sales@example.com");
    expect(settingsSource).not.toContain("emailPassword");
  });
});
