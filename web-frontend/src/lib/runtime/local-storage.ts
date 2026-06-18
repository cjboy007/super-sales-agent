import fs from "fs";
import path from "path";
import { readSettings } from "../config-store";
import { sanitizeSsaPathSegment, ssaCompanyDataPath, ssaDataRoot } from "../ssa-data-paths";
import { getRuntimeFileContentType, isWorkspaceRuntimeFileAllowed, runtimeFileUrl } from "./files";

export interface LocalStorageDirectorySummary {
  id: "intake-uploads" | "syntheses" | "documents";
  label: string;
  relativePath: string;
  bytes: number;
  files: number;
}

export interface LocalStorageSummary {
  workspaceId: string;
  dataRoot: string;
  workspaceRoot: string;
  totalBytes: number;
  totalFiles: number;
  retention: {
    mode: "keep" | "archive";
    maxActiveSessions: number | null;
    deletesOriginals: false;
  };
  directories: LocalStorageDirectorySummary[];
}

export interface LocalStorageEntry {
  name: string;
  kind: "file" | "directory";
  relativePath: string;
  size: number;
  updatedAt: string;
  contentType?: string;
  downloadUrl?: string;
  previewUrl?: string;
}

export interface LocalStorageListing {
  workspaceId: string;
  relativePath: string;
  entries: LocalStorageEntry[];
}

const ROOTS: Array<Pick<LocalStorageDirectorySummary, "id" | "label" | "relativePath">> = [
  { id: "intake-uploads", label: "Intake uploads", relativePath: "intake/uploads" },
  { id: "syntheses", label: "Synthesis outputs", relativePath: "documents/syntheses" },
  { id: "documents", label: "Documents", relativePath: "documents" },
];

function statTree(rootPath: string): { bytes: number; files: number } {
  if (!fs.existsSync(rootPath)) return { bytes: 0, files: 0 };
  const stat = fs.statSync(rootPath);
  if (stat.isFile()) return { bytes: stat.size, files: 1 };
  if (!stat.isDirectory()) return { bytes: 0, files: 0 };

  return fs.readdirSync(rootPath, { withFileTypes: true }).reduce((total, entry) => {
    if (entry.name.startsWith(".")) return total;
    const child = statTree(path.join(rootPath, entry.name));
    return {
      bytes: total.bytes + child.bytes,
      files: total.files + child.files,
    };
  }, { bytes: 0, files: 0 });
}

function workspaceRoot(workspaceId: string) {
  return ssaCompanyDataPath(sanitizeSsaPathSegment(workspaceId));
}

function normalizeRelativePath(relativePath: string | null | undefined) {
  const normalized = String(relativePath || "documents").replace(/\\/g, "/").replace(/^\/+/, "");
  return path.posix.normalize(normalized);
}

function resolveStoragePath(workspaceId: string, relativePath: string | null | undefined) {
  const normalized = normalizeRelativePath(relativePath);
  if (!ROOTS.some((root) => normalized === root.relativePath || normalized.startsWith(`${root.relativePath}/`))) {
    throw new Error("Path outside local storage browser roots.");
  }
  const resolved = path.resolve(workspaceRoot(workspaceId), normalized);
  if (!isWorkspaceRuntimeFileAllowed(resolved, workspaceId) && !(fs.existsSync(resolved) && fs.statSync(resolved).isDirectory())) {
    throw new Error("Path outside local storage browser roots.");
  }
  const root = path.resolve(workspaceRoot(workspaceId));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path outside local storage browser roots.");
  }
  return { normalized, resolved };
}

export function getLocalStorageSummary(workspaceId: string): LocalStorageSummary {
  const settings = readSettings();
  const retentionMode = settings.intakeRetentionMode === "archive" ? "archive" : "keep";
  const summaries = ROOTS.map((root) => {
    const stats = statTree(path.join(workspaceRoot(workspaceId), root.relativePath));
    return { ...root, ...stats };
  });
  const maxActiveSessions = Number(settings.intakeMaxActiveSessions || 0);
  return {
    workspaceId,
    dataRoot: ssaDataRoot(),
    workspaceRoot: workspaceRoot(workspaceId),
    totalBytes: summaries.reduce((sum, item) => sum + item.bytes, 0),
    totalFiles: summaries.reduce((sum, item) => sum + item.files, 0),
    retention: {
      mode: retentionMode,
      maxActiveSessions: retentionMode === "archive" && maxActiveSessions > 0 ? maxActiveSessions : null,
      deletesOriginals: false,
    },
    directories: summaries,
  };
}

export function listLocalStorageEntries(input: {
  workspaceId: string;
  relativePath?: string | null;
}): LocalStorageListing {
  const { normalized, resolved } = resolveStoragePath(input.workspaceId, input.relativePath);
  if (!fs.existsSync(resolved)) {
    return { workspaceId: input.workspaceId, relativePath: normalized, entries: [] };
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) throw new Error("Local storage browser path must be a directory.");

  const entries = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry): LocalStorageEntry | null => {
      const absolute = path.join(resolved, entry.name);
      const entryStat = fs.statSync(absolute);
      const relative = path.posix.join(normalized, entry.name);
      if (entry.isDirectory()) {
        return {
          name: entry.name,
          kind: "directory",
          relativePath: relative,
          size: 0,
          updatedAt: entryStat.mtime.toISOString(),
        };
      }
      if (!entry.isFile() || !isWorkspaceRuntimeFileAllowed(absolute, input.workspaceId)) return null;
      return {
        name: entry.name,
        kind: "file",
        relativePath: relative,
        size: entryStat.size,
        updatedAt: entryStat.mtime.toISOString(),
        contentType: getRuntimeFileContentType(absolute),
        previewUrl: runtimeFileUrl(absolute, input.workspaceId),
        downloadUrl: runtimeFileUrl(absolute, input.workspaceId, true),
      };
    })
    .filter((entry): entry is LocalStorageEntry => Boolean(entry))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return {
    workspaceId: input.workspaceId,
    relativePath: normalized,
    entries,
  };
}
