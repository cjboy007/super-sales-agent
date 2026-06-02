import fs from "fs";
import path from "path";
import { ensureDir, sanitizeSsaPathSegment, ssaCompanyDataPath } from "../ssa-data-paths";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".html", ".htm", ".csv"]);

export interface DocumentTemplateSummary {
  success: true;
  sampleCount: number;
  savedFiles: Array<{ filename: string; path: string; size: number }>;
  templateDraft: {
    status: "needs_more_samples" | "ready_for_confirmation";
    documentTypes: string[];
    rules: string[];
    nextStep: string;
  };
}

function templatesDir(workspaceId: string) {
  return ssaCompanyDataPath(workspaceId, "documents", "template-samples");
}

function inferDocumentTypes(files: Array<{ name: string }>) {
  const joined = files.map((file) => file.name).join(" ").toUpperCase();
  const types = new Set<string>();
  if (/\bPI\b|PROFORMA/.test(joined)) types.add("PI");
  if (/\bCI\b|COMMERCIAL/.test(joined)) types.add("CI");
  if (/\bPL\b|PACKING/.test(joined)) types.add("PL");
  return Array.from(types);
}

function templateRules(sampleCount: number, documentTypes: string[]) {
  const rules = [
    "Use uploaded customer-approved PI/CI/PL files as the visual and field-order reference.",
    "Keep seller, buyer, shipment, product, totals, bank/payment, and signature blocks consistent across documents.",
    "CI and PL generated from a PI must reuse customer, shipment, and product data from the selected PI record.",
  ];
  if (documentTypes.length > 0) {
    rules.push(`Detected reference document types: ${documentTypes.join(", ")}.`);
  }
  if (sampleCount < 3) {
    rules.push("Need at least 3 samples before treating this template as confirmable.");
  }
  return rules;
}

export async function saveDocumentTemplateSamples(workspaceId: string, files: File[]): Promise<DocumentTemplateSummary> {
  const dir = ensureDir(templatesDir(workspaceId));
  const savedFiles: DocumentTemplateSummary["savedFiles"] = [];

  for (const file of files.slice(0, 5)) {
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    const safeName = `${Date.now()}-${sanitizeSsaPathSegment(file.name)}`;
    const filePath = path.join(dir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);
    savedFiles.push({ filename: file.name, path: filePath, size: buffer.byteLength });
  }

  const documentTypes = inferDocumentTypes(files);
  const status = savedFiles.length >= 3 ? "ready_for_confirmation" : "needs_more_samples";
  const summaryPath = path.join(dir, "template-draft.json");
  const templateDraft = {
    status,
    documentTypes,
    rules: templateRules(savedFiles.length, documentTypes),
    nextStep: status === "ready_for_confirmation"
      ? "Review and confirm this template draft in Settings before using it for production documents."
      : "Upload 3-5 approved PI/CI/PL examples before confirming the template.",
  } satisfies DocumentTemplateSummary["templateDraft"];

  fs.writeFileSync(summaryPath, JSON.stringify({
    updatedAt: new Date().toISOString(),
    sampleCount: savedFiles.length,
    savedFiles,
    templateDraft,
  }, null, 2), "utf-8");

  return {
    success: true,
    sampleCount: savedFiles.length,
    savedFiles,
    templateDraft,
  };
}
