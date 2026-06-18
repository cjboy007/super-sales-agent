import fs from "fs";
import path from "path";
import { queueCompanyIntelForLeads, type CompanyIntelLeadInput } from "./company-intel";
import { upsertCustomerAccountsFromLeads, type CustomerUpsertResult } from "./customers";
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
  companyIntel: {
    queued: number;
    skipped: number;
    jobs: string[];
  };
  customers: CustomerUpsertResult;
}

function safeFileName(value: string, fallback: string) {
  return (value || fallback).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || fallback;
}

function countCsvRows(csv: string) {
  return Math.max(0, csv.split("\n").filter((line) => line.trim()).length - 1);
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current.trim());
  return result;
}

function stringFrom(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function csvToCompanyIntelLeads(csv: string): CompanyIntelLeadInput[] {
  const lines = csv.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || "").trim();
    });
    return rowToCompanyIntelLead(row);
  });
}

function rowToCompanyIntelLead(row: Record<string, unknown>): CompanyIntelLeadInput {
  const score = stringFrom(row.score);
  return {
    companyName: stringFrom(row.companyName, row.company_name, row.company, row.account, row.name),
    country: stringFrom(row.country, row.market),
    industry: stringFrom(row.industry, row.vertical),
    contact: stringFrom(row.contact, row.contact_name, row.contactName, row.person),
    position: stringFrom(row.position, row.title, row.role),
    email: stringFrom(row.email, row.email_address, row.mail),
    homepage: stringFrom(row.homepage, row.website, row.url),
    category: stringFrom(row.category, row.tier, row.segment),
    reason: stringFrom(row.reason, row.source, row.notes, row.industry),
    confidence: stringFrom(row.confidence, row.confidence_score, row.verification_status),
    score: score === "Hot" || score === "Warm" || score === "Cold" ? score : undefined,
  };
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
    const intelLeads = csvToCompanyIntelLeads(input.csv);
    const customers = upsertCustomerAccountsFromLeads(workspace.id, intelLeads);
    const companyIntel = queueCompanyIntelForLeads(runtime, workspace.id, intelLeads, {
      source: "lead-import",
    });
    return { workspaceId: workspace.id, path: target, count, format: "csv", companyIntel, customers };
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
    const intelLeads = input.json.map(rowToCompanyIntelLead);
    const customers = upsertCustomerAccountsFromLeads(workspace.id, intelLeads);
    const companyIntel = queueCompanyIntelForLeads(runtime, workspace.id, intelLeads, {
      source: "lead-import",
    });
    return { workspaceId: workspace.id, path: target, count: input.json.length, format: "json", companyIntel, customers };
  }

  throw new Error("Provide csv text or json lead rows to import.");
}
