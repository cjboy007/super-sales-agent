import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshIntelligenceMock = vi.hoisted(() => vi.fn());
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;

vi.mock("@/lib/runtime", () => ({
  createSalesRuntime: () => ({
    refreshIntelligence: refreshIntelligenceMock,
  }),
}));

beforeEach(() => {
  refreshIntelligenceMock.mockReset();
  process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
    { token: "test-token", workspaces: ["farreach"] },
  ]);
});

afterEach(() => {
  if (originalAuthTokens === undefined) delete process.env.SSA_BETA_AUTH_TOKENS;
  else process.env.SSA_BETA_AUTH_TOKENS = originalAuthTokens;
});

function request(url = "http://localhost/api/intelligence/refresh?project=farreach"): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
    },
  });
}

describe("/api/intelligence/refresh route", () => {
  it("returns a business-facing refresh summary without source or workspace internals", async () => {
    refreshIntelligenceMock.mockResolvedValueOnce({
      success: true,
      workspaceId: "farreach",
      updatedAt: "2026-06-09T08:00:00.000Z",
      newsCount: 12,
      competitorCount: 3,
      sources: [
        { source: "Google News Discovery - cable standards", ok: false, url: "https://news.google.com/rss/search?q=secret", error: "provider timeout" },
      ],
      cache: { hit: false, feed: "news" },
    });
    const { POST } = await import("./route");

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        status: "updated",
        updatedAt: "2026-06-09T08:00:00.000Z",
        newsCount: 12,
        competitorCount: 3,
        cached: false,
        message: "Market intelligence was refreshed.",
      },
    });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("sources");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("Google News");
    expect(serialized).not.toContain("news.google.com");
  });

  it("returns a sanitized retry message when collection fails", async () => {
    refreshIntelligenceMock.mockResolvedValueOnce({
      success: false,
      workspaceId: "farreach",
      updatedAt: "2026-06-09T08:00:00.000Z",
      newsCount: 0,
      competitorCount: 0,
      sources: [
        { source: "RSS provider", ok: false, url: "https://example.com/feed", error: "fetch failed at /Users/wilson/.ssa/cache/provider.log" },
      ],
      error: "No news items were collected; existing intelligence cache was preserved.",
    });
    const { POST } = await import("./route");

    const response = await POST(request());
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      success: false,
      data: {
        status: "needs_retry",
        updatedAt: "2026-06-09T08:00:00.000Z",
        newsCount: 0,
        competitorCount: 0,
        cached: false,
        message: "Market intelligence could not be refreshed. Existing saved intelligence was kept.",
      },
    });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("workspaceId");
    expect(serialized).not.toContain("sources");
    expect(serialized).not.toContain("provider");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain(".ssa");
  });
});
