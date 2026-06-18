import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { prepareNextStandalone } from "./prepare-next-standalone.mjs";

test("prepareNextStandalone copies Next static assets and public files into standalone output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-standalone-test-"));
  try {
    fs.mkdirSync(path.join(root, ".next", "standalone", ".next"), { recursive: true });
    fs.mkdirSync(path.join(root, ".next", "static", "chunks"), { recursive: true });
    fs.mkdirSync(path.join(root, "public", "brand"), { recursive: true });
    fs.writeFileSync(path.join(root, ".next", "static", "chunks", "app.js"), "console.log('ok');");
    fs.writeFileSync(path.join(root, "public", "brand", "ssa-icon-192.png"), "png");
    fs.writeFileSync(path.join(root, "public", "manifest.webmanifest"), "{}");

    const result = prepareNextStandalone(root);

    assert.equal(
      fs.readFileSync(path.join(root, ".next", "standalone", ".next", "static", "chunks", "app.js"), "utf-8"),
      "console.log('ok');"
    );
    assert.equal(
      fs.readFileSync(path.join(root, ".next", "standalone", "public", "brand", "ssa-icon-192.png"), "utf-8"),
      "png"
    );
    assert.equal(
      fs.readFileSync(path.join(root, ".next", "standalone", "public", "manifest.webmanifest"), "utf-8"),
      "{}"
    );
    assert.equal(result.publicTarget, path.join(root, ".next", "standalone", "public"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("prepareNextStandalone copies runtime resources needed outside the source repo", () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-standalone-runtime-test-"));
  const webRoot = path.join(repoRoot, "web-frontend");
  try {
    fs.mkdirSync(path.join(webRoot, ".next", "standalone", ".next"), { recursive: true });
    fs.mkdirSync(path.join(webRoot, ".next", "static"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "skills", "product-doc-reader"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "shared"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "templates"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "scripts", "local-gateway-entrypoint.mjs"), "entrypoint");
    fs.writeFileSync(path.join(repoRoot, "skills", "product-doc-reader", "SKILL.md"), "skill");
    fs.writeFileSync(path.join(repoRoot, "shared", "ssa-secrets.js"), "secret helper");
    fs.writeFileSync(path.join(repoRoot, "templates", "pi-modern.html"), "template");

    prepareNextStandalone(webRoot, { repoRoot });

    assert.equal(
      fs.readFileSync(path.join(webRoot, ".next", "standalone", "scripts", "local-gateway-entrypoint.mjs"), "utf-8"),
      "entrypoint"
    );
    assert.equal(
      fs.readFileSync(path.join(webRoot, ".next", "standalone", "skills", "product-doc-reader", "SKILL.md"), "utf-8"),
      "skill"
    );
    assert.equal(
      fs.readFileSync(path.join(webRoot, ".next", "standalone", "shared", "ssa-secrets.js"), "utf-8"),
      "secret helper"
    );
    assert.equal(
      fs.readFileSync(path.join(webRoot, ".next", "standalone", "templates", "pi-modern.html"), "utf-8"),
      "template"
    );
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("prepareNextStandalone fails clearly before a production build exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-standalone-missing-test-"));
  try {
    assert.throws(
      () => prepareNextStandalone(root),
      /Next standalone output was not found/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
