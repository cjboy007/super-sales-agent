import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-pipeline-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;

  const leadsDir = path.join(tempRoot, "companies", "hero-pumps", "leads");
  fs.mkdirSync(leadsDir, { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "companies", "hero-pumps", "tracking"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "companies", "hero-pumps", "mail"), { recursive: true });

  fs.writeFileSync(
    path.join(leadsDir, "western-europe.csv"),
    [
      "company,contact_name,email,website,country,industry,source,tier,position,department,confidence,verification_status",
      "Acme Pumps,Ada,ada@example.com,https://example.com,Germany,HVAC,test,Tier1 Buyer,Manager,Sales,91%,verified",
      "Nordic Heat,Nils,nils@example.com,https://nordic.example,Sweden,Installer,test,Tier2 Partner,Owner,Sales,75%,verified",
    ].join("\n"),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(tempRoot, "companies", "hero-pumps", "mail", "sent-log.json"),
    JSON.stringify([{ email: "ada@example.com", sent_at: "2026-05-26T10:00:00.000Z", subject: "Initial pump offer" }]),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(tempRoot, "companies", "hero-pumps", "follow-up-state.json"),
    JSON.stringify({
      "ada@example.com": { email: "ada@example.com", follow_up_stage: 2, has_reply: true, is_due: false },
      "nils@example.com": { email: "nils@example.com", follow_up_stage: 1, has_reply: false, is_due: true },
    }),
    "utf-8"
  );
  fs.writeFileSync(path.join(tempRoot, "companies", "hero-pumps", "tracking", "replies.json"), JSON.stringify([]), "utf-8");
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/pipeline/funnel route", () => {
  it("serves Hero funnel data through Sales Memory", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/pipeline/funnel?project=hero-pumps"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.stages.map((stage: { stage: string; count: number }) => [stage.stage, stage.count])).toEqual([
      ["discovery", 2],
      ["qualified", 2],
      ["contacted", 1],
      ["engaged", 1],
      ["quoted", 0],
    ]);
    expect(json.data.totalConversionRate).toBe(0);
    expect(typeof json.data.updatedAt).toBe("string");
  });

  it("returns an empty funnel for a new local workspace", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("http://localhost/api/pipeline/funnel?project=new-salesperson"));
    const json = await response.json();

    expect(json.success).toBe(true);
    expect(json.data.stages.map((stage: { count: number }) => stage.count)).toEqual([0, 0, 0, 0, 0]);
    expect(json.data.totalConversionRate).toBe(0);
  });
});
