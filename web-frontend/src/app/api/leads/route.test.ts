import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalAuthTokens = process.env.SSA_BETA_AUTH_TOKENS;
let tempRoot = "";

function makeRequest(url: string, token?: string): NextRequest {
  return new NextRequest(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-leads-route-test-"));
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

describe("/api/leads route", () => {
  it("does not use legacy beta tokens as a workspace sign-in gate", async () => {
    process.env.SSA_BETA_AUTH_TOKENS = JSON.stringify([
      { token: "farreach-token", workspaces: ["farreach"] },
    ]);

    const response = await GET(makeRequest("http://localhost/api/leads?project=hero-pumps&action=stats", "farreach-token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, data: { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 } });
  });

  it("treats a missing default Farreach lead export as empty local data", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(makeRequest("http://localhost/api/leads?project=farreach"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, data: [], total: 0 });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("serves imported Farreach CSV leads from the workspace leads folder", async () => {
    const leadsDir = path.join(tempRoot, "companies", "farreach", "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "crm-export.csv"),
      [
        "company,contact_name,email,website,country,industry,tier,position,confidence",
        "Cable Buyer,Ada,ada@cable.example,https://cable.example,USA,Electronics,Tier1 Buyer,Owner,92%",
      ].join("\n"),
      "utf-8"
    );

    const response = await GET(makeRequest("http://localhost/api/leads?project=farreach&action=combined"));
    const json = await response.json();

    expect(json.data.stats.data).toEqual({ total: 1, hot: 1, warm: 0, cold: 0, countries: 1 });
    expect(json.data.leads.data[0]).toMatchObject({
      companyName: "Cable Buyer",
      email: "ada@cable.example",
      score: "Hot",
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("keeps combined response shape for unknown local workspaces", async () => {
    const response = await GET(makeRequest("http://localhost/api/leads?project=new-salesperson&action=combined"));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      data: {
        stats: { success: true, data: { total: 0, hot: 0, warm: 0, cold: 0, countries: 0 } },
        countries: { success: true, data: [] },
        leads: { success: true, data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 },
      },
    });
  });

  it("serves Hero Pumps leads via Sales Memory without route-local parsing", async () => {
    const leadsDir = path.join(tempRoot, "companies", "hero-pumps", "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "nordic-west.csv"),
      [
        "company,contact_name,email,website,country,industry,source,tier,position,department,confidence,verification_status",
        "Nordic Heat,Nils,nils@example.com,https://nordic.example,Sweden,Installer,test,Tier2 Partner,Owner,Sales,75%,verified",
      ].join("\n"),
      "utf-8"
    );

    const response = await GET(makeRequest("http://localhost/api/leads?project=hero-pumps&action=stats"));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      data: { total: 1, hot: 0, warm: 1, cold: 0, countries: 1 },
    });
  });

  it("serves CSV leads for a new local workspace without code changes", async () => {
    const leadsDir = path.join(tempRoot, "companies", "new-salesperson", "leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    fs.writeFileSync(
      path.join(leadsDir, "crm-export.csv"),
      [
        "company,contact_name,email,website,country,industry,tier,position,confidence",
        "Local Buyer,Ada,ada@local.example,https://local.example,USA,HVAC,Tier1 Buyer,Owner,92%",
      ].join("\n"),
      "utf-8"
    );

    const response = await GET(makeRequest("http://localhost/api/leads?project=new-salesperson&action=combined"));
    const json = await response.json();

    expect(json.data.stats.data).toEqual({ total: 1, hot: 1, warm: 0, cold: 0, countries: 1 });
    expect(json.data.countries.data).toEqual(["USA"]);
    expect(json.data.leads.data[0]).toMatchObject({
      companyName: "Local Buyer",
      contact: "Ada",
      email: "ada@local.example",
      score: "Hot",
    });
  });
});
