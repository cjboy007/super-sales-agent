import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { calculateQuickQuote, type QuickQuoteData } from "../quick-quote";
import { ensureDir, sanitizeSsaPathSegment, ssaCompanyDataPath } from "../ssa-data-paths";
import type { TradeDocumentData } from "./documents";
import { upsertFileManifestRecords, type FileManifestRecord } from "./file-manifest";
import { recordPiPrices } from "./price-memory";

interface QuickQuoteExportGitResult {
  committed: boolean;
  commitHash: string;
  message: string;
}

export interface QuickQuotePiPackageResult {
  success: true;
  workspaceId: string;
  customer: string;
  piNo: string;
  customerDir: string;
  packageDir: string;
  files: Array<{ kind: "pi" | "price-cost" | "product-index"; path: string }>;
  git: QuickQuoteExportGitResult;
}

function piNoFromQuoteNo(quoteNo: string): string {
  const cleaned = quoteNo.trim() || `QT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`;
  return cleaned.startsWith("QT-") ? cleaned.replace(/^QT-/, "PI-") : cleaned.startsWith("PI-") ? cleaned : `PI-${cleaned}`;
}

function money(currency: string, value: number) {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productMaterialSlug(description: string, index: number) {
  return sanitizeSsaPathSegment(description || `product-${index + 1}`);
}

function renderEnglishPiHtml(quote: QuickQuoteData, piNo: string) {
  const calculation = calculateQuickQuote(quote);
  const rows = calculation.lines.map((line, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(line.description || "-")}</td>
          <td>${escapeHtml(line.specification || "-")}</td>
          <td class="num">${line.quantity}</td>
          <td class="num">${line.unitPrice.toFixed(2)}</td>
          <td class="num">${line.amount.toFixed(2)}</td>
        </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(piNo)} Proforma Invoice</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
    h1 { font-size: 22px; letter-spacing: 0.12em; margin: 0 0 12px; }
    .top { display: flex; justify-content: space-between; gap: 24px; border-bottom: 1px solid #d1d5db; padding-bottom: 16px; }
    .muted { color: #6b7280; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 12px; }
    th { background: #111827; color: white; text-align: left; }
    th, td { border: 1px solid #d1d5db; padding: 8px; }
    .num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .totals { margin-left: auto; margin-top: 18px; width: 300px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
    .grand { border-top: 1px solid #9ca3af; font-weight: 700; font-size: 16px; }
    .notes { margin-top: 24px; border: 1px solid #d1d5db; padding: 12px; font-size: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h1>PROFORMA INVOICE</h1>
      <strong>${escapeHtml(quote.seller)}</strong>
      <p class="muted">${escapeHtml(piNo)}</p>
    </div>
    <div class="muted">
      <p>Date: ${escapeHtml(quote.date || "-")}</p>
      ${quote.validUntil ? `<p>Valid Until: ${escapeHtml(quote.validUntil)}</p>` : ""}
    </div>
  </div>
  <div class="grid">
    <section>
      <h2>Bill To</h2>
      <p><strong>${escapeHtml(quote.customer || "Customer not set")}</strong></p>
      <p>${escapeHtml(quote.contact || "-")}</p>
      <p>${escapeHtml(quote.email || "-")}</p>
      <p>${escapeHtml(quote.country || "-")}</p>
    </section>
    <section>
      <h2>Terms</h2>
      <p>Incoterms: ${escapeHtml(quote.incoterms)}</p>
      <p>Payment: ${escapeHtml(quote.paymentTerms)}</p>
      <p>Lead Time: ${escapeHtml(quote.leadTime)}</p>
    </section>
  </div>
  <table>
    <thead>
      <tr><th>No.</th><th>Item</th><th>Specification</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Product Amount</span><span>${money(quote.currency, calculation.subtotal)}</span></div>
    <div><span>Charges</span><span>${money(quote.currency, calculation.totalCharges)}</span></div>
    <div class="grand"><span>Grand Total</span><span>${money(quote.currency, calculation.grandTotal)}</span></div>
  </div>
  ${quote.notes ? `<div class="notes"><strong>Notes</strong><br />${escapeHtml(quote.notes)}</div>` : ""}
</body>
</html>
`;
}

function writePriceCostFile(packageDir: string, quote: QuickQuoteData, piNo: string) {
  const calculation = calculateQuickQuote(quote);
  const data = {
    piNo,
    quoteNo: quote.quoteNo,
    customer: quote.customer,
    currency: quote.currency,
    totalCost: calculation.totalCost,
    totalProfit: calculation.totalProfit,
    lines: calculation.lines.map((line) => ({
      description: line.description,
      specification: line.specification,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      supplier: line.supplier,
      amount: line.amount,
      costAmount: line.costAmount,
      profit: line.profit,
    })),
  };
  const filePath = path.join(packageDir, "price-cost.json");
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}

function writeProductMaterialsIndex(packageDir: string, quote: QuickQuoteData) {
  const lines = [
    "# Product Materials Index",
    "",
    "This index records product reference material slots for the PI package.",
    "",
    ...quote.lines.map((line, index) => {
      const folder = `product-materials/${productMaterialSlug(line.description, index)}`;
      ensureDir(path.join(packageDir, folder));
      return `- ${line.description || `Product ${index + 1}`} | ${line.specification || "-"} | ${folder}/`;
    }),
    "",
  ];
  const filePath = path.join(packageDir, "product-materials-index.md");
  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

function manifestRecords(workspaceId: string, quote: QuickQuoteData, piNo: string, files: QuickQuotePiPackageResult["files"]): FileManifestRecord[] {
  const calculation = calculateQuickQuote(quote);
  const updatedAt = new Date().toISOString();
  const mainProducts = quote.lines
    .map((line) => line.description || line.specification)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ") || "—";
  const amount = money(quote.currency, calculation.grandTotal);
  return files.map((file) => ({
    id: `${piNo}:${file.kind}:${file.path}`,
    kind: file.kind === "pi" ? "PI" : file.kind,
    documentNo: piNo,
    fileName: path.basename(file.path),
    path: file.path,
    format: path.extname(file.path).toLowerCase().replace(/^\./, "") || file.kind,
    customer: quote.customer.trim() || "Unknown Customer",
    amount,
    mainProducts,
    sourceAction: "quick-quote.export",
    updatedAt,
  }));
}

function quickQuoteToTradeData(quote: QuickQuoteData, piNo: string): TradeDocumentData {
  const calculation = calculateQuickQuote(quote);
  return {
    company: { name: quote.seller, address: "", phone: "", email: "" },
    customer: {
      company_name: quote.customer,
      contact: quote.contact,
      email: quote.email,
      phone: "",
      address: "",
      country: quote.country,
    },
    shipment: {
      date: quote.date,
      vessel: "",
      departure_port: quote.incoterms.includes("Shenzhen") ? "Shenzhen, China" : "",
      destination_port: "",
      incoterms: quote.incoterms,
      country_of_origin: "China",
      marks: "N/M",
    },
    currency: quote.currency,
    freight: quote.charges.freight,
    insurance: 0,
    products: calculation.lines.map((line) => ({
      description: line.description,
      specification: line.specification,
      hs_code: "",
      quantity: line.quantity,
      unit_price: line.unitPrice,
      unit_cost: line.unitCost,
      cost_currency: quote.currency,
      supplier: line.supplier,
      supplier_candidates: line.supplier ? [line.supplier] : [],
      net_weight_kg: 0,
      gross_weight_kg: 0,
      dimensions_cm: "",
      package_type: "Carton",
      packages: 0,
    })),
    pi_info: { pi_no: piNo, valid_until: quote.validUntil },
    ci_info: { ci_no: "", ci_date: quote.date, payment_terms: quote.paymentTerms },
    pl_info: { pl_no: "" },
  };
}

function gitCommitCustomerPackage(customerDir: string, piNo: string): QuickQuoteExportGitResult {
  const git = (args: string[]) => execFileSync("git", ["-C", customerDir, ...args], { encoding: "utf-8" }).trim();
  if (!fs.existsSync(path.join(customerDir, ".git"))) {
    execFileSync("git", ["init", customerDir], { encoding: "utf-8" });
    git(["config", "user.name", "JadenOS"]);
    git(["config", "user.email", "jadenos@local"]);
  }
  git(["add", "."]);
  const status = git(["status", "--short"]);
  if (!status) {
    const current = git(["rev-parse", "--short", "HEAD"]);
    return { committed: false, commitHash: current, message: "No changes to commit" };
  }
  git(["commit", "-m", `Archive ${piNo}`]);
  const commitHash = git(["rev-parse", "--short", "HEAD"]);
  return { committed: true, commitHash, message: `Archive ${piNo}` };
}

export function exportQuickQuotePiPackage(workspaceId: string, quote: QuickQuoteData): QuickQuotePiPackageResult {
  const customer = quote.customer.trim() || "Unknown Customer";
  const piNo = piNoFromQuoteNo(quote.quoteNo);
  const customerDir = ensureDir(ssaCompanyDataPath(workspaceId, "customers", sanitizeSsaPathSegment(customer)));
  const packageDir = ensureDir(path.join(customerDir, "quotes", sanitizeSsaPathSegment(piNo)));

  const piPath = path.join(packageDir, `${sanitizeSsaPathSegment(piNo)}.html`);
  fs.writeFileSync(piPath, renderEnglishPiHtml(quote, piNo), "utf-8");
  const costPath = writePriceCostFile(packageDir, quote, piNo);
  const indexPath = writeProductMaterialsIndex(packageDir, quote);
  recordPiPrices(workspaceId, quickQuoteToTradeData(quote, piNo), "quick-quote.export");
  const git = gitCommitCustomerPackage(customerDir, piNo);
  const files: QuickQuotePiPackageResult["files"] = [
    { kind: "pi", path: piPath },
    { kind: "price-cost", path: costPath },
    { kind: "product-index", path: indexPath },
  ];
  upsertFileManifestRecords(workspaceId, manifestRecords(workspaceId, quote, piNo, files));

  return {
    success: true,
    workspaceId,
    customer,
    piNo,
    customerDir,
    packageDir,
    files,
    git,
  };
}
