import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-intelligence-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

function writeIntelligence(fileName: string, data: unknown) {
  const dir = path.join(tempRoot, "intelligence");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(data), "utf-8");
}

describe("/api/intelligence routes", () => {
  it("serves empty local intelligence fallbacks through Sales Memory", async () => {
    const { GET } = await import("./insights/route");

    const response = await GET(request("http://localhost/api/intelligence/insights?project=demo-exporter"));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      insights: [],
      cached: true,
      generatedAt: null,
    });
  });

  it("filters junk news and preserves existing response metadata", async () => {
    writeIntelligence("news.json", {
      updatedAt: "2026-05-26T00:00:00.000Z",
      news: [
        { id: "1", title: "Cable market size forecast report", source: "GrandViewResearch", tag: "report" },
        { id: "2", title: "Copper spot price moved", source: "LME", tag: "copper" },
      ],
    });
    const { GET } = await import("./news/route");

    const response = await GET(request("http://localhost/api/intelligence/news"));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      updatedAt: "2026-05-26T00:00:00.000Z",
      _totalRaw: 2,
      _filtered: 1,
    });
    expect(json.news).toEqual([{ id: "2", title: "Copper spot price moved", source: "LME", tag: "copper" }]);
  });

  it("filters junk competitor entries through the runtime memory adapter", async () => {
    writeIntelligence("competitors.json", {
      competitors: [
        { id: "junk", company: "Noise", title: "discover/products", url: "/discover/products" },
        { id: "signal", company: "JST", title: "New Shenzhen price signal", url: "https://example.com/signal" },
      ],
    });
    const { GET } = await import("./competitors/route");

    const response = await GET(request("http://localhost/api/intelligence/competitors"));
    const json = await response.json();

    expect(json).toMatchObject({
      success: true,
      _totalRaw: 2,
      _filtered: 1,
    });
    expect(json.competitors).toEqual([{ id: "signal", company: "JST", title: "New Shenzhen price signal", url: "https://example.com/signal" }]);
  });
});
