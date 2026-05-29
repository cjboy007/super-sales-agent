import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalDataReadFlag = process.env.SSA_ENABLE_REAL_DATA_READ;
const originalHeroDataApi = process.env.HERO_DATA_API_URL;

let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-dashboard-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.HERO_DATA_API_URL = "http://hero-data.test";
  delete process.env.SSA_ENABLE_REAL_DATA_READ;

  const leadsDir = path.join(tempRoot, "companies", "hero-pumps", "leads");
  fs.mkdirSync(leadsDir, { recursive: true });
  fs.writeFileSync(
    path.join(leadsDir, "western-europe.csv"),
    [
      "company,contact_name,email,website,country,industry,source,tier,position,department,confidence,verification_status",
      "Acme Pumps,Ada,ada@example.com,https://example.com,Germany,HVAC,test,Tier1 Buyer,Manager,Sales,91%,verified",
    ].join("\n"),
    "utf-8"
  );
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalDataReadFlag === undefined) delete process.env.SSA_ENABLE_REAL_DATA_READ;
  else process.env.SSA_ENABLE_REAL_DATA_READ = originalDataReadFlag;

  if (originalHeroDataApi === undefined) delete process.env.HERO_DATA_API_URL;
  else process.env.HERO_DATA_API_URL = originalHeroDataApi;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/dashboard/overview route", () => {
  it("uses local Hero memory and blocks external data API reads by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/dashboard/overview?project=hero-pumps"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.stats.activeLeads).toBe(1);
    expect(json.data.recentLeads[0]).toMatchObject({
      name: "Acme Pumps",
      email: "ada@example.com",
    });
    expect(json.data.sideEffect).toMatchObject({
      kind: "data.read",
      workspaceId: "hero-pumps",
      status: "blocked",
      realExecutionEnabled: false,
    });
    expect(json.data.sideEffect.reason).toContain("SSA_ENABLE_REAL_DATA_READ=true");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls the Hero data API only when data reads are explicitly enabled", async () => {
    process.env.SSA_ENABLE_REAL_DATA_READ = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/sent-log")) {
        return new Response(JSON.stringify([{ company: "Remote Buyer", subject: "Intro", sent_at: "2026-05-26T00:00:00.000Z" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/follow-up-state")) {
        return new Response(JSON.stringify({ "remote@example.com": { has_reply: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/tracking/replies")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/leads")) {
        return new Response(JSON.stringify([{ company: "Remote Pumps", email: "remote@example.com", tier: "Tier2 Partner" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/dashboard/overview?project=hero-pumps"));
    const json = await response.json();

    expect(fetchMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("http://hero-data.test/sent-log", expect.any(Object));
    expect(json.data.stats).toMatchObject({
      activeLeads: 1,
      todayEmails: 1,
      conversionRate: 100,
    });
    expect(json.data.recentLeads[0]).toMatchObject({
      name: "Remote Pumps",
      email: "remote@example.com",
    });
    expect(json.data.sideEffect).toMatchObject({
      kind: "data.read",
      workspaceId: "hero-pumps",
      status: "allowed",
      realExecutionEnabled: true,
    });
  });
});
