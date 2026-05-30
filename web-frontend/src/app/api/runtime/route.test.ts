import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-runtime-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_BETA_AUTH_TOKENS;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiApiKey;

  if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, init?: { method?: string; body?: BodyInit | null; token?: string }): NextRequest {
  return new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers: init?.token ? { Authorization: `Bearer ${init.token}` } : undefined,
  });
}

describe("/api/runtime route", () => {
  it("does not require in-app sign-in for runtime mutations when legacy beta env vars are present", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);

    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "register-workspace",
        workspace: { id: "public-probe", name: "Public Probe" },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: "public-probe", name: "Public Probe" });
  });

  it("keeps side-effect approval local without workspace-token checks", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "hero-pumps",
      summary: "Hero email",
      payload: { to: "buyer@example.com" },
    });

    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      token: "farreach-token",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: { decisionId: decision.id },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      id: decision.id,
      status: "approved",
      workspaceId: "hero-pumps",
    });
  });

  it("returns a runtime snapshot", async () => {
    const response = await GET(request("http://localhost/api/runtime"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual(["farreach", "hero-pumps"]);
    expect(json.data.packs.map((pack: { id: string }) => pack.id)).toContain("export-b2b");
    expect(json.data.jobs).toEqual([]);
  });

  it("returns the Sales OS manifest", async () => {
    const response = await GET(request("http://localhost/api/runtime?action=manifest"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      id: "ssa-sales-os",
      runtimeBoundary: {
        standalone: true,
        requiresOpenClaw: false,
        requiresHermes: false,
        sideEffectsBlockedByDefault: true,
      },
    });
    expect(json.data.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "sales-packs",
        openclawEquivalent: "skills",
        status: "implemented",
      }),
      expect.objectContaining({
        id: "runtime-workflows",
        openclawEquivalent: "agent tasks / cron jobs",
        status: "partial",
      }),
    ]));
    expect(json.data.workflowTypes).toContain("operator.command");
    expect(json.data.sideEffectKinds).toContain("email.send");
    expect(json.data.dataContracts).toContain("Runtime jobs live under runtime/ssa-runtime.db.");
    expect(json.data.nextGaps).toContain("Standalone worker entrypoints and retry policy for SQLite runtime jobs.");
  });

  it("registers a new local workspace through the runtime API", async () => {
    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "register-workspace",
        workspace: {
          id: "demo-exporter",
          name: "Demo Exporter",
          brandName: "Demo Export Co.",
          packs: ["email-reply", "follow-up", "quotation"],
          capabilities: { quotations: true, documents: true },
        },
      }),
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      id: "demo-exporter",
      name: "Demo Exporter",
      capabilities: { crm: "csv", quotations: true, documents: true, emailSync: false },
    });

    const workspacesResponse = await GET(request("http://localhost/api/runtime?action=workspaces"));
    const workspacesJson = await workspacesResponse.json();
    expect(workspacesJson.data.map((workspace: { id: string }) => workspace.id)).toEqual([
      "farreach",
      "hero-pumps",
      "demo-exporter",
    ]);
  });

  it("imports a CSV lead export into a local workspace without code changes", async () => {
    const registerResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "register-workspace",
        workspace: {
          id: "csv-exporter",
          name: "CSV Exporter",
          capabilities: { crm: "csv" },
        },
      }),
    }));
    expect((await registerResponse.json()).success).toBe(true);

    const importResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "import-leads",
        workspaceId: "csv-exporter",
        input: {
          fileName: "crm-export.csv",
          csv: [
            "company,contact_name,email,website,country,industry,tier,position,confidence",
            "CSV Buyer,Nils,nils@csv.example,https://csv.example,Sweden,Installer,Tier2 Partner,Owner,75%",
          ].join("\n"),
        },
      }),
    }));
    const imported = await importResponse.json();

    expect(imported).toMatchObject({
      success: true,
      data: {
        workspaceId: "csv-exporter",
        count: 1,
        format: "csv",
      },
    });

    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const leads = runtime.memory.getLeads("csv-exporter", { page: 1, pageSize: 10 });
    expect(leads.total).toBe(1);
    expect(leads.data?.[0]).toMatchObject({
      companyName: "CSV Buyer",
      email: "nils@csv.example",
      score: "Warm",
    });
    expect(runtime.snapshot().events[0]).toMatchObject({
      type: "lead.imported",
      workspaceId: "csv-exporter",
      payload: {
        count: 1,
        format: "csv",
        sideEffects: "local-only",
      },
    });
  });

  it("previews, approves, rejects, retries, and audits side-effect decisions", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "demo-exporter",
      summary: "Preview email send",
      payload: { to: "buyer@example.com", subject: "Quote" },
    });

    const listResponse = await GET(request("http://localhost/api/runtime?action=side-effects"));
    const listJson = await listResponse.json();
    expect(listJson.data[0]).toMatchObject({
      id: decision.id,
      status: "blocked",
      realExecutionEnabled: false,
    });

    const approveResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: {
          decisionId: decision.id,
          by: "Wilson",
          note: "Draft approved for local dry-run.",
        },
      }),
    }));
    const approved = await approveResponse.json();

    expect(approved.data).toMatchObject({
      id: decision.id,
      status: "approved",
      approvedBy: "Wilson",
      realExecutionEnabled: false,
    });
    expect(approved.data.reason).toContain("Real execution still requires");

    const rejectResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "reject-side-effect",
        input: {
          decisionId: decision.id,
          by: "Wilson",
          note: "Need margin review first.",
        },
      }),
    }));
    const rejected = await rejectResponse.json();
    expect(rejected.data).toMatchObject({
      id: decision.id,
      status: "rejected",
      rejectedBy: "Wilson",
      reason: "Need margin review first.",
    });

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-side-effect",
        input: { decisionId: decision.id },
      }),
    }));
    const retried = await retryResponse.json();
    expect(retried.data).toMatchObject({
      status: "retry_requested",
      retryOf: decision.id,
      realExecutionEnabled: false,
    });

    const events = runtime.listEvents(10).map((event) => event.type);
    expect(events).toEqual(expect.arrayContaining([
      "side_effect.approved",
      "side_effect.rejected",
      "side_effect.retry_requested",
    ]));
  });

  it("enqueues and runs a workflow with side effects blocked by default", async () => {
    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "hero-pumps",
        workflow: "email.reply",
        run: true,
        input: {
          subject: "Need pump quotation",
          body: "Can you quote 100 circulator pumps?",
          email: "buyer@example.com",
        },
      }),
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.status).toBe("completed");
    expect(json.data.steps[1].output).toMatchObject({
      kind: "email.send",
      status: "blocked",
      realExecutionEnabled: false,
    });

    const jobsResponse = await GET(request("http://localhost/api/runtime?action=jobs"));
    const jobsJson = await jobsResponse.json();
    expect(jobsJson.data[0].id).toBe(json.data.id);
  });

  it("accepts operator command workflows as runtime jobs", async () => {
    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        workspaceId: "farreach",
        workflow: "operator.command",
        input: {
          message: "Review the dashboard and summarize risks.",
          page: "dashboard",
        },
      }),
    }));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      workspaceId: "farreach",
      workflow: "operator.command",
      status: "queued",
    });
  });

  it("rejects unsupported workflows", async () => {
    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({ workspaceId: "farreach", workflow: "unknown.workflow" }),
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
