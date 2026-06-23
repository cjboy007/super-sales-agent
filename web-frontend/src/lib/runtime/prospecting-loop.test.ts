import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import {
  listProspectingRuns,
  runProspectingDryRun,
  type IcpScore,
  type OpeningAngle,
  type ProspectingCandidate,
  type ProspectingEvidence,
  type ProspectingLeadSource,
  type ProspectingPacket,
  type ProspectingRun,
} from "./prospecting-loop";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-prospecting-loop-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("Autonomous Prospecting Loop dry-run", () => {
  it("exposes the Phase 8 typed dry-run packet contract", () => {
    const source: ProspectingLeadSource = {
      kind: "operator_seed",
      label: "Operator seed",
      reliability: "local",
    };
    const evidence: ProspectingEvidence = {
      kind: "source_url",
      label: "Directory listing",
      summary: "Distributor imports industrial pumps.",
      confidence: 0.78,
      sourceUrl: "https://directory.example/apex",
      source,
    };
    const candidate: ProspectingCandidate = {
      companyName: "Apex Pump Distributors",
      website: "https://apex.example",
      country: "US",
      industry: "industrial pumps",
      contactName: "Maya Lee",
      contactRole: "Procurement",
    };
    const icpScore: IcpScore = {
      score: 82,
      band: "high",
      reasons: ["Industry matches workspace focus."],
    };
    const openingAngle: OpeningAngle = {
      headline: "Pump replacement reliability",
      rationale: "Lead with uptime and replacement inventory.",
      confidence: 0.74,
      draftOnly: true,
    };
    const packet: ProspectingPacket = {
      id: "prospect-1",
      workspaceId: "hero-pumps",
      candidate,
      source,
      evidence: [evidence],
      confidence: 0.76,
      icpScore,
      openingAngle,
      riskFlags: ["dry_run_only"],
      recommendedNextStep: "Review before drafting outreach.",
      dryRun: true,
      createdAt: "2026-06-18T00:00:00.000Z",
      idempotencyKey: "hero-pumps:apex",
    };
    const run: ProspectingRun = {
      id: "run-1",
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      status: "completed",
      sourceSummary: "1 seed",
      createdAt: packet.createdAt,
      updatedAt: packet.createdAt,
      idempotencyKey: "run-key",
      packets: [packet],
    };

    expect(run.packets[0]).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      candidate: { companyName: "Apex Pump Distributors" },
      icpScore: { band: "high" },
      openingAngle: { draftOnly: true },
    });
  });

  it("generates a dry-run prospecting packet with evidence, confidence, score, angle, risk, and next step", () => {
    const runtime = createSalesRuntime();
    const beforeSideEffects = runtime.listSideEffects(20).length;

    const run = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase8:test-run",
      seeds: [{
        companyName: "Apex Pump Distributors",
        website: "https://apexpumps.example",
        country: "US",
        industry: "industrial pumps",
        contactName: "Maya Lee",
        contactRole: "Procurement",
        sourceUrl: "https://directory.example/apexpumps",
        notes: "Imports replacement pump assemblies for municipal water contractors.",
      }],
    });

    expect(run).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      draftOnly: true,
      status: "completed",
    });
    expect(run.packets).toHaveLength(1);
    expect(run.packets[0]).toMatchObject({
      workspaceId: "hero-pumps",
      dryRun: true,
      candidate: {
        companyName: "Apex Pump Distributors",
        contactName: "Maya Lee",
      },
      source: {
        reliability: "local",
      },
      openingAngle: {
        draftOnly: true,
      },
    });
    expect(run.packets[0].evidence.length).toBeGreaterThan(0);
    expect(run.packets[0].confidence).toBeGreaterThan(0.5);
    expect(run.packets[0].icpScore.score).toBeGreaterThan(50);
    expect(run.packets[0].icpScore.reasons.length).toBeGreaterThan(0);
    expect(run.packets[0].openingAngle.headline).toContain("Apex Pump Distributors");
    expect(run.packets[0].riskFlags).toContain("dry_run_only");
    expect(run.packets[0].recommendedNextStep).toMatch(/review/i);
    expect(run.packets[0].idempotencyKey).toContain("hero-pumps");
    expect(runtime.listSideEffects(20)).toHaveLength(beforeSideEffects);
  });

  it("dedupes dry-runs by idempotency key", () => {
    const runtime = createSalesRuntime();
    const input = {
      workspaceId: "hero-pumps",
      idempotencyKey: "hero-pumps:phase8:dedupe",
      seeds: [{
        companyName: "Dedupe Pump Supply",
        website: "https://dedupe-pump.example",
        industry: "pump distribution",
        sourceUrl: "https://directory.example/dedupe",
      }],
    };

    const first = runProspectingDryRun(runtime, input);
    const second = runProspectingDryRun(runtime, input);
    const runs = listProspectingRuns("hero-pumps", 20);

    expect(second.id).toBe(first.id);
    expect(runs.filter((run) => run.idempotencyKey === input.idempotencyKey)).toHaveLength(1);
  });

  it("marks low-evidence candidates as insufficient evidence instead of executable prospects", () => {
    const runtime = createSalesRuntime();
    const run = runProspectingDryRun(runtime, {
      workspaceId: "hero-pumps",
      seeds: [{ companyName: "Thin Evidence Co" }],
    });
    const packet = run.packets[0];

    expect(packet.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "insufficient_evidence" }),
    ]));
    expect(packet.confidence).toBeLessThanOrEqual(0.45);
    expect(packet.riskFlags).toEqual(expect.arrayContaining(["insufficient_evidence", "not_ready_for_outbound"]));
    expect(packet.recommendedNextStep).toMatch(/evidence/i);
    expect(createSalesRuntime().listSideEffects(20)).toHaveLength(0);
  });
});
