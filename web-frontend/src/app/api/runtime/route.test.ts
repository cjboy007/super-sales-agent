import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalCrmFlag = process.env.SSA_ENABLE_REAL_CRM_WRITE;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-runtime-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
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

  if (originalCrmFlag === undefined) delete process.env.SSA_ENABLE_REAL_CRM_WRITE;
  else process.env.SSA_ENABLE_REAL_CRM_WRITE = originalCrmFlag;

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
  it("requires a scoped beta token for runtime mutations when beta auth is configured", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "demo-token", workspaces: ["public-probe"] },
    ]);

    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "register-workspace",
        workspace: { id: "public-probe", name: "Public Probe" },
      }),
    }));
    expect(response.status).toBe(401);

    const authedResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      token: "demo-token",
      body: JSON.stringify({
        action: "register-workspace",
        workspace: { id: "public-probe", name: "Public Probe" },
      }),
    }));
    const json = await authedResponse.json();

    expect(authedResponse.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: "public-probe", name: "Public Probe" });
  });

  it("returns only token-scoped workspace choices, including unregistered closed-alpha workspaces", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "alpha-a-token", workspaces: ["alpha-a"] },
    ]);

    const response = await GET(request("http://localhost/api/runtime?action=workspaces", {
      token: "alpha-a-token",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.map((workspace: { id: string }) => workspace.id)).toEqual(["alpha-a"]);
    expect(json.data[0]).toMatchObject({
      id: "alpha-a",
      name: "alpha-a",
      capabilities: expect.any(Object),
    });
    expect(json.data[0]).not.toHaveProperty("data");
    expect(json.data[0]).not.toHaveProperty("identity");
    expect(JSON.stringify(json.data)).not.toContain("farreach");
    expect(JSON.stringify(json.data)).not.toContain("hero-pumps");
  });

  it("blocks scoped tokens from approving another workspace side effect", async () => {
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

    expect(response.status).toBe(403);
    expect(json.success).toBe(false);
  });

  it("allows wildcard beta tokens to approve side-effect decisions", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "admin-token", workspaces: ["*"] },
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
      token: "admin-token",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: { decisionId: decision.id },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({
      actionId: decision.id,
      title: "Customer email send",
      status: "approved",
      blocked: false,
    });
    expect(json.data).not.toHaveProperty("id");
    expect(json.data).not.toHaveProperty("workspaceId");
    expect(json.data).not.toHaveProperty("payload");
  });

  it("returns a runtime snapshot", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    runtime.recordEvent("llm.task.completed", "farreach", {
      task: "extract",
      provider: "mock",
      jobId: "job-raw-snapshot",
      dataRoot: "/Users/wilson/.ssa/data/runtime/ssa-runtime.db",
      sideEffects: "local-only",
    });

    const response = await GET(request("http://localhost/api/runtime"));
    const json = await response.json();
    const serialized = JSON.stringify(json.data);

    expect(json.success).toBe(true);
    expect(json.data.workspaces.map((workspace: { id: string }) => workspace.id)).toEqual(["farreach", "hero-pumps"]);
    expect(json.data.workspaces[0]).toMatchObject({
      id: "farreach",
      name: "Farreach",
      brandName: "Farreach Electronic",
      industry: "Export B2B cables and electronics",
      capabilities: expect.any(Object),
      packs: expect.any(Array),
    });
    expect(json.data.workspaces[0]).not.toHaveProperty("data");
    expect(json.data.workspaces[0]).not.toHaveProperty("identity");
    expect(json.data.packs.map((pack: { id: string }) => pack.id)).toContain("export-b2b");
    expect(json.data.packs[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      actions: expect.any(Array),
    });
    expect(json.data.packs[0]).not.toHaveProperty("workflows");
    expect(json.data.packs[0]).not.toHaveProperty("sideEffects");
    expect(json.data.jobs).toEqual([]);
    expect(json.data.events[0]).toMatchObject({
      activityId: expect.any(String),
      workspaceId: "farreach",
      title: expect.any(String),
      createdAt: expect.any(String),
    });
    expect(json.data.events[0]).not.toHaveProperty("payload");
    expect(json.data.events[0]).not.toHaveProperty("type");
    expect(serialized).not.toContain("leadsPath");
    expect(serialized).not.toContain("productCatalogPath");
    expect(serialized).not.toContain("templatesPath");
    expect(serialized).not.toContain("rulesPath");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("jobId");
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain("payload");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });

  it("returns the Sales OS manifest", async () => {
    const response = await GET(request("http://localhost/api/runtime?action=manifest"));
    const json = await response.json();
    const serialized = JSON.stringify(json.data);

    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      id: "ssa-sales-os",
      productBoundary: {
        standaloneRuntime: true,
        dataProtected: true,
        sideEffectsBlockedByDefault: true,
      },
    });
    expect(json.data.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "sales-packs",
        label: expect.any(String),
        status: "implemented",
      }),
      expect.objectContaining({
        id: "runtime-operations",
        label: expect.any(String),
        status: "implemented",
      }),
    ]));
    expect(json.data).not.toHaveProperty("runtimeBoundary");
    expect(json.data).not.toHaveProperty("workflowTypes");
    expect(json.data).not.toHaveProperty("sideEffectKinds");
    expect(json.data).not.toHaveProperty("llmTasks");
    expect(json.data).not.toHaveProperty("dataContracts");
    expect(json.data.nextSteps).toContain("Set an Activation Code before inviting external users.");
    expect(serialized).not.toContain("beta access pass");
    expect(serialized).not.toContain("workflow");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("dataRoot");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
    expect(serialized).not.toContain("OpenClaw");
    expect(serialized).not.toContain("Hermes");
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
        companyIntel: {
          queued: 1,
          skipped: 0,
        },
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
    expect(runtime.snapshot().jobs[0]).toMatchObject({
      workspaceId: "csv-exporter",
      workflow: "company_intel.run",
      status: "queued",
    });
    expect(runtime.snapshot().events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "lead.imported",
        workspaceId: "csv-exporter",
        payload: expect.objectContaining({
          count: 1,
          format: "csv",
          sideEffects: "local-only",
        }),
      }),
      expect.objectContaining({
        type: "company_intel.queued",
        workspaceId: "csv-exporter",
        payload: expect.objectContaining({
          companyName: "CSV Buyer",
          sideEffects: "local-only",
        }),
      }),
    ]));
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
      actionId: decision.id,
      title: "Customer email send",
      customer: "buyer@example.com",
      status: "blocked",
      canRetry: true,
    });
    expect(listJson.data[0]).not.toHaveProperty("workspaceId");
    expect(listJson.data[0]).not.toHaveProperty("payload");

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
      actionId: decision.id,
      title: "Customer email send",
      status: "approved",
      blocked: false,
      canRetry: false,
    });
    expect(approved.data.reason).toContain("Real execution still requires");
    expect(approved.data).not.toHaveProperty("id");
    expect(approved.data).not.toHaveProperty("workspaceId");
    expect(approved.data).not.toHaveProperty("payload");
    expect(approved.data).not.toHaveProperty("realExecutionEnabled");
    expect(JSON.stringify(approved.data)).not.toContain("approvedBy");
    expect(JSON.stringify(approved.data)).not.toContain("Draft approved for local dry-run.");

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
      actionId: decision.id,
      title: "Customer email send",
      status: "rejected",
      reason: "Need margin review first.",
      blocked: true,
    });
    expect(rejected.data).not.toHaveProperty("id");
    expect(rejected.data).not.toHaveProperty("workspaceId");
    expect(rejected.data).not.toHaveProperty("payload");

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-side-effect",
        input: { decisionId: decision.id },
      }),
    }));
    const retried = await retryResponse.json();
    expect(retried.data).toMatchObject({
      actionId: expect.any(String),
      status: "retry_requested",
      title: "Customer email send",
      blocked: false,
      canRetry: true,
    });
    expect(retried.data).not.toHaveProperty("retryOf");
    expect(retried.data).not.toHaveProperty("workspaceId");
    expect(retried.data).not.toHaveProperty("payload");
    expect(retried.data).not.toHaveProperty("realExecutionEnabled");

    const events = runtime.listEvents(10).map((event) => event.type);
    expect(events).toEqual(expect.arrayContaining([
      "side_effect.approved",
      "side_effect.rejected",
      "side_effect.retry_requested",
    ]));
  });

  it("returns business-facing side-effect review items without raw payload internals", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Send email to buyer@example.com: Quote PI-RAW-001",
      payload: {
        to: "buyer@example.com",
        subject: "Quote PI-RAW-001",
        idempotencyKey: "farreach:email:buyer@example.com:Quote PI-RAW-001",
        jobId: "job-raw-1",
        workflow: "email.reply",
        provider: "smtp",
      },
      idempotencyKey: "farreach:email:buyer@example.com:Quote PI-RAW-001",
    });
    runtime.approveSideEffect(decision.id, { by: "Wilson" });
    runtime.recordSideEffectFailed(decision.id, {
      error: "SMTP rejected recipient /Users/wilson/.ssa/data/runtime/mail.log",
      canRetry: true,
    });

    const response = await GET(request("http://localhost/api/runtime?action=side-effects"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data[0]).toMatchObject({
      actionId: decision.id,
      title: "Customer email send",
      customer: "buyer@example.com",
      status: "execution_failed",
      canRetry: true,
      reason: expect.stringContaining("SMTP rejected recipient"),
    });
    expect(json.data[0]).not.toHaveProperty("workspaceId");
    expect(json.data[0]).not.toHaveProperty("payload");
    expect(json.data[0]).not.toHaveProperty("id");
    expect(JSON.stringify(json.data[0])).not.toContain("idempotencyKey");
    expect(JSON.stringify(json.data[0])).not.toContain("PI-RAW-001");
    expect(JSON.stringify(json.data[0])).not.toContain("job-raw-1");
    expect(JSON.stringify(json.data[0])).not.toContain("workflow");
    expect(JSON.stringify(json.data[0])).not.toContain("provider");
    expect(JSON.stringify(json.data[0])).not.toContain("/Users/");
    expect(JSON.stringify(json.data[0])).not.toContain(".ssa");
  });

  it("returns runtime snapshots with business-facing side-effect items only", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM note for Snapshot Buyer from workflow side_effect.request",
      payload: {
        customerName: "Snapshot Buyer",
        subject: "Follow up PI-SNAPSHOT-001",
        idempotencyKey: "farreach:crm:Snapshot Buyer:PI-SNAPSHOT-001",
        jobId: "side-effect-request-raw-1",
        workflow: "side_effect.request",
        provider: "crm-adapter",
        dataRoot: "/Users/wilson/.ssa/data/runtime/ssa-runtime.db",
      },
      idempotencyKey: "farreach:crm:Snapshot Buyer:PI-SNAPSHOT-001",
    });
    runtime.recordSideEffectFailed(decision.id, {
      error: "CRM provider failed at /Users/wilson/.ssa/data/runtime/ssa-runtime.db",
      canRetry: true,
    });

    const response = await GET(request("http://localhost/api/runtime"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.sideEffects[0]).toMatchObject({
      actionId: decision.id,
      title: "CRM update",
      customer: "Snapshot Buyer",
      status: "execution_failed",
      canRetry: true,
    });
    expect(json.data.sideEffects[0]).not.toHaveProperty("workspaceId");
    expect(json.data.sideEffects[0]).not.toHaveProperty("payload");
    expect(json.data.sideEffects[0]).not.toHaveProperty("id");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("idempotencyKey");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("PI-SNAPSHOT-001");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("side-effect-request-raw-1");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("workflow");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("provider");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("dataRoot");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain("/Users/");
    expect(JSON.stringify(json.data.sideEffects[0])).not.toContain(".ssa");
  });

  it("returns business-facing runtime jobs without raw task internals", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const job = runtime.workflows.enqueue("farreach", "email.reply", {
      customer: "Job API Buyer",
      email: "buyer@job-api.example",
      subject: "Follow up PI-JOB-001",
      localPath: "/Users/wilson/.ssa/data/runtime/ssa-runtime.db",
      provider: "mock",
    });
    runtime.workflows.fail(job.id, "Provider timeout at /Users/wilson/.ssa/data/runtime/ssa-runtime.db for PI-JOB-001");

    const response = await GET(request("http://localhost/api/runtime?action=jobs"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data[0]).toMatchObject({
      operationId: expect.any(String),
      workspaceId: "farreach",
      title: "Email follow-up",
      customer: "Job API Buyer",
      status: "failed",
      attempts: 0,
      canRetry: true,
      reason: expect.stringContaining("service timeout"),
    });
    expect(json.data[0]).not.toHaveProperty("id");
    expect(json.data[0]).not.toHaveProperty("workflow");
    expect(json.data[0]).not.toHaveProperty("input");
    expect(json.data[0]).not.toHaveProperty("steps");
    expect(JSON.stringify(json.data[0])).not.toContain(job.id);
    expect(JSON.stringify(json.data[0])).not.toContain("email.reply");
    expect(JSON.stringify(json.data[0])).not.toContain("PI-JOB-001");
    expect(JSON.stringify(json.data[0])).not.toContain("provider");
    expect(JSON.stringify(json.data[0])).not.toContain("/Users/");
    expect(JSON.stringify(json.data[0])).not.toContain(".ssa");
  });

  it("requests CRM follow-up writes as approval-gated side effects without changing the customer timeline by default", async () => {
    const response = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "request-crm-write",
        workspaceId: "farreach",
        input: {
          customerId: "crm-gated.example",
          customerName: "CRM Gated Buyer",
          contactEmail: "buyer@crm-gated.example",
          subject: "Follow-up after quotation",
          summary: "Operator wants to record a follow-up note in CRM.",
          occurredAt: "2026-06-08T09:00:00.000Z",
        },
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      success: true,
      data: {
        kind: "crm.write",
        status: "blocked",
      },
    });
    expect(json.data.reason).toContain("explicit enablement");
    expect(json.data.reason).not.toContain("SSA_ENABLE_REAL_CRM_WRITE");
    expect(JSON.stringify(json.data)).not.toContain("jobId");
    expect(JSON.stringify(json.data)).not.toContain("workflow");
    expect(JSON.stringify(json.data)).not.toContain("provider");
    expect(JSON.stringify(json.data)).not.toContain("/Users/");
    expect(json.data).not.toHaveProperty("realExecutionEnabled");

    const activityPath = path.join(tempRoot, "companies", "farreach", "customers", "activity.json");
    expect(fs.existsSync(activityPath)).toBe(false);

    const listResponse = await GET(request("http://localhost/api/runtime?action=side-effects"));
    const listJson = await listResponse.json();
    expect(listJson.data[0]).toMatchObject({
      actionId: json.data.decisionId,
      title: "CRM update",
      customer: "CRM Gated Buyer",
      status: "blocked",
      canRetry: true,
    });
    expect(listJson.data[0]).not.toHaveProperty("workspaceId");
  });

  it("executes CRM writes only after approval and explicit CRM flag, then records customer activity", async () => {
    const requestResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "request-crm-write",
        workspaceId: "farreach",
        input: {
          customerId: "approved-crm.example",
          customerName: "Approved CRM Buyer",
          contactName: "Ari",
          contactEmail: "ari@approved-crm.example",
          subject: "Payment follow-up",
          summary: "Customer promised payment confirmation on Friday.",
          occurredAt: "2026-06-08T10:00:00.000Z",
        },
      }),
    }));
    const requested = await requestResponse.json();
    expect(requested.data.status).toBe("blocked");

    const approveResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: {
          decisionId: requested.data.decisionId,
          by: "Wilson",
          note: "Approved CRM follow-up write for test.",
        },
      }),
    }));
    expect((await approveResponse.json()).data.status).toBe("approved");

    const blockedExecuteResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "execute-crm-write",
        workspaceId: "farreach",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const blockedExecute = await blockedExecuteResponse.json();
    expect(blockedExecuteResponse.status).toBe(403);
    expect(blockedExecute).toMatchObject({
      success: false,
      error: expect.stringContaining("explicit enablement"),
    });
    expect(blockedExecute.error).not.toContain("SSA_ENABLE_REAL_CRM_WRITE");
    const failedDecisionAfterBlockedExecute = (await GET(request("http://localhost/api/runtime?action=side-effects"))).json();
    await expect(failedDecisionAfterBlockedExecute).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          actionId: requested.data.decisionId,
          status: "execution_failed",
          reason: expect.stringContaining("explicit enablement"),
          execution: expect.objectContaining({
            status: "failed",
            canRetry: true,
          }),
        }),
      ],
    });

    process.env.SSA_ENABLE_REAL_CRM_WRITE = "true";
    const executeResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "execute-crm-write",
        workspaceId: "farreach",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const executed = await executeResponse.json();

    expect(executeResponse.status).toBe(200);
    expect(executed).toMatchObject({
      success: true,
      data: {
        status: "executed",
        customerName: "Approved CRM Buyer",
        subject: "Payment follow-up",
        activityType: "Follow-up",
      },
    });
    expect(JSON.stringify(executed.data)).not.toContain("jobId");
    expect(JSON.stringify(executed.data)).not.toContain("workflow");
    expect(JSON.stringify(executed.data)).not.toContain("provider");
    expect(JSON.stringify(executed.data)).not.toContain("/Users/");
    const decisionAfterExecute = await (await GET(request("http://localhost/api/runtime?action=side-effects"))).json();
    expect(decisionAfterExecute.data[0]).toMatchObject({
      actionId: requested.data.decisionId,
      status: "executed",
      execution: expect.objectContaining({
        status: "executed",
        canRetry: false,
      }),
    });

    const activityPath = path.join(tempRoot, "companies", "farreach", "customers", "activity.json");
    const activities = JSON.parse(fs.readFileSync(activityPath, "utf-8"));
    expect(activities[0]).toMatchObject({
      customerId: "approved-crm.example",
      customerName: "Approved CRM Buyer",
      kind: "crm_note",
      contactName: "Ari",
      contactEmail: "ari@approved-crm.example",
      subject: "Payment follow-up",
      summary: "Customer promised payment confirmation on Friday.",
      status: "executed",
      source: "crm-write",
    });

    const { createSalesRuntime, buildCustomerDirectory } = await import("@/lib/runtime");
    const directory = buildCustomerDirectory(createSalesRuntime(), "farreach", {
      search: "Approved CRM Buyer",
      page: 1,
      pageSize: 20,
    });
    expect(directory.customers[0]).toMatchObject({
      companyName: "Approved CRM Buyer",
      interactions: expect.arrayContaining([
        expect.objectContaining({
          type: "Follow-up",
          summary: "Customer promised payment confirmation on Friday.",
        }),
      ]),
    });
    expect(JSON.stringify(directory.customers[0])).not.toContain(requested.data.decisionId);
  });

  it("records failed CRM execution attempts and lets operators request a retry review", async () => {
    const requestResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "request-crm-write",
        workspaceId: "farreach",
        input: {
          customerId: "failed-crm.example",
          customerName: "Failed CRM Buyer",
          subject: "CRM write without flag",
          summary: "This should wait for the real CRM flag.",
        },
      }),
    }));
    const requested = await requestResponse.json();
    await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: {
          decisionId: requested.data.decisionId,
          by: "Wilson",
          note: "Approved but the runtime flag is intentionally missing.",
        },
      }),
    }));

    const executeResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "execute-crm-write",
        workspaceId: "farreach",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const executeJson = await executeResponse.json();

    expect(executeResponse.status).toBe(403);
    expect(executeJson.error).toContain("explicit enablement");
    expect(executeJson.error).not.toContain("SSA_ENABLE_REAL_CRM_WRITE");

    const afterFailure = await (await GET(request("http://localhost/api/runtime?action=side-effects"))).json();
    expect(afterFailure.data[0]).toMatchObject({
      actionId: requested.data.decisionId,
      status: "execution_failed",
      reason: expect.stringContaining("explicit enablement"),
      execution: expect.objectContaining({
        status: "failed",
        canRetry: true,
      }),
    });

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-side-effect",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const retryJson = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryJson.data).toMatchObject({
      title: "CRM update",
      status: "retry_requested",
      canRetry: true,
    });
    expect(retryJson.data).not.toHaveProperty("kind");
    expect(retryJson.data).not.toHaveProperty("retryOf");
    expect(retryJson.data).not.toHaveProperty("workspaceId");
    expect(retryJson.data).not.toHaveProperty("payload");
  });

  it("returns a new public action id when retrying an idempotent side-effect decision", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "crm.write",
      workspaceId: "farreach",
      summary: "Write CRM follow-up for Retry Buyer",
      payload: {
        customerId: "retry-buyer.example",
        customerName: "Retry Buyer",
        subject: "Retry this CRM note",
      },
      idempotencyKey: "farreach:crm-write:retry-buyer.example:Retry this CRM note",
    });

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-side-effect",
        input: {
          decisionId: decision.id,
        },
      }),
    }));
    const retryJson = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryJson.data).toMatchObject({
      title: "CRM update",
      status: "retry_requested",
      canRetry: true,
    });
    expect(retryJson.data.actionId).not.toBe(decision.id);
    expect(retryJson.data).not.toHaveProperty("retryOf");
    expect(retryJson.data).not.toHaveProperty("workspaceId");
    expect(retryJson.data).not.toHaveProperty("payload");

    const internalDecisions = runtime.listSideEffects(10);
    expect(internalDecisions.map((item) => item.id)).toEqual(expect.arrayContaining([
      decision.id,
      retryJson.data.actionId,
    ]));
    expect(internalDecisions.find((item) => item.id === decision.id)).toMatchObject({
      status: "blocked",
    });
    expect(internalDecisions.find((item) => item.id === retryJson.data.actionId)).toMatchObject({
      status: "retry_requested",
      retryOf: decision.id,
    });
  });

  it("does not execute rejected CRM writes and supports retry review records", async () => {
    const requestResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "request-crm-write",
        workspaceId: "farreach",
        input: {
          customerId: "rejected-crm.example",
          customerName: "Rejected CRM Buyer",
          subject: "Rejected CRM note",
          summary: "This note should not be written.",
        },
      }),
    }));
    const requested = await requestResponse.json();

    const rejectResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "reject-side-effect",
        input: {
          decisionId: requested.data.decisionId,
          by: "Wilson",
          note: "Do not write this CRM note.",
        },
      }),
    }));
    expect((await rejectResponse.json()).data.status).toBe("rejected");

    process.env.SSA_ENABLE_REAL_CRM_WRITE = "true";
    const executeResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "execute-crm-write",
        workspaceId: "farreach",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const executed = await executeResponse.json();
    expect(executeResponse.status).toBe(403);
    expect(executed.error).toContain("approved");

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-side-effect",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const retried = await retryResponse.json();
    expect(retried.data).toMatchObject({
      title: "CRM update",
      status: "retry_requested",
      canRetry: true,
    });
    expect(retried.data).not.toHaveProperty("kind");
    expect(retried.data).not.toHaveProperty("retryOf");
    expect(retried.data).not.toHaveProperty("workspaceId");

    const activityPath = path.join(tempRoot, "companies", "farreach", "customers", "activity.json");
    expect(fs.existsSync(activityPath)).toBe(false);
  });

  it("approval-gates order lifecycle CRM writes and then records payment/shipment activity after explicit CRM enablement", async () => {
    const requestResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "request-crm-write",
        workspaceId: "farreach",
        input: {
          customerId: "runtime-order.example",
          customerName: "Runtime Order Buyer",
          contactName: "Rita",
          contactEmail: "rita@runtime-order.example",
          subject: "Order lifecycle update",
          orderNumber: "PI-RUNTIME-001",
          orderType: "PI",
          productType: "DisplayPort cable order",
          amount: "USD 7600.00",
          lifecycleStage: "shipment",
          paymentStatus: "paid",
          fulfillmentStatus: "shipped",
          occurredAt: "2026-06-08T11:00:00.000Z",
        },
      }),
    }));
    const requested = await requestResponse.json();

    expect(requestResponse.status).toBe(200);
    expect(requested).toMatchObject({
      success: true,
      data: {
        kind: "crm.write",
        status: "blocked",
        customerName: "Runtime Order Buyer",
        subject: "Order lifecycle update",
      },
    });
    expect(requested.data).not.toHaveProperty("realExecutionEnabled");

    const activityPath = path.join(tempRoot, "companies", "farreach", "customers", "activity.json");
    expect(fs.existsSync(activityPath)).toBe(false);

    await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "approve-side-effect",
        input: {
          decisionId: requested.data.decisionId,
          by: "Wilson",
          note: "Approved order lifecycle write for test.",
        },
      }),
    }));

    process.env.SSA_ENABLE_REAL_CRM_WRITE = "true";
    const executeResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "execute-crm-write",
        workspaceId: "farreach",
        input: {
          decisionId: requested.data.decisionId,
        },
      }),
    }));
    const executed = await executeResponse.json();

    expect(executeResponse.status).toBe(200);
    expect(executed).toMatchObject({
      success: true,
      data: {
        status: "executed",
        customerName: "Runtime Order Buyer",
        subject: "Order lifecycle update",
        activityType: "Order",
      },
    });
    expect(JSON.stringify(executed.data)).not.toContain("PI-RUNTIME-001");
    expect(JSON.stringify(executed.data)).not.toContain("jobId");
    expect(JSON.stringify(executed.data)).not.toContain("workflow");
    expect(JSON.stringify(executed.data)).not.toContain("/Users/");

    const activities = JSON.parse(fs.readFileSync(activityPath, "utf-8"));
    expect(activities[0]).toMatchObject({
      customerId: "runtime-order.example",
      customerName: "Runtime Order Buyer",
      kind: "order_status",
      summary: expect.stringContaining("DisplayPort cable order shipment shipped for USD 7600.00"),
      status: "shipment",
      source: "crm-write",
      metadata: expect.objectContaining({
        orderNumber: "PI-RUNTIME-001",
        orderType: "PI",
        lifecycleStage: "shipment",
        paymentStatus: "paid",
        fulfillmentStatus: "shipped",
      }),
    });

    const { createSalesRuntime, buildCustomerDirectory } = await import("@/lib/runtime");
    const directory = buildCustomerDirectory(createSalesRuntime(), "farreach", {
      search: "Runtime Order Buyer",
      page: 1,
      pageSize: 20,
    });
    expect(directory.customers[0]).toMatchObject({
      companyName: "Runtime Order Buyer",
      orders: [
        expect.objectContaining({
          type: "PI",
          productType: "DisplayPort cable order",
          amount: "USD 7600.00",
          lifecycle: expect.objectContaining({
            stage: "shipment",
            paymentStatus: "paid",
            fulfillmentStatus: "shipped",
          }),
        }),
      ],
      interactions: expect.arrayContaining([
        expect.objectContaining({
          type: "Shipment",
          summary: expect.stringContaining("DisplayPort cable order shipment shipped"),
        }),
      ]),
    });
    expect(JSON.stringify(directory.customers[0])).not.toContain("PI-RUNTIME-001");
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
    expect(json.data).toMatchObject({
      operationId: expect.any(String),
      workspaceId: "hero-pumps",
      title: "Email follow-up",
      customer: "buyer@example.com",
      status: "completed",
      canRetry: false,
      safetyGate: {
        status: "blocked",
        realExecutionEnabled: false,
      },
    });
    expect(json.data).not.toHaveProperty("id");
    expect(json.data).not.toHaveProperty("workflow");
    expect(json.data).not.toHaveProperty("input");
    expect(json.data).not.toHaveProperty("steps");
    expect(JSON.stringify(json.data)).not.toContain("email.reply");
    expect(JSON.stringify(json.data)).not.toContain("jobId");
    expect(JSON.stringify(json.data)).not.toContain("provider");

    const jobsResponse = await GET(request("http://localhost/api/runtime?action=jobs"));
    const jobsJson = await jobsResponse.json();
    expect(jobsJson.data[0]).toMatchObject({
      operationId: expect.any(String),
      workspaceId: "hero-pumps",
      title: "Email follow-up",
      customer: "buyer@example.com",
      status: "completed",
      canRetry: false,
    });
    expect(jobsJson.data[0]).not.toHaveProperty("id");
    expect(jobsJson.data[0]).not.toHaveProperty("workflow");
    expect(jobsJson.data[0]).not.toHaveProperty("input");
    expect(jobsJson.data[0]).not.toHaveProperty("steps");
    expect(JSON.stringify(jobsJson.data[0])).not.toContain("email.reply");
  });

  it("lists failed work for operations without leaking backend identifiers and retries by operation id", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const job = runtime.workflows.enqueue("farreach", "email.reply", {
      subject: "Follow up quote",
      email: "buyer@example.com",
      customer: "Beta Cable Labs",
    });
    runtime.workflows.fail(job.id, "SMTP provider timeout at /Users/wilson/.ssa/data/runtime/ssa-runtime.db");

    const listResponse = await GET(request("http://localhost/api/runtime?action=failed-jobs"));
    const listJson = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(listJson.success).toBe(true);
    expect(listJson.data[0]).toMatchObject({
      operationId: expect.any(String),
      title: "Email follow-up",
      customer: "Beta Cable Labs",
      status: "failed",
      attempts: 0,
      canRetry: true,
    });
    expect(listJson.data[0]).not.toHaveProperty("workspaceId");
    expect(JSON.stringify(listJson.data[0])).not.toContain(job.id);
    expect(JSON.stringify(listJson.data[0])).not.toContain("email.reply");
    expect(JSON.stringify(listJson.data[0])).not.toContain("/Users/wilson");
    expect(JSON.stringify(listJson.data[0])).not.toContain("provider");

    const retryResponse = await POST(request("http://localhost/api/runtime", {
      method: "POST",
      body: JSON.stringify({
        action: "retry-job",
        input: {
          operationId: listJson.data[0].operationId,
        },
      }),
    }));
    const retryJson = await retryResponse.json();

    expect(retryResponse.status).toBe(200);
    expect(retryJson).toMatchObject({
      success: true,
      data: {
        operationId: listJson.data[0].operationId,
        status: "queued",
        canRetry: false,
      },
    });
    expect(JSON.stringify(retryJson.data)).not.toContain(job.id);
    expect(runtime.workflows.getJob(job.id)).toMatchObject({
      status: "queued",
      error: "Retry requested by operations",
    });
    expect(runtime.listEvents(5).map((event) => event.type)).toContain("runtime.job.retry_requested");
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
      title: "Operator request",
      status: "queued",
    });
    expect(json.data).not.toHaveProperty("id");
    expect(json.data).not.toHaveProperty("workflow");
    expect(json.data).not.toHaveProperty("input");
    expect(json.data).not.toHaveProperty("steps");
    expect(JSON.stringify(json.data)).not.toContain("operator.command");
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
