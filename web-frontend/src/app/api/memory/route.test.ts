import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-memory-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string, init?: { method?: string; body?: BodyInit | null }): NextRequest {
  return new NextRequest(url, init);
}

describe("/api/memory route", () => {
  it("writes local SSA memory and defaults Hermes memories to suggested authority", async () => {
    const { GET, POST } = await import("./route");

    const writeResponse = await POST(request("http://localhost/api/memory?project=demo-exporter", {
      method: "POST",
      body: JSON.stringify({
        kind: "episode",
        customerName: "Beta Buyer",
        title: "Hermes negotiation note",
        body: "Hermes remembers that Beta Buyer reacted badly to rush pressure.",
        tags: ["negotiation", "preference"],
        source: { type: "hermes", id: "h-1" },
        confidence: 0.7,
      }),
    }));
    const written = await writeResponse.json();

    expect(written).toMatchObject({
      success: true,
      data: {
        workspaceId: "demo-exporter",
        kind: "episode",
        customerName: "Beta Buyer",
        authority: "suggested",
        source: { type: "hermes", id: "h-1" },
      },
    });

    const searchResponse = await GET(request("http://localhost/api/memory?project=demo-exporter&query=Beta%20rush&authorities=suggested"));
    const search = await searchResponse.json();

    expect(search.success).toBe(true);
    expect(search.data).toHaveLength(1);
    expect(search.data[0]).toMatchObject({
      id: written.data.id,
      authority: "suggested",
      reason: expect.stringContaining("Matched"),
    });
  });

  it("returns a memory timeline for customer context", async () => {
    const { GET, POST } = await import("./route");

    await POST(request("http://localhost/api/memory?project=demo-exporter", {
      method: "POST",
      body: JSON.stringify({
        kind: "fact",
        customerName: "Gamma Buyer",
        title: "Margin risk guardrail",
        body: "Operator marked Gamma Buyer as a margin risk because they request repeated discount exceptions.",
        tags: ["risk", "discount"],
        source: { type: "operator", id: "note-1" },
        idempotencyKey: "gamma-margin-risk",
      }),
    }));

    const timelineResponse = await GET(request("http://localhost/api/memory?project=demo-exporter&mode=timeline&query=Gamma%20discount&customerName=Gamma%20Buyer"));
    const timeline = await timelineResponse.json();

    expect(timeline).toMatchObject({
      success: true,
      data: {
        workspaceId: "demo-exporter",
        customerName: "Gamma Buyer",
        openRisks: ["Margin risk guardrail"],
      },
    });
    expect(timeline.data.summary).toContain("fact: Margin risk guardrail");
  });
});
