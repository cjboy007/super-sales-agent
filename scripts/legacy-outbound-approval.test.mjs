import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);

function* walkSourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      yield* walkSourceFiles(path.join(dir, entry.name));
      continue;
    }

    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    const relativePath = path.relative(REPO_ROOT, filePath);
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (/(^|\/)(test|tests|__tests__)\//.test(relativePath)) continue;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) continue;
    yield filePath;
  }
}

test("production outbound email paths require approval ids instead of hard-coded human approval", () => {
  const offenders = [];

  for (const filePath of walkSourceFiles(REPO_ROOT)) {
    const source = fs.readFileSync(filePath, "utf-8");
    if (/\bhumanApproval\s*:\s*true\b/.test(source)) {
      offenders.push(path.relative(REPO_ROOT, filePath));
    }
  }

  assert.deepEqual(offenders, []);
});
