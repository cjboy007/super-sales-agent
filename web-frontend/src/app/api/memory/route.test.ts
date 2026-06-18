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
        kind: "episode",
        customerName: "Beta Buyer",
        authority: "suggested",
      },
    });
    expect(JSON.stringify(written.data)).not.toContain("workspaceId");
    expect(JSON.stringify(written.data)).not.toContain("source");
    expect(JSON.stringify(written.data)).not.toContain("metadata");
    expect(JSON.stringify(written.data)).not.toContain("provider");

    const searchResponse = await GET(request("http://localhost/api/memory?project=demo-exporter&query=Beta%20rush&authorities=suggested"));
    const search = await searchResponse.json();

    expect(search.success).toBe(true);
    expect(search.data).toHaveLength(1);
    expect(search.data[0]).toMatchObject({
      id: written.data.id,
      authority: "suggested",
      reason: expect.stringContaining("Matched"),
    });
    const serialized = JSON.stringify(search.data);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("source");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
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
        customerName: "Gamma Buyer",
        openRisks: ["Margin risk guardrail"],
      },
    });
    expect(timeline.data.summary).toContain("fact: Margin risk guardrail");
    const serialized = JSON.stringify(timeline.data);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("source");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });

  it("returns customer memory context without retrieval internals or source paths", async () => {
    const { GET, POST } = await import("./route");

    await POST(request("http://localhost/api/memory?project=demo-exporter", {
      method: "POST",
      body: JSON.stringify({
        kind: "fact",
        customerName: "Path Buyer",
        title: "Local file note",
        body: "Path Buyer quote was imported from /Users/wilson/.ssa/data/companies/demo-exporter/quotes/local.pdf.",
        source: {
          type: "document",
          id: "doc-1",
          path: "/Users/wilson/.ssa/data/companies/demo-exporter/quotes/local.pdf",
        },
      }),
    }));

    const contextResponse = await GET(request("http://localhost/api/memory?project=demo-exporter&mode=customer-context&query=Path%20Buyer&customerName=Path%20Buyer"));
    const context = await contextResponse.json();

    expect(context.success).toBe(true);
    expect(context.data.facts).toHaveLength(1);
    const serialized = JSON.stringify(context.data);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("customerId");
    expect(serialized).not.toContain("retrieval");
    expect(serialized).not.toContain("source");
    expect(serialized).not.toContain("metadata");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });
});
