import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { ALLOWED_BASE_DIRS } from "@/lib/file-registry";
import { securePathCheck } from "@/lib/path-guard";

// ─── Content-Type mapping ─────────────────────────────────────────────────
const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".html": "text/html",
  ".htm": "text/html",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

function isInAllowedDir(resolved: string): boolean {
  return ALLOWED_BASE_DIRS.some((dir) => fs.existsSync(dir) && securePathCheck(resolved, dir).ok);
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get("path");

  if (!filePath) {
    return NextResponse.json({ error: "Missing 'path' parameter" }, { status: 400 });
  }

  // Must be absolute path
  if (!path.isAbsolute(filePath)) {
    return NextResponse.json({ error: "Path must be absolute" }, { status: 400 });
  }

  // Resolve to prevent ../ traversal
  const resolved = path.resolve(filePath);

  // Whitelist check
  if (!isInAllowedDir(resolved)) {
    return NextResponse.json({ error: "Access denied: path outside allowed directories" }, { status: 403 });
  }

  // File existence
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  const isDownload = request.nextUrl.searchParams.get("download") === "true";
  const contentType = getContentType(resolved);
  const fileName = path.basename(resolved);

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(stat.size),
  };

  if (isDownload) {
    headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
  } else {
    headers["Content-Disposition"] = `inline; filename="${encodeURIComponent(fileName)}"`;
  }

  const fileBuffer = fs.readFileSync(resolved);
  return new NextResponse(fileBuffer, { status: 200, headers });
}
