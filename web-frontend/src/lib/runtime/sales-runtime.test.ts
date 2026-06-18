import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalEmailFlag = process.env.SSA_ENABLE_REAL_EMAIL_SEND;
const originalDocumentFlag = process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenRouterApiKey = process.env.OPENROUTER_API_KEY;
const originalDeepSeekApiKey = process.env.DEEPSEEK_API_KEY;
const originalDeepSeekBaseUrl = process.env.DEEPSEEK_BASE_URL;
const originalLlmModel = process.env.SSA_LLM_MODEL;

let tempRoot = "";

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-runtime-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  process.env.SSA_LLM_PROVIDER = "mock";
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.SSA_LLM_MODEL;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();

  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalEmailFlag === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
  else process.env.SSA_ENABLE_REAL_EMAIL_SEND = originalEmailFlag;

  if (originalDocumentFlag === undefined) delete process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION;
  else process.env.SSA_ENABLE_REAL_DOCUMENT_GENERATION = originalDocumentFlag;

  if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
  else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

  if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiApiKey;

  if (originalOpenRouterApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOpenRouterApiKey;

  if (originalDeepSeekApiKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = originalDeepSeekApiKey;

  if (originalDeepSeekBaseUrl === undefined) delete process.env.DEEPSEEK_BASE_URL;
  else process.env.DEEPSEEK_BASE_URL = originalDeepSeekBaseUrl;

  if (originalLlmModel === undefined) delete process.env.SSA_LLM_MODEL;
  else process.env.SSA_LLM_MODEL = originalLlmModel;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("SalesRuntime", () => {
  it("keeps Farreach and Hero Pumps as reference workspace adapters", () => {
    const runtime = createSalesRuntime();
    const workspaces = runtime.listWorkspaces();

    expect(workspaces.map((workspace) => workspace.id)).toEqual(["farreach", "hero-pumps"]);
    expect(runtime.getWorkspace("farreach").packs).toContain("quotation");
    expect(runtime.getWorkspace("hero-pumps").packs).toContain("email-reply");
  });

  it("creates a local workspace adapter for a new salesperson without code changes", () => {
    const runtime = createSalesRuntime();
    const workspace = runtime.getWorkspace("new-salesperson");

    expect(workspace.id).toBe("new-salesperson");
    expect(workspace.capabilities.crm).toBe("csv");
    expect(workspace.packs).toContain("follow-up");
    expect(workspace.data.leadsPath).toContain(path.join("companies", "new-salesperson", "leads"));
  });

  it("keeps built-in workspace runtime data under company folders", () => {
    const runtime = createSalesRuntime();

    expect(runtime.getWorkspace("farreach").data.leadsPath).toContain(path.join("companies", "farreach", "leads"));
    expect(runtime.getWorkspace("hero-pumps").data.leadsPath).toContain(path.join("companies", "hero-pumps", "leads"));
    expect(runtime.getWorkspace("hero-pumps").data.templatesPath).toContain(path.join("companies", "hero-pumps", "campaign-tracker"));
  });

  it("registers a new workspace and includes it in runtime snapshots", () => {
    const runtime = createSalesRuntime();
    const workspace = runtime.registerWorkspace({
      id: "demo-exporter",
      name: "Demo Exporter",
      brandName: "Demo Export Co.",
      industry: "Export B2B industrial parts",
      packs: ["email-reply", "quotation"],
      capabilities: { quotations: true, documents: true },
      identity: {
        senderName: "Demo Sales",
        senderEmail: "sales@example.com",
      },
    });

    expect(workspace).toMatchObject({
      id: "demo-exporter",
      name: "Demo Exporter",
      brandName: "Demo Export Co.",
      capabilities: { crm: "csv", quotations: true, documents: true, emailSync: false },
      packs: ["email-reply", "quotation"],
    });
    expect(runtime.listWorkspaces().map((item) => item.id)).toEqual(["farreach", "hero-pumps", "demo-exporter"]);
    expect(runtime.snapshot().workspaces.map((item) => item.id)).toContain("demo-exporter");
    expect(runtime.snapshot().events[0]).toMatchObject({
      type: "workspace.registered",
      workspaceId: "demo-exporter",
    });
  });

  it("does not allow registered workspaces to overwrite built-in proof workspaces", () => {
    const runtime = createSalesRuntime();

    expect(() => runtime.registerWorkspace({ id: "farreach", name: "Replacement" })).toThrow(
      "Workspace farreach is built in and cannot be overwritten."
    );
  });

  it("lists first-class sales packs", () => {
    const runtime = createSalesRuntime();
    const packs = runtime.listPacks();

    expect(packs.map((pack) => pack.id)).toEqual([
      "email-reply",
      "follow-up",
      "quotation",
      "product-catalog",
      "payment-collection",
      "export-b2b",
    ]);
    expect(packs.find((pack) => pack.id === "quotation")?.sideEffects).toContain("document.generate");
  });

  it("runs LLM tasks through deterministic mock fallback", async () => {
    const runtime = createSalesRuntime();
    const result = await runtime.runLlm({
      task: "classify",
      workspaceId: "farreach",
      input: "Can you send a quotation for 500 units?",
    });

    expect(result.source).toBe("mock");
    expect(result.structured?.label).toBe("quotation_request");
    expect(runtime.snapshot().events[0].type).toBe("llm.task.completed");
  });

  it("can swap to an OpenRouter LLM provider and fall back locally when unavailable", async () => {
    process.env.SSA_LLM_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.SSA_LLM_MODEL = "openai/gpt-4o-mini";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        model: "openai/gpt-4o-mini",
        choices: [{ message: { content: "Provider draft" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const runtime = createSalesRuntime();
    const providerResult = await runtime.runLlm({
      task: "draft",
      workspaceId: "demo-exporter",
      input: "Draft a reply for a pump quote.",
    });

    expect(providerResult).toMatchObject({
      provider: "openrouter",
      source: "provider",
      text: "Provider draft",
      structured: {
        model: "openai/gpt-4o-mini",
        workspaceId: "demo-exporter",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
    }));

    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const fallbackResult = await runtime.runLlm({
      task: "classify",
      workspaceId: "demo-exporter",
      input: "Can you quote 100 pumps?",
    });

    expect(fallbackResult).toMatchObject({
      provider: "mock",
      source: "mock",
      structured: { label: "quotation_request" },
    });

  });

  it("can use the direct DeepSeek provider with the v4 pro model", async () => {
    process.env.SSA_LLM_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "test-deepseek-key";
    process.env.SSA_LLM_MODEL = "deepseekv4pro";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        model: "deepseek-v4-pro",
        choices: [{ message: { content: "DeepSeek draft" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const runtime = createSalesRuntime();
    const result = await runtime.runLlm({
      task: "draft",
      workspaceId: "demo-exporter",
      input: "Draft a reply for a deep well pump lead.",
    });

    expect(result).toMatchObject({
      provider: "deepseek",
      source: "provider",
      text: "DeepSeek draft",
      structured: {
        model: "deepseek-v4-pro",
        workspaceId: "demo-exporter",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-deepseek-key" }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("deepseek-v4-pro");
  });

  it("can use the direct OpenAI provider without routing through OpenRouter", async () => {
    process.env.SSA_LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.SSA_LLM_MODEL = "openai/gpt-4o-mini";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        model: "gpt-4o-mini",
        choices: [{ message: { content: "OpenAI draft" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const runtime = createSalesRuntime();
    const result = await runtime.runLlm({
      task: "draft",
      workspaceId: "demo-exporter",
      input: "Draft a reply for an export quote.",
    });

    expect(result).toMatchObject({
      provider: "openai",
      source: "provider",
      text: "OpenAI draft",
      structured: {
        model: "gpt-4o-mini",
        workspaceId: "demo-exporter",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/chat/completions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-openai-key" }),
    }));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("auto-detects DeepSeek before OpenAI when no explicit LLM provider is set", async () => {
    delete process.env.SSA_LLM_PROVIDER;
    process.env.DEEPSEEK_API_KEY = "auto-deepseek-key";
    process.env.OPENAI_API_KEY = "auto-openai-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        model: "deepseek-v4-pro",
        choices: [{ message: { content: "Auto DeepSeek summary" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const runtime = createSalesRuntime();
    const result = await runtime.runLlm({
      task: "summarize",
      workspaceId: "farreach",
      input: "Summarize the buyer request.",
    });

    expect(result.provider).toBe("deepseek");
    expect(result.source).toBe("provider");
    expect(result.text).toBe("Auto DeepSeek summary");
    expect(fetchMock).toHaveBeenCalledWith("https://api.deepseek.com/chat/completions", expect.any(Object));
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("deepseek-v4-pro");
  });

  it("blocks and audits email side effects by default", () => {
    const runtime = createSalesRuntime();
    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Send quote follow-up",
      payload: { to: "buyer@example.com", subject: "Quote follow-up" },
    });

    expect(decision.status).toBe("blocked");
    expect(decision.realExecutionEnabled).toBe(false);
    expect(decision.reason).toContain("SSA_ENABLE_REAL_EMAIL_SEND=true");

    const snapshot = runtime.snapshot();
    expect(snapshot.sideEffects[0].id).toBe(decision.id);
    expect(snapshot.events[0].payload).toMatchObject({
      decisionId: decision.id,
      kind: "email.send",
      status: "blocked",
    });
    expect(fs.existsSync(path.join(tempRoot, "companies", "farreach", "events", "events.json"))).toBe(true);
  });

  it("blocks and audits document generation side effects by default", () => {
    const runtime = createSalesRuntime();
    const decision = runtime.requestDocumentGeneration({
      workspaceId: "farreach",
      documentType: "QT",
      customer: "Example Buyer",
      payload: { quotationNo: "QT-20260526-001" },
    });

    expect(decision.status).toBe("blocked");
    expect(decision.kind).toBe("document.generate");
    expect(decision.reason).toContain("SSA_ENABLE_REAL_DOCUMENT_GENERATION=true");
    expect(runtime.snapshot().events[0]).toMatchObject({
      type: "document.generate.requested",
      workspaceId: "farreach",
    });
  });

  it("does not save PI records before document generation is approved", async () => {
    const runtime = createSalesRuntime();
    const data = {
      company: { name: "Seller", address: "A", phone: "", email: "" },
      customer: { company_name: "Buyer Co", contact: "Ada", email: "ada@example.com", phone: "", address: "B", country: "Germany" },
      shipment: {
        date: "2026-06-18",
        vessel: "",
        departure_port: "Shenzhen",
        destination_port: "Hamburg",
        incoterms: "FOB",
        country_of_origin: "China",
        marks: "N/M",
      },
      currency: "USD",
      freight: 0,
      insurance: 0,
      products: [{
        description: "Pump",
        specification: "P-1",
        hs_code: "8413",
        quantity: 2,
        unit_price: 10,
        net_weight_kg: 1,
        gross_weight_kg: 1.2,
        dimensions_cm: "10x10x10",
        package_type: "Carton",
        packages: 1,
      }],
      pi_info: { pi_no: "PI-20260618-001", valid_until: "2026-07-18" },
      ci_info: { ci_no: "CI-20260618-001", ci_date: "2026-06-18", payment_terms: "T/T" },
      pl_info: { pl_no: "PL-20260618-001" },
    };

    const result = await runtime.generateTradeDocuments({
      workspaceId: "farreach",
      data,
      docTypes: ["PI"],
    });

    expect(result.success).toBe(true);
    expect(result.blocked).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, "companies", "farreach", "documents", "pi-records", "PI-20260618-001.json"))).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, "companies", "farreach", "pricing", "price-memory.json"))).toBe(false);
  });

  it("allows email side effects only when explicitly enabled", () => {
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = "true";
    const runtime = createSalesRuntime();

    const decision = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "hero-pumps",
      summary: "Send approved reply",
      payload: { to: "buyer@example.com", subject: "Approved reply" },
    });

    expect(decision.status).toBe("allowed");
    expect(decision.realExecutionEnabled).toBe(true);
  });

  it("creates a separate retry review record for idempotent side-effect requests", () => {
    const runtime = createSalesRuntime();
    const original = runtime.requestSideEffect({
      kind: "email.send",
      workspaceId: "farreach",
      summary: "Send quote follow-up",
      payload: { to: "buyer@example.com", subject: "Quote follow-up" },
      idempotencyKey: "farreach:email:buyer@example.com:Quote follow-up",
    });

    const retried = runtime.retrySideEffect(original.id);

    expect(retried.id).not.toBe(original.id);
    expect(retried).toMatchObject({
      status: "retry_requested",
      retryOf: original.id,
      retryCount: 1,
      payload: expect.objectContaining({
        to: "buyer@example.com",
        subject: "Quote follow-up",
        retryOf: original.id,
      }),
    });

    const decisions = runtime.listSideEffects(10);
    expect(decisions.map((decision) => decision.id)).toEqual(expect.arrayContaining([
      original.id,
      retried.id,
    ]));
    expect(decisions.find((decision) => decision.id === original.id)).toMatchObject({
      status: "blocked",
    });
    expect(decisions.find((decision) => decision.id === retried.id)).toMatchObject({
      status: "retry_requested",
      retryOf: original.id,
    });
  });

  it("returns empty lead memory for a new local workspace", () => {
    const runtime = createSalesRuntime();
    const leads = runtime.memory.getLeads("new-salesperson", { page: 1, pageSize: 20 });
    const stats = runtime.memory.getLeadStats("new-salesperson");
    const countries = runtime.memory.getLeadCountries("new-salesperson");

    expect(leads).toMatchObject({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    expect(stats.data).toEqual({ total: 0, hot: 0, warm: 0, cold: 0, countries: 0 });
    expect(countries.data).toEqual([]);
  });

  it("loads Hero Pumps CSV leads through sales memory", () => {
    const leadsDir = path.join(tempRoot, "companies", "hero-pumps", "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "western-europe.csv"),
      [
        "company,contact_name,email,website,country,industry,source,tier,position,department,confidence,verification_status",
        "Acme Pumps,Ada,ada@example.com,https://example.com,Germany,HVAC,test,Tier1 Buyer,Manager,Sales,91%,verified",
        "Nordic Heat,Nils,nils@example.com,https://nordic.example,Sweden,Installer,test,Tier2 Partner,Owner,Sales,75%,verified",
      ].join("\n"),
      "utf-8"
    );

    const runtime = createSalesRuntime();
    const result = runtime.memory.getLeads("hero-pumps", { score: "Hot", page: 1, pageSize: 20 });

    expect(result.total).toBe(1);
    expect(result.data?.[0]).toMatchObject({
      companyName: "Acme Pumps",
      country: "Germany",
      score: "Hot",
    });
    expect(runtime.memory.getLeadCountries("hero-pumps").data).toEqual(["Germany", "Sweden"]);
  });

  it("runs local workflows through LLM fallback and side-effect gate", async () => {
    const runtime = createSalesRuntime();
    const job = runtime.workflows.enqueue("farreach", "email.reply", {
      subject: "Quotation request",
      body: "Please send price for 500 units.",
      email: "buyer@example.com",
    });

    const completed = await runtime.workflows.run(job.id);

    expect(completed.status).toBe("completed");
    expect(completed.steps.map((step) => step.status)).toEqual(["completed", "completed", "completed"]);
    expect(completed.steps[0].output).toMatchObject({
      source: "mock",
      structured: { label: "quotation_request" },
    });
    expect(completed.steps[1].output).toMatchObject({
      kind: "email.send",
      status: "blocked",
      realExecutionEnabled: false,
    });

    const snapshot = runtime.snapshot();
    expect(snapshot.jobs[0].id).toBe(job.id);
    expect(snapshot.events.some((event) => event.type === "workflow.completed")).toBe(true);
  });

  it("queues operator commands through runtime jobs and audit events", () => {
    const runtime = createSalesRuntime();
    const command = runtime.createOperatorCommand({
      workspaceId: "demo-exporter",
      page: "leads",
      url: "/leads",
      message: "Research these filtered leads, draft outreach, and recommend follow-up next steps.",
      context: {
        filter: "Hot",
        visible: [{ company: "Demo Buyer", email: "buyer@example.com" }],
      },
    });

    expect(command).toMatchObject({
      workspaceId: "demo-exporter",
      project: "demo-exporter",
      page: "leads",
      status: "queued_for_local_runtime",
      sideEffects: "blocked",
    });
    expect(command.jobId).toBeTruthy();
    expect(command.jobIds).toHaveLength(3);
    expect(command.plan?.jobs.map((job) => job.workflow)).toEqual([
      "email.reply",
      "lead.import",
      "follow_up.plan",
    ]);

    const commandPath = path.join(tempRoot, "companies", "demo-exporter", "operator-commands", `${command.id}.json`);
    expect(JSON.parse(fs.readFileSync(commandPath, "utf-8"))).toMatchObject({
      id: command.id,
      jobId: command.jobId,
      jobIds: command.jobIds,
      context: { filter: "Hot" },
    });

    const snapshot = runtime.snapshot();
    expect(snapshot.jobs.map((job) => job.workflow)).toEqual(expect.arrayContaining([
      "email.reply",
      "lead.import",
      "follow_up.plan",
    ]));
    expect(snapshot.jobs.map((job) => job.id)).toEqual(expect.arrayContaining(command.jobIds || []));
    expect(snapshot.jobs[0]).toMatchObject({
      workspaceId: "demo-exporter",
      status: "queued",
    });
    expect(snapshot.events[0]).toMatchObject({
      type: "operator.command.queued",
      workspaceId: "demo-exporter",
      payload: {
        commandId: command.id,
        jobId: command.jobId,
        jobIds: command.jobIds,
        planSource: "jaden-planner",
        sideEffects: "blocked",
      },
    });
  });

  it("maps persisted runtime events into operator activity events", () => {
    const runtime = createSalesRuntime();
    const command = runtime.createOperatorCommand({
      workspaceId: "farreach",
      page: "dashboard",
      message: "Summarize the current dashboard risks.",
      context: { visibleStats: ["activeLeads", "todayEmails"] },
    });

    const activity = runtime.listActivityEvents(5);

    expect(activity[0]).toMatchObject({
      id: expect.stringContaining("operator.command.queued"),
      type: "operator-command",
      data: {
        label: "operator-command",
        runtimeEventType: "operator.command.queued",
        workspaceId: "farreach",
        commandId: command.id,
        jobId: command.jobId,
        jobIds: command.jobIds,
      },
    });
  });

  it("stores approval decisions in Sales Memory and records audit events", () => {
    const runtime = createSalesRuntime();
    const approval = runtime.memory.upsertApproval({
      workspaceId: "demo-exporter",
      id: "sample-quote",
      dealId: "demo-deal",
      account: "Demo Buyer",
      title: "Sample quote approval",
      value: "$4K",
      risk: "Low",
      due: "Today",
      recommendation: "Approve locally.",
      guardrail: "No customer send.",
    }, runtime.recordEvent.bind(runtime));

    expect(approval).toMatchObject({
      workspaceId: "demo-exporter",
      status: "pending",
    });

    const updated = runtime.memory.updateApproval("demo-exporter", {
      id: "sample-quote",
      status: "rejected",
      decisionBy: "Wilson",
      decisionNote: "Margin too low",
    }, runtime.recordEvent.bind(runtime));

    expect(updated).toMatchObject({
      status: "rejected",
      decisionBy: "Wilson",
      decisionNote: "Margin too low",
    });
    expect(runtime.snapshot().events[0]).toMatchObject({
      type: "approval.updated",
      workspaceId: "demo-exporter",
      payload: {
        approvalId: "sample-quote",
        sideEffects: "blocked",
      },
    });
  });

  it("returns agent-state summaries from runtime jobs and approval gates", () => {
    const runtime = createSalesRuntime();
    runtime.workflows.enqueue("farreach", "email.reply", { message: "Draft reply" });

    const state = runtime.memory.getAgentState("farreach");

    expect(state.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "outreach-drafts",
        name: "Outreach Drafts",
        activeTasks: 1,
      }),
      expect.objectContaining({
        id: "approval-gates",
        name: "Approval Gates",
        approvalGated: expect.any(Number),
      }),
      expect.objectContaining({
        id: "jaden-runtime",
        name: "Jaden Runtime",
        activeTasks: 1,
      }),
    ]));
    expect(state.agents).toHaveLength(6);
  });

  it("stores authoritative SSA memory separately from Hermes/OpenClaw suggestions", () => {
    const runtime = createSalesRuntime();
    const authoritative = runtime.writeMemory({
      workspaceId: "demo-exporter",
      kind: "fact",
      customerName: "Acme Buyer",
      title: "Approved discount ceiling",
      body: "SSA approval ledger says Acme Buyer cannot receive more than 5% discount without margin review.",
      tags: ["approval", "discount", "risk"],
      source: { type: "approval", id: "approval-1" },
      confidence: 1,
      idempotencyKey: "acme-discount-ceiling",
    });
    const suggested = runtime.writeMemory({
      workspaceId: "demo-exporter",
      kind: "fact",
      customerName: "Acme Buyer",
      title: "Hermes preference recall",
      body: "Hermes recalls that Acme Buyer may prefer aggressive discount offers.",
      tags: ["discount", "external-agent"],
      source: { type: "hermes", id: "hermes-memory-1" },
      confidence: 0.6,
    });

    expect(authoritative.authority).toBe("authoritative");
    expect(suggested.authority).toBe("suggested");
    expect(fs.existsSync(path.join(tempRoot, "companies", "demo-exporter", "memory", "records.json"))).toBe(true);

    const allHits = runtime.searchMemory({
      workspaceId: "demo-exporter",
      query: "Acme Buyer discount",
      customerName: "Acme Buyer",
    });
    expect(allHits.map((hit) => hit.id)).toEqual(expect.arrayContaining([authoritative.id, suggested.id]));
    expect(allHits[0]).toMatchObject({
      id: authoritative.id,
      authority: "authoritative",
    });

    const suggestedOnly = runtime.searchMemory({
      workspaceId: "demo-exporter",
      query: "Acme Buyer discount",
      customerName: "Acme Buyer",
      authorities: ["suggested"],
    });
    expect(suggestedOnly.map((hit) => hit.authority)).toEqual(["suggested"]);

    const context = runtime.memory.getCustomer360("demo-exporter", "Acme Buyer");
    expect(context.memory.facts.map((hit) => hit.authority)).toEqual(expect.arrayContaining(["authoritative", "suggested"]));
    expect(context.negotiation.openRisks).toContain("Approved discount ceiling");
  });
});
