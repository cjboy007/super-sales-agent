import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SalesMemory } from "./sales-memory";
import { memoryIndexDbPath, upsertMemoryIndexRecord } from "./memory-index";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-intake-memory-index-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("SalesMemory intake index matching", () => {
  it("prefers indexed memory matches for intake lookup", () => {
    upsertMemoryIndexRecord({
      workspaceId: "demo-exporter",
      sourceKind: "lead",
      sourceId: "lead-cable-house",
      kind: "lead",
      title: "Cable House",
      body: "buyer@example.com procurement for HDMI cable",
      keywords: ["buyer@example.com", "cable-house.com"],
      metadata: { email: "buyer@example.com" },
    });

    const matches = new SalesMemory().findIntakeMatches("demo-exporter", ["buyer@example.com"]);

    expect(matches[0]).toMatchObject({
      kind: "lead",
      title: "Cable House",
    });
  });

  it("falls back to document scanning when the index is missing", () => {
    fs.rmSync(memoryIndexDbPath(), { force: true });
    const docPath = path.join(tempRoot, "companies", "demo-exporter", "documents", "599-030-reference.pdf");
    fs.mkdirSync(path.dirname(docPath), { recursive: true });
    fs.writeFileSync(docPath, "%PDF test", "utf-8");

    const matches = new SalesMemory().findIntakeMatches("demo-exporter", ["599-030"]);

    expect(matches.some((match) => match.kind === "document" && match.title === "599-030-reference.pdf")).toBe(true);
  });
});
