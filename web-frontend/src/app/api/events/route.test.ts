import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-events-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

async function readFirstChunk(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing response body");
  const result = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(result.value);
}

describe("/api/events route", () => {
  it("includes persisted runtime events in the initial activity snapshot", async () => {
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
    expect(chunk).toContain("operator.command.queued");
    expect(chunk).toContain(command.id);
  });

  it("includes recent sent-log entries from runtime activity memory", async () => {
    fs.mkdirSync(path.join(tempRoot, "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "mail", "sent-log.json"),
      JSON.stringify([
        {
          email: "buyer@example.com",
          company: "Buyer Co",
          sent_at: "2026-05-26T00:00:00.000Z",
          subject: "Quote follow-up",
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
  });
});
