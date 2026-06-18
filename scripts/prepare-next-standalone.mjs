#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_RESOURCE_DIRS = ["scripts", "skills", "shared", "templates"];

function copyRuntimeResource(repoRoot, standaloneDir, name) {
  const source = path.join(repoRoot, name);
  if (!fs.existsSync(source)) return null;
  const target = path.join(standaloneDir, name);
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, {
    recursive: true,
    filter: (sourcePath) => {
      const base = path.basename(sourcePath);
      if (base === "node_modules" || base === ".git" || base === ".next") return false;
      if (base === "__pycache__" || base === ".pytest_cache" || base === ".cache") return false;
      if (base.endsWith(".log") || base.endsWith(".tsbuildinfo")) return false;
      return true;
    },
  });
  return target;
}

export function prepareNextStandalone(rootDir = process.cwd(), options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : path.resolve(rootDir, "..");
  const nextDir = path.join(rootDir, ".next");
  const standaloneDir = path.join(nextDir, "standalone");
  const standaloneNextDir = path.join(standaloneDir, ".next");
  const staticSource = path.join(nextDir, "static");
  const staticTarget = path.join(standaloneNextDir, "static");
  const publicSource = path.join(rootDir, "public");
  const publicTarget = path.join(standaloneDir, "public");

  if (!fs.existsSync(standaloneDir)) {
    throw new Error("Next standalone output was not found. Run npm run build first.");
  }
  if (!fs.existsSync(staticSource)) {
    throw new Error("Next static assets were not found. Run npm run build first.");
  }

  fs.mkdirSync(standaloneNextDir, { recursive: true });
  fs.rmSync(staticTarget, { recursive: true, force: true });
  fs.cpSync(staticSource, staticTarget, { recursive: true });

  if (fs.existsSync(publicSource)) {
    fs.rmSync(publicTarget, { recursive: true, force: true });
    fs.cpSync(publicSource, publicTarget, { recursive: true });
  }

  const runtimeTargets = RUNTIME_RESOURCE_DIRS
    .map((name) => copyRuntimeResource(repoRoot, standaloneDir, name))
    .filter(Boolean);

  return {
    standaloneDir,
    staticTarget,
    publicTarget: fs.existsSync(publicSource) ? publicTarget : null,
    runtimeTargets,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const currentPath = path.resolve(fileURLToPath(import.meta.url));

if (invokedPath === currentPath) {
  prepareNextStandalone(process.argv[2] ? path.resolve(process.argv[2]) : process.cwd());
}
