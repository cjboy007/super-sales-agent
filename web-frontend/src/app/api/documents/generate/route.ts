import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { paths, resolvePath } from "@/lib/ssa-paths";

const execFileAsync = promisify(execFile);

// ─── Config ─────────────────────────────────────────────────────────────────

// Trade-docs skill can be overridden via env, but defaults to the repo-local seam.
const TRADE_DOCS_DIR = process.env.TRADE_DOCS_DIR || resolvePath("skills", "trade-docs");
const OUTPUT_DIR = path.join(paths.output, "trade-docs");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface TradeProduct {
  description: string;
  specification: string;
  hs_code: string;
  quantity: number;
  unit_price: number;
  net_weight_kg: number;
  gross_weight_kg: number;
  dimensions_cm: string;
  package_type: string;
  packages: number;
}

interface TradeDocumentData {
  company: { name: string; address: string; phone: string; email: string };
  customer: { company_name: string; contact: string; email: string; phone: string; address: string; country: string };
  shipment: {
    date: string; vessel: string; departure_port: string; destination_port: string;
    incoterms: string; country_of_origin: string; marks: string;
  };
  currency: string;
  freight: number;
  insurance: number;
  products: TradeProduct[];
  pi_info: { pi_no: string; valid_until: string };
  ci_info: { ci_no: string; ci_date: string; payment_terms: string };
  pl_info: { pl_no: string };
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data, docTypes }: { data: TradeDocumentData; docTypes: ("PI" | "CI" | "PL" | "ALL")[] } = body;

    if (!data || !docTypes || docTypes.length === 0) {
      return NextResponse.json({ success: false, error: "Missing data or docTypes" }, { status: 400 });
    }

    // Write temp data file
    const tempDataPath = path.resolve(OUTPUT_DIR, `_temp-${Date.now()}.json`);
    fs.writeFileSync(tempDataPath, JSON.stringify(data, null, 2), "utf-8");

    const documents: { type: string; filename: string; path: string; size: number }[] = [];
    let usedFallback = false;
    const typesToGenerate = docTypes.includes("ALL") ? ["PI", "CI", "PL"] : docTypes;

    for (const docType of typesToGenerate) {
      const outputFilename = `${data.pi_info.pi_no.replace("PI", docType)}-${Date.now()}.html`;
      const outputPath = path.resolve(OUTPUT_DIR, outputFilename);

      const scriptMap: Record<string, string> = {
        PI: path.resolve(TRADE_DOCS_DIR, "scripts/generate_pi.py"),
        CI: path.resolve(TRADE_DOCS_DIR, "scripts/generate_ci.py"),
        PL: path.resolve(TRADE_DOCS_DIR, "scripts/generate_pl.py"),
      };

      const script = scriptMap[docType];
      try {
        if (!script || !fs.existsSync(script)) {
          usedFallback = true;
          writeFallbackDocument(outputPath, docType, data);
        } else {
          await execFileAsync("python3", [script, "--data", tempDataPath, "--output", outputPath], {
            timeout: 30000,
          });
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // Fall back to SSA-owned HTML output when the export script fails.
        console.error(`Failed to generate ${docType}:`, errorMsg);
        usedFallback = true;
        try {
          writeFallbackDocument(outputPath, docType, data);
        } catch (fallbackError) {
          console.error(
            `Failed to create fallback ${docType}:`,
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
          );
          continue;
        }
      }

      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        documents.push({
          type: docType,
          filename: outputFilename,
          path: outputPath,
          size: stats.size,
        });
      }
    }

    // Clean up temp file
    try { fs.unlinkSync(tempDataPath); } catch {}

    if (documents.length === 0) {
      return NextResponse.json(
        { success: false, error: "No documents were generated. Check Python dependencies." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fallback: usedFallback,
      documents,
      message: usedFallback
        ? `成功生成 ${documents.length} 份单证（SSA fallback）`
        : `成功生成 ${documents.length} 份单证`,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `生成失败: ${errorMsg}` },
      { status: 500 }
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function writeFallbackDocument(
  outputPath: string,
  docType: string,
  data: TradeDocumentData
) {
  const titleMap: Record<string, string> = {
    PI: "Proforma Invoice",
    CI: "Commercial Invoice",
    PL: "Packing List",
  };
  const rows = data.products.map((product) => `
    <tr>
      <td>${escapeHtml(product.description)}</td>
      <td>${escapeHtml(product.specification)}</td>
      <td>${escapeHtml(product.hs_code)}</td>
      <td>${product.quantity}</td>
      <td>${product.unit_price.toFixed(2)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titleMap[docType] || docType)} - ${escapeHtml(data.pi_info.pi_no)}</title>
  <style>
    body { font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; padding: 24px; }
    h1, h2 { margin: 0 0 12px; }
    section { margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #334155; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #1e293b; }
    .muted { color: #94a3b8; }
  </style>
</head>
<body>
  <h1>${escapeHtml(titleMap[docType] || docType)} ${escapeHtml(data.pi_info.pi_no)}</h1>
  <p class="muted">SSA fallback export. The external trade-docs script was unavailable.</p>
  <section>
    <h2>Company</h2>
    <div>${escapeHtml(data.company.name)}</div>
    <div>${escapeHtml(data.company.address)}</div>
    <div>${escapeHtml(data.company.phone)} | ${escapeHtml(data.company.email)}</div>
  </section>
  <section>
    <h2>Customer</h2>
    <div>${escapeHtml(data.customer.company_name)}</div>
    <div>${escapeHtml(data.customer.contact)}</div>
    <div>${escapeHtml(data.customer.address)} | ${escapeHtml(data.customer.country)}</div>
  </section>
  <section>
    <h2>Products</h2>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Specification</th>
          <th>HS Code</th>
          <th>Qty</th>
          <th>Unit Price</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, "utf-8");
}

// ─── GET: List generated trade documents ────────────────────────────────────

export async function GET() {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return NextResponse.json({ success: true, documents: [] });
    }

    const entries = fs.readdirSync(OUTPUT_DIR, { withFileTypes: true });
    const documents = entries
      .filter((e) => e.isFile() && e.name.endsWith(".html"))
      .map((e) => {
        const fullPath = path.join(OUTPUT_DIR, e.name);
        const stats = fs.statSync(fullPath);
        // Parse doc type from filename (PI-xxx, CI-xxx, PL-xxx)
        const typeMatch = e.name.match(/^(PI|CI|PL)/);
        return {
          type: typeMatch ? typeMatch[1] : "Unknown",
          filename: e.name,
          path: fullPath,
          size: stats.size,
          created: stats.birthtime.toISOString(),
        };
      })
      .sort((a, b) => b.created.localeCompare(a.created));

    return NextResponse.json({ success: true, documents });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
