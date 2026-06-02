import fs from "fs";
import path from "path";
import { ssaCompanyDataPath } from "../ssa-data-paths";

export interface WorkspaceCleanupOptions {
  now?: Date;
  maxAgeDays?: number;
}

export interface WorkspaceCleanupResult {
  workspaceId: string;
  removed: string[];
  scanned: string[];
}

function walkFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, results);
    else if (entry.isFile()) results.push(fullPath);
  }
  return results;
}

export function cleanupWorkspace(workspaceId: string, options: WorkspaceCleanupOptions = {}): WorkspaceCleanupResult {
  const now = options.now || new Date();
  const maxAgeDays = options.maxAgeDays || 14;
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  const roots = [
    ssaCompanyDataPath(workspaceId, "tmp"),
    ssaCompanyDataPath(workspaceId, ".jadenos", "previews"),
  ];
  const scanned = roots.flatMap((root) => walkFiles(root));
  const removed: string[] = [];

  for (const filePath of scanned) {
    try {
      const stats = fs.statSync(filePath);
      if (now.getTime() - stats.mtime.getTime() <= maxAgeMs) continue;
      fs.unlinkSync(filePath);
      removed.push(filePath);
    } catch {
      // Cleanup is best-effort.
    }
  }

  return { workspaceId, removed, scanned };
}
