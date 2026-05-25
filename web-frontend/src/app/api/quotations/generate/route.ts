import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";
import { paths, resolvePath } from "@/lib/ssa-paths";
import { createAuditEvent, upsertQuoteRecord } from "@/lib/db";

const execFileAsync = promisify(execFile);

const GENERATE_SCRIPT = resolvePath("skills", "quotation-workflow", "scripts", "generate-all.sh");
const OUTPUT_DIR = path.join(paths.output, "quotations");

interface GenerateRequestBody {
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  items?: Array<{
    name: string;
    description?: string;
    qty?: number;
    unitPrice?: number;
    amount?: number;
  }>;
  terms?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequestBody = await request.json();

    if (!body.type || !body.customer) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: type, customer" },
        { status: 400 }
      );
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Generate unique ID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    const quotationNo = `${body.type}-${dateStr}-${randomNum}`;

    // Build data JSON for the script
    const dataFile = path.join(os.tmpdir(), `ssa-quotation-${Date.now()}.json`);
    const quotationData = {
      quotationNo,
      type: body.type,
      customer: body.customer,
      items: body.items || [],
      terms: body.terms || "",
      notes: body.notes || "",
      date: new Date().toISOString().slice(0, 10),
    };
    fs.writeFileSync(dataFile, JSON.stringify(quotationData, null, 2), "utf-8");

    try {
      const { stdout } = await execFileAsync("bash", [GENERATE_SCRIPT, dataFile, quotationNo], {
        timeout: 60_000,
        maxBuffer: 5 * 1024 * 1024,
      });

      const generatedFiles = findGeneratedFiles(quotationNo);
      persistQuoteGeneration({
        quotationNo,
        body,
        quotationDate: quotationData.date,
        generatedFiles,
        metadata: {
          items: quotationData.items.length,
          terms: quotationData.terms,
          notes: quotationData.notes,
        },
      });

      // Clean up temp data file
      setTimeout(() => {
        try { fs.unlinkSync(dataFile); } catch { /* ignore */ }
      }, 10_000);

      return NextResponse.json({
        success: true,
        quotationNo,
        files: generatedFiles,
        detail: "Document generated successfully",
        log: stdout.slice(-500), // Last 500 chars of output for debugging
      });
    } catch (scriptError: unknown) {
      const message = scriptError instanceof Error ? scriptError.message : String(scriptError);

      persistQuoteGeneration({
        quotationNo,
        body,
        quotationDate: quotationData.date,
        generatedFiles: [],
        fallback: true,
        metadata: {
          items: quotationData.items.length,
          terms: quotationData.terms,
          notes: quotationData.notes,
          fallbackReason: message,
        },
      });

      // Clean up temp data file
      try { fs.unlinkSync(dataFile); } catch { /* ignore */ }

      return NextResponse.json({
        success: true,
        fallback: true,
        quotationNo,
        files: [],
        detail: "Quote saved in SSA runtime; export script unavailable.",
        note: message,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

function persistQuoteGeneration(input: {
  quotationNo: string;
  body: GenerateRequestBody;
  quotationDate: string;
  generatedFiles: Array<{ format: string; path: string }>;
  fallback?: boolean;
  metadata: Record<string, unknown>;
}) {
  const primaryFile = input.generatedFiles[0] || null;
  upsertQuoteRecord({
    id: input.quotationNo,
    type: input.body.type,
    customer: input.body.customer,
    amount: "—",
    status: "Draft",
    date: input.quotationDate,
    filePath: primaryFile?.path || null,
    fileType: primaryFile?.format || null,
    metadata: {
      ...input.metadata,
      fallback: Boolean(input.fallback),
      generatedFiles: input.generatedFiles.length,
    },
  });

  createAuditEvent({
    type: "quote_generated",
    actor: "web-frontend",
    target: input.quotationNo,
    summary: `Quotation generated for ${input.body.customer}`,
    metadata: {
      type: input.body.type,
      files: input.generatedFiles.length,
      fallback: Boolean(input.fallback),
    },
  });
}

function findGeneratedFiles(quotationNo: string): Array<{ format: string; path: string }> {
  const extensions = ["xlsx", "docx", "html", "pdf"];
  const results: Array<{ format: string; path: string }> = [];

  for (const ext of extensions) {
    // Check multiple possible output locations
    const candidates = [
      path.join(OUTPUT_DIR, `${quotationNo}.${ext}`),
      path.join(os.tmpdir(), `${quotationNo}.${ext}`),
    ];

    // Also check the current working directory of the script
    const scriptDir = path.dirname(GENERATE_SCRIPT);
    candidates.push(path.join(scriptDir, "..", "output", `${quotationNo}.${ext}`));

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        results.push({ format: ext, path: filePath });
        break;
      }
    }
  }

  return results;
}
