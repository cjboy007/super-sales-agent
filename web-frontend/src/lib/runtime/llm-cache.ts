import crypto from "crypto";
import fs from "fs";
import { ensureSsaCompanyDataPath, readJsonFile } from "../ssa-data-paths";
import type { LlmResult } from "./types";

export interface LlmCacheKeyInput {
  workspaceId: string;
  taskType: string;
  modelName: string;
  promptVersion: string;
  input: string;
}

interface StoredLlmCacheEntry {
  key: string;
  taskType: string;
  modelName: string;
  promptVersion: string;
  inputHash: string;
  createdAt: string;
  result: LlmResult;
}

function cachePath(workspaceId: string) {
  return ensureSsaCompanyDataPath(workspaceId, ".jadenos", "cache", "llm-cache.json");
}

function inputHash(input: LlmCacheKeyInput): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      taskType: input.taskType,
      modelName: input.modelName,
      promptVersion: input.promptVersion,
      input: input.input,
    }))
    .digest("hex");
}

function cacheKey(input: LlmCacheKeyInput): string {
  return `${input.taskType}:${input.modelName}:${input.promptVersion}:${inputHash(input)}`;
}

function readCache(workspaceId: string): StoredLlmCacheEntry[] {
  return readJsonFile<StoredLlmCacheEntry[]>(cachePath(workspaceId), []);
}

function writeCache(workspaceId: string, entries: StoredLlmCacheEntry[]) {
  fs.writeFileSync(cachePath(workspaceId), JSON.stringify(entries.slice(-500), null, 2), "utf-8");
}

export function getLlmCacheEntry(input: LlmCacheKeyInput): LlmResult | null {
  const key = cacheKey(input);
  const entry = readCache(input.workspaceId).find((candidate) => candidate.key === key);
  if (!entry) return null;
  return {
    ...entry.result,
    source: "cache",
    structured: {
      ...(entry.result.structured || {}),
      cache: {
        hit: true,
        key,
        taskType: input.taskType,
        promptVersion: input.promptVersion,
        modelName: input.modelName,
        createdAt: entry.createdAt,
      },
    },
  };
}

export function setLlmCacheEntry(input: LlmCacheKeyInput, result: LlmResult): void {
  const key = cacheKey(input);
  const entries = readCache(input.workspaceId).filter((entry) => entry.key !== key);
  entries.push({
    key,
    taskType: input.taskType,
    modelName: input.modelName,
    promptVersion: input.promptVersion,
    inputHash: inputHash(input),
    createdAt: new Date().toISOString(),
    result,
  });
  writeCache(input.workspaceId, entries);
}
