import fs from "fs";
import path from "path";
import {
  securePathCheck,
  isAllowedFileType,
  getContentType,
} from "./path-guard";
import { paths } from "@/lib/ssa-paths";

// ─── Allowed base directories (only for generated documents/outputs) ───────
export const ALLOWED_BASE_DIRS = [
  path.join(paths.data, "documents") + "/",
  path.join(paths.data, "quotations") + "/",
  path.join(paths.output) + "/",
  path.join(paths.skills, "quotation-workflow", "output") + "/",
  path.join(paths.skills, "quotation-workflow", "examples") + "/",
  path.join(paths.skills, "quotation-workflow", "tests", "output") + "/",
  path.join(paths.root, "scripts", "output") + "/",
];

// Max file size: 50MB
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

// ─── File token registry ───────────────────────────────────────────────────
interface FileTokenEntry {
  resolvedPath: string;
  fileName: string;
  contentType: string;
  size: number;
  expiresAt: number;
}

// In-memory store: token → entry. TTL 15 minutes.
const TOKEN_TTL_MS = 15 * 60 * 1000;
const fileRegistry = new Map<string, FileTokenEntry>();

/**
 * Generate a cryptographically random token string.
 */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Sweep expired entries from the registry.
 */
export function sweepExpiredTokens(): void {
  const now = Date.now();
  fileRegistry.forEach((entry, token) => {
    if (entry.expiresAt < now) {
      fileRegistry.delete(token);
    }
  });
}

/**
 * Register a file path and return a short-lived access token.
 *
 * Validates:
 *  1. Path is absolute
 *  2. realpath resolves inside one of the allowed base dirs
 *  3. File type is on the allowlist
 *  4. File exists and is a regular file
 */
export function registerFile(
  requestedPath: string
): { ok: true; token: string; entry: FileTokenEntry } | { ok: false; reason: string } {
  // Must be absolute
  if (!path.isAbsolute(requestedPath)) {
    return { ok: false, reason: "Path must be absolute" };
  }

  // Check against each allowed base directory
  let checkResult: { ok: true; resolved: string } | { ok: false; reason: string } = {
    ok: false,
    reason: "Access denied: path outside allowed directories",
  };

  for (const baseDir of ALLOWED_BASE_DIRS) {
    if (!fs.existsSync(baseDir)) continue;
    checkResult = securePathCheck(requestedPath, baseDir);
    if (checkResult.ok) break;
  }

  if (!checkResult.ok) {
    return { ok: false, reason: checkResult.reason };
  }

  const resolved = checkResult.resolved;

  // File type allowlist
  if (!isAllowedFileType(resolved)) {
    return { ok: false, reason: "File type not allowed" };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    return { ok: false, reason: "Not a file" };
  }

  if (stat.size > MAX_FILE_SIZE) {
    return { ok: false, reason: "File too large (max 50MB)" };
  }

  // Generate token and store entry
  const token = generateToken();
  const entry: FileTokenEntry = {
    resolvedPath: resolved,
    fileName: path.basename(resolved),
    contentType: getContentType(resolved),
    size: stat.size,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };

  fileRegistry.set(token, entry);
  return { ok: true, token, entry };
}

/**
 * Look up a token and return the entry if valid and not expired.
 */
export function lookupToken(
  token: string
): { ok: true; entry: FileTokenEntry } | { ok: false; reason: string } {
  if (!token) {
    return { ok: false, reason: "Missing file token" };
  }

  const entry = fileRegistry.get(token);
  if (!entry) {
    return { ok: false, reason: "Invalid or expired file token" };
  }

  if (entry.expiresAt < Date.now()) {
    fileRegistry.delete(token);
    return { ok: false, reason: "File token expired" };
  }

  return { ok: true, entry };
}

/**
 * Remove a token from the registry (single-use or explicit revocation).
 */
export function revokeToken(token: string): void {
  fileRegistry.delete(token);
}
