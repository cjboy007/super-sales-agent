import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-events-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  delete process.env.SSA_BETA_AUTH_TOKENS;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(token?: string): Request {
  return new Request("http://localhost/api/events", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

async function readFirstChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const result = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(result.value);
}

async function readInitialChunks(response: Response, chunks = 2): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const decoder = new TextDecoder();
  let text = "";
  for (let index = 0; index < chunks; index += 1) {
    const result = await reader.read();
    if (result.done) break;
    text += decoder.decode(result.value);
  }
  await reader.cancel();
  return text;
}

describe("/api/events route", () => {
  it("serves persisted activity as a business-facing stream without backend fields", async () => {
    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    const command = runtime.createOperatorCommand({
      workspaceId: "farreach",
      page: "dashboard",
      message: "Review the live activity stream.",
    });

    const { GET } = await import("./route");
    const response = await GET();
    const chunk = await readFirstChunk(response);

    expect(chunk).toContain("event: agent-update");
    expect(chunk).toContain("Operator request");
    expect(chunk).toContain("dashboard");
    expect(chunk).not.toContain("operator.command.queued");
    expect(chunk).not.toContain(command.id);
    expect(chunk).not.toContain("jobId");
    expect(chunk).not.toContain("jobIds");
    expect(chunk).not.toContain("workflow");
    expect(chunk).not.toContain("runtimeEventId");
    expect(chunk).not.toContain("runtimeEventType");
    expect(chunk).not.toContain("workspaceId");
    expect(chunk).not.toContain("file");
    expect(chunk).not.toContain("/Users/");
  });

  it("includes recent sent-log entries from runtime activity memory", async () => {
    fs.mkdirSync(path.join(tempRoot, "companies", "farreach", "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "companies", "farreach", "mail", "sent-log.json"),
      JSON.stringify([
        {
          email: "buyer@example.com",
          company: "Buyer Co",
          sent_at: "2026-05-26T00:00:00.000Z",
          subject: "Quote follow-up",
          tracking_id: "trk-internal-123",
          provider: "smtp-provider",
          file: "/Users/wilson/.ssa/data/companies/farreach/mail/sent-log.json",
        },
      ]),
      "utf-8"
    );

    const { GET } = await import("./route");
    const response = await GET();
    const chunk = await readFirstChunk(response);

    expect(chunk).toContain("event: email-progress");
    expect(chunk).toContain("buyer@example.com");
    expect(chunk).toContain("Quote follow-up");
    expect(chunk).not.toContain("tracking_id");
    expect(chunk).not.toContain("trk-internal-123");
    expect(chunk).not.toContain("provider");
    expect(chunk).not.toContain("/Users/");
  });

  it("limits the activity stream to workspaces allowed by the beta token", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);

    const { createSalesRuntime } = await import("@/lib/runtime");
    const runtime = createSalesRuntime();
    runtime.createOperatorCommand({
      workspaceId: "farreach",
      page: "leads",
      message: "Review Farreach customers.",
    });
    runtime.createOperatorCommand({
      workspaceId: "hero-pumps",
      page: "pump-dashboard",
      message: "Review Hero Pumps customers.",
    });

    fs.mkdirSync(path.join(tempRoot, "companies", "farreach", "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "companies", "farreach", "mail", "sent-log.json"),
      JSON.stringify([{ email: "farreach@example.com", company: "Farreach Buyer", sent_at: "2026-05-26T00:00:00.000Z", subject: "Farreach follow-up" }]),
      "utf-8"
    );
    fs.mkdirSync(path.join(tempRoot, "companies", "hero-pumps", "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "companies", "hero-pumps", "mail", "sent-log.json"),
      JSON.stringify([{ email: "hero@example.com", company: "Hero Buyer", sent_at: "2026-05-26T00:00:00.000Z", subject: "Hero follow-up" }]),
      "utf-8"
    );

    const { GET } = await import("./route");
    const response = await GET(request("farreach-token"));
    const chunk = await readInitialChunks(response, 2);

    expect(response.status).toBe(200);
    expect(chunk).toContain("leads");
    expect(chunk).toContain("Farreach follow-up");
    expect(chunk).not.toContain("pump-dashboard");
    expect(chunk).not.toContain("Hero follow-up");
    expect(chunk).not.toContain("hero@example.com");
    expect(chunk).not.toContain("hero-pumps");
  });

  it("does not leak seeded sent-log activity to another scoped beta workspace", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "hero-token", workspaces: ["hero-pumps"] },
    ]);

    fs.mkdirSync(path.join(tempRoot, "companies", "farreach", "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "companies", "farreach", "mail", "sent-log.json"),
      JSON.stringify([
        {
          email: "farreach-private@example.com",
          company: "Farreach Private Buyer",
          sent_at: "2026-05-26T00:00:00.000Z",
          subject: "Farreach private follow-up",
        },
      ]),
      "utf-8"
    );

    const { GET } = await import("./route");
    const response = await GET(request("hero-token"));
    const chunk = await readInitialChunks(response, 1);

    expect(response.status).toBe(200);
    expect(chunk).toContain("event: agent-update");
    expect(chunk).not.toContain("Farreach private follow-up");
    expect(chunk).not.toContain("farreach-private@example.com");
    expect(chunk).not.toContain("Farreach Private Buyer");
  });
});
