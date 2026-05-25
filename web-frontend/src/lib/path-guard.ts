import fs from "fs";
import path from "path";

/**
 * Secure path guard: resolves symlinks via realpath, then verifies the
 * resolved path is strictly inside the allowed base directory.
 *
 * Uses `base + path.sep` to prevent prefix bypass attacks like:
 *   /allowed-dir-backup/evil.txt  passing a startsWith("/allowed-dir/") check.
 */
export function securePathCheck(
  requestedPath: string,
  baseDir: string
): { ok: true; resolved: string } | { ok: false; reason: string } {
  // Must be absolute
  if (!path.isAbsolute(requestedPath)) {
    return { ok: false, reason: "Path must be absolute" };
  }

  // Resolve the base to its real path
  const realBase = fs.realpathSync(baseDir);

  // Resolve the requested path — first canonicalize, then realpath
  // Use resolve first to handle ../ before checking existence
  const resolved = path.resolve(requestedPath);

  // File must exist for realpath to work
  if (!fs.existsSync(resolved)) {
    return { ok: false, reason: "File not found" };
  }

  // Resolve symlinks
  const realPath = fs.realpathSync(resolved);

  // Must be the base itself or a direct child
  if (realPath === realBase || realPath.startsWith(realBase + path.sep)) {
    return { ok: true, resolved: realPath };
  }

  return { ok: false, reason: "Access denied: path outside allowed directory" };
}

/**
 * Check if a file extension is safe to serve inline.
 * HTML and SVG are blocked to prevent XSS.
 */
export function isSafeInlineExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const blocked = [".html", ".htm", ".svg", ".svgz"];
  return !blocked.includes(ext);
}

/**
 * Check if a file extension is allowed for download at all.
 * Blocks sensitive file types (.env, .db, .json, .log, etc.)
 */
export function isAllowedFileType(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const blocked = [
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    ".json",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".log",
    ".lock",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".conf",
    ".cfg",
    ".sh",
    ".bash",
    ".py",
    ".md",
    ".gitignore",
    ".gitattributes",
  ];
  // Block dot-env files (path.extname(".env") returns "", so check basename)
  if (basename.startsWith(".env")) return false;
  return !blocked.includes(ext);
}

/**
 * Content-Type mapping for allowed file types only.
 */
export const CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}
