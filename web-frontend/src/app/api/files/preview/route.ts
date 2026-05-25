import { NextRequest, NextResponse } from "next/server";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { ALLOWED_BASE_DIRS } from "@/lib/file-registry";
import { securePathCheck } from "@/lib/path-guard";

function isInAllowedDir(resolved: string): boolean {
  return ALLOWED_BASE_DIRS.some((dir) => fs.existsSync(dir) && securePathCheck(resolved, dir).ok);
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing 'path' parameter" }, { status: 400 });
  }

  if (!path.isAbsolute(filePath)) {
    return NextResponse.json({ error: "Path must be absolute" }, { status: 400 });
  }

  const resolved = path.resolve(filePath);

  if (!isInAllowedDir(resolved)) {
    return NextResponse.json({ error: "Access denied: path outside allowed directories" }, { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();

  // PDF / HTML — serve directly via the files API
  if (ext === ".pdf" || ext === ".html" || ext === ".htm") {
    return NextResponse.json({
      previewAvailable: false,
      reason: "direct",
      downloadUrl: `/api/files?path=${encodeURIComponent(resolved)}`,
      inlineUrl: `/api/files?path=${encodeURIComponent(resolved)}`,
    });
  }

  // XLSX / DOCX — convert to HTML via LibreOffice
  if (ext === ".xlsx" || ext === ".xls" || ext === ".docx" || ext === ".doc") {
    const tmpDir = path.join("/tmp", "ssa-preview");
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const baseName = path.basename(resolved, path.extname(resolved));
    const outputHtml = path.join(tmpDir, `${baseName}.html`);

    try {
      execFileSync("soffice", [
        "--headless",
        "--convert-to", "html",
        "--outdir", tmpDir,
        resolved,
      ], { timeout: 30000 });

      if (!fs.existsSync(outputHtml)) {
        // LibreOffice sometimes adds unexpected suffixes — find the generated file
        const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(baseName) && f.endsWith(".html"));
        if (files.length === 0) {
          throw new Error("LibreOffice conversion produced no output");
        }
        // If multiple, pick the most recent
        files.sort((a, b) => {
          const sa = fs.statSync(path.join(tmpDir, a)).mtimeMs;
          const sb = fs.statSync(path.join(tmpDir, b)).mtimeMs;
          return sb - sa;
        });
        const actualFile = path.join(tmpDir, files[0]);
        const html = fs.readFileSync(actualFile, "utf-8");
        return new NextResponse(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }

      const html = fs.readFileSync(outputHtml, "utf-8");
      return new NextResponse(html, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    } catch (e: unknown) {
      const downloadUrl = `/api/files?path=${encodeURIComponent(resolved)}&download=true`;
      return NextResponse.json({
        previewAvailable: false,
        reason: "conversion_failed",
        message: e instanceof Error ? e.message : "Conversion failed",
        downloadUrl,
      });
    }
  }

  // Unsupported format
  const downloadUrl = `/api/files?path=${encodeURIComponent(resolved)}&download=true`;
  return NextResponse.json({
    previewAvailable: false,
    reason: "unsupported_format",
    downloadUrl,
  });
}
