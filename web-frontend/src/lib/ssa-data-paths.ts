import fs from "fs";
import os from "os";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const DEFAULT_DATA_ROOT = path.join(os.homedir(), ".ssa", "data");

export function ssaDataRoot(): string {
  return path.resolve(process.env.SSA_DATA_ROOT || DEFAULT_DATA_ROOT);
}

export function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function ssaDataPath(...segments: string[]): string {
  return path.join(ssaDataRoot(), ...segments);
}

export function ensureSsaDataPath(...segments: string[]): string {
  const filePath = ssaDataPath(...segments);
  ensureDir(path.dirname(filePath));
  return filePath;
}

export function repoPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export function firstExistingPath(...paths: string[]): string | null {
  return paths.find((candidate) => fs.existsSync(candidate)) || null;
}
