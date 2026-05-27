import fs from "fs";
import path from "path";
import type { SalesRuntime } from "./sales-runtime";

export interface LeadImportInput {
  workspaceId: string;
  fileName?: string;
  csv?: string;
  json?: Array<Record<string, unknown>>;
}

export interface LeadImportResult {
  workspaceId: string;
  path: string;
  count: number;
  format: "csv" | "json";
}

function safeFileName(value: string, fallback: string) {
  return (value || fallback).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || fallback;
}

function countCsvRows(csv: string) {
  return Math.max(0, csv.split("\n").filter((line) => line.trim()).length - 1);
}

function rememberImport(runtime: SalesRuntime, input: {
  workspaceId: string;
  path: string;
  count: number;
  format: "csv" | "json";
}) {
  runtime.writeMemory({
    workspaceId: input.workspaceId,
    kind: "episode",
    title: `Imported ${input.count} ${input.format.toUpperCase()} lead${input.count === 1 ? "" : "s"}`,
    body: `Loaded ${input.count} lead rows from ${input.path}. This import is local-only and available to Sales Memory searches.`,
    tags: ["lead-import", "crm-export", input.format],
    source: {
      type: "lead",
      path: input.path,
    },
    confidence: 1,
    metadata: {
      count: input.count,
      format: input.format,
      sideEffects: "local-only",
    },
    idempotencyKey: `${input.workspaceId}:lead-import:${input.path}`,
  });
}

export function importWorkspaceLeads(runtime: SalesRuntime, input: LeadImportInput): LeadImportResult {
  const workspace = runtime.getWorkspace(input.workspaceId);
  const leadsPath = workspace.data.leadsPath;
  if (!leadsPath) throw new Error(`Workspace ${workspace.id} has no lead import path.`);

  fs.mkdirSync(leadsPath, { recursive: true });

  if (typeof input.csv === "string" && input.csv.trim()) {
    const fileName = safeFileName(input.fileName || `leads-${Date.now()}.csv`, `leads-${Date.now()}.csv`);
    const target = path.join(leadsPath, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
    fs.writeFileSync(target, input.csv, "utf-8");
    runtime.memory.invalidate();
    const count = countCsvRows(input.csv);
    rememberImport(runtime, { workspaceId: workspace.id, path: target, count, format: "csv" });
    runtime.recordEvent("lead.imported", workspace.id, {
      path: target,
      count,
      format: "csv",
      sideEffects: "local-only",
    });
    return { workspaceId: workspace.id, path: target, count, format: "csv" };
  }

  if (Array.isArray(input.json)) {
    const fileName = safeFileName(input.fileName || `leads-${Date.now()}.json`, `leads-${Date.now()}.json`);
    const target = path.join(leadsPath, fileName.endsWith(".json") ? fileName : `${fileName}.json`);
    fs.writeFileSync(target, JSON.stringify(input.json, null, 2), "utf-8");
    runtime.memory.invalidate();
    rememberImport(runtime, { workspaceId: workspace.id, path: target, count: input.json.length, format: "json" });
    runtime.recordEvent("lead.imported", workspace.id, {
      path: target,
      count: input.json.length,
      format: "json",
      sideEffects: "local-only",
    });
    return { workspaceId: workspace.id, path: target, count: input.json.length, format: "json" };
  }

  throw new Error("Provide csv text or json lead rows to import.");
}
