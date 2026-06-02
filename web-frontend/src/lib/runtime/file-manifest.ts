import fs from "fs";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";

export type ManifestFileKind = "quotation" | "sample_order" | "PI" | "CI" | "PL" | "product-index" | "price-cost" | "other";

export interface FileManifestRecord {
  id: string;
  kind: ManifestFileKind;
  documentNo: string;
  fileName: string;
  path: string;
  format: string;
  customer: string;
  amount: string;
  mainProducts: string;
  sourceAction: string;
  updatedAt: string;
}

function manifestPath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, ".jadenos", "manifest", "files.json");
}

function readManifest(workspaceId: string): FileManifestRecord[] {
  return readJsonFile<FileManifestRecord[]>(manifestPath(workspaceId), []);
}

function writeManifest(workspaceId: string, records: FileManifestRecord[]) {
  fs.writeFileSync(manifestPath(workspaceId), JSON.stringify(records, null, 2), "utf-8");
}

export function upsertFileManifestRecords(workspaceId: string, records: FileManifestRecord[]): FileManifestRecord[] {
  const byId = new Map<string, FileManifestRecord>();
  for (const record of readManifest(workspaceId)) byId.set(record.id, record);
  for (const record of records) byId.set(record.id, record);
  const next = Array.from(byId.values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 10000);
  writeManifest(workspaceId, next);
  return next;
}

export function listFileManifest(workspaceId: string): FileManifestRecord[] {
  return readManifest(workspaceId)
    .filter((record) => record.path && fs.existsSync(record.path))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
