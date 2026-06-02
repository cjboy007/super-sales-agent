import fs from "fs";
import os from "os";
import path from "path";
import { repoPath, sanitizeSsaPathSegment, ssaCompanyDataPath, ssaDataRoot } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision } from "./types";

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

export interface RuntimeFileRef {
  path: string;
  resolved: string;
  contentType: string;
  fileName: string;
  size: number;
}

export type RuntimeFilePreviewResult =
  | {
      kind: "json";
      status?: number;
      body: Record<string, unknown>;
    }
  | {
      kind: "html";
      html: string;
    };

export type RuntimeFileServeResult =
  | {
      kind: "error";
      status: number;
      body: { error: string };
    }
  | {
      kind: "file";
      body: ArrayBuffer;
      headers: Record<string, string>;
    };

export type RuntimeFileOpenResult =
  | {
      kind: "error";
      status: number;
      body: { success: false; error: string };
    }
  | {
      kind: "opened";
      status: 200;
      body: { success: true; fileName: string; path: string };
    };

export function allowedFileDirs(): string[] {
  return [
    ssaDataRoot(),
    repoPath("skills", "quotation-workflow", "examples"),
    repoPath("skills", "quotation-workflow", "tests", "output"),
    repoPath("skills", "sample-workflow", "examples"),
    repoPath("skills", "pi-workflow", "examples"),
  ];
}

export function allowedWorkspaceFileDirs(workspaceId: string): string[] {
  return [
    ssaCompanyDataPath(sanitizeSsaPathSegment(workspaceId)),
    repoPath("skills", "quotation-workflow", "examples"),
    repoPath("skills", "quotation-workflow", "tests", "output"),
    repoPath("skills", "sample-workflow", "examples"),
    repoPath("skills", "pi-workflow", "examples"),
  ];
}

export function getRuntimeFileContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export function isRuntimeFileAllowed(resolvedPath: string): boolean {
  const resolved = path.resolve(resolvedPath);
  return allowedFileDirs().some((dir) => resolved === path.resolve(dir) || resolved.startsWith(`${path.resolve(dir)}${path.sep}`));
}

export function isWorkspaceRuntimeFileAllowed(resolvedPath: string, workspaceId: string): boolean {
  const resolved = path.resolve(resolvedPath);
  return allowedWorkspaceFileDirs(workspaceId).some((dir) => resolved === path.resolve(dir) || resolved.startsWith(`${path.resolve(dir)}${path.sep}`));
}

export function resolveRuntimeFile(
  filePath: string | null,
  options: { workspaceId?: string } = {}
): RuntimeFileRef | { error: string; status: number } {
  if (!filePath) return { error: "Missing 'path' parameter", status: 400 };
  if (!path.isAbsolute(filePath)) return { error: "Path must be absolute", status: 400 };

  const resolved = path.resolve(filePath);
  const allowed = options.workspaceId
    ? isWorkspaceRuntimeFileAllowed(resolved, options.workspaceId)
    : isRuntimeFileAllowed(resolved);
  if (!allowed) {
    if (options.workspaceId) {
      return { error: "Access denied: path outside allowed workspace directories", status: 403 };
    }
    return { error: "Access denied: path outside allowed directories", status: 403 };
  }
  if (!fs.existsSync(resolved)) return { error: "File not found", status: 404 };

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return { error: "Not a file", status: 400 };

  return {
    path: filePath,
    resolved,
    contentType: getRuntimeFileContentType(resolved),
    fileName: path.basename(resolved),
    size: stat.size,
  };
}

export function isRuntimeFileRef(value: RuntimeFileRef | { error: string; status: number }): value is RuntimeFileRef {
  return !("error" in value);
}

export function serveRuntimeFile(filePath: string | null, download = false, workspaceId?: string): RuntimeFileServeResult {
  const file = resolveRuntimeFile(filePath, { workspaceId });

  if (!isRuntimeFileRef(file)) {
    return {
      kind: "error",
      status: file.status,
      body: { error: file.error },
    };
  }

  const disposition = download ? "attachment" : "inline";
  const buffer = fs.readFileSync(file.resolved);
  return {
    kind: "file",
    body: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(file.fileName)}"`,
    },
  };
}

export async function openRuntimeFile(filePath: string | null, workspaceId?: string): Promise<RuntimeFileOpenResult> {
  const file = resolveRuntimeFile(filePath, { workspaceId });

  if (!isRuntimeFileRef(file)) {
    return {
      kind: "error",
      status: file.status,
      body: { success: false, error: file.error },
    };
  }

  const [{ execFile }, { promisify }] = await Promise.all([
    import("child_process"),
    import("util"),
  ]);
  const run = promisify(execFile);

  if (process.platform === "darwin") {
    await run("open", [file.resolved], { timeout: 10_000 });
  } else if (process.platform === "win32") {
    await run("cmd", ["/c", "start", "", file.resolved], { timeout: 10_000, windowsHide: true });
  } else {
    await run("xdg-open", [file.resolved], { timeout: 10_000 });
  }

  return {
    kind: "opened",
    status: 200,
    body: { success: true, fileName: file.fileName, path: file.resolved },
  };
}

async function convertOfficeDocumentToHtml(resolved: string, outputDir: string): Promise<void> {
  const { execFileSync } = await import("child_process");
  execFileSync("soffice", [
    "--headless",
    "--convert-to", "html",
    "--outdir", outputDir,
    resolved,
  ], { timeout: 30000 });
}

function readConvertedHtml(resolved: string, outputDir: string): string {
  const baseName = path.basename(resolved, path.extname(resolved));
  const outputHtml = path.join(outputDir, `${baseName}.html`);

  if (fs.existsSync(outputHtml)) {
    return fs.readFileSync(outputHtml, "utf-8");
  }

  const files = fs.readdirSync(outputDir).filter((file) => file.startsWith(baseName) && file.endsWith(".html"));
  if (files.length === 0) {
    throw new Error("LibreOffice conversion produced no output");
  }

  files.sort((a, b) => {
    const aModified = fs.statSync(path.join(outputDir, a)).mtimeMs;
    const bModified = fs.statSync(path.join(outputDir, b)).mtimeMs;
    return bModified - aModified;
  });

  return fs.readFileSync(path.join(outputDir, files[0]), "utf-8");
}

function documentPreviewRequest(
  runtime: SalesRuntime,
  workspaceId: string,
  resolved: string,
  extension: string
): SideEffectDecision {
  return runtime.requestSideEffect({
    kind: "document.preview",
    workspaceId,
    summary: `Preview ${path.basename(resolved)} through local document converter`,
    payload: {
      path: resolved,
      extension,
      source: "files.preview",
    },
    idempotencyKey: `${workspaceId}:document-preview:${resolved}`,
  });
}

export async function previewRuntimeFile(
  runtime: SalesRuntime,
  input: { path: string | null; workspaceId: string }
): Promise<RuntimeFilePreviewResult> {
  const file = resolveRuntimeFile(input.path, { workspaceId: input.workspaceId });

  if (!isRuntimeFileRef(file)) {
    return {
      kind: "json",
      status: file.status,
      body: { error: file.error },
    };
  }

  const resolved = file.resolved;
  const extension = path.extname(resolved).toLowerCase();
  const downloadUrl = `/api/files?path=${encodeURIComponent(resolved)}&project=${encodeURIComponent(input.workspaceId)}`;

  if (extension === ".pdf" || extension === ".html" || extension === ".htm") {
    return {
      kind: "json",
      body: {
        previewAvailable: false,
        reason: "direct",
        downloadUrl,
        inlineUrl: downloadUrl,
      },
    };
  }

  if (extension === ".xlsx" || extension === ".xls" || extension === ".docx" || extension === ".doc") {
    const sideEffect = documentPreviewRequest(runtime, input.workspaceId, resolved, extension);
    const downloadOnlyUrl = `${downloadUrl}&download=true`;

    if (sideEffect.status !== "allowed") {
      return {
        kind: "json",
        body: {
          previewAvailable: false,
          blocked: true,
          reason: "preview_conversion_blocked",
          message: sideEffect.reason,
          sideEffect,
          downloadUrl: downloadOnlyUrl,
        },
      };
    }

    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-preview-"));

    try {
      await convertOfficeDocumentToHtml(resolved, outputDir);
      return {
        kind: "html",
        html: readConvertedHtml(resolved, outputDir),
      };
    } catch (error) {
      return {
        kind: "json",
        body: {
          previewAvailable: false,
          reason: "conversion_failed",
          message: error instanceof Error ? error.message : "Conversion failed",
          downloadUrl: downloadOnlyUrl,
        },
      };
    } finally {
      try {
        fs.rmSync(outputDir, { recursive: true, force: true });
      } catch {
        // Preview temp cleanup is best-effort.
      }
    }
  }

  return {
    kind: "json",
    body: {
      previewAvailable: false,
      reason: "unsupported_format",
      downloadUrl: `${downloadUrl}&download=true`,
    },
  };
}
