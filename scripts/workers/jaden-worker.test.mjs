import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runCli } from "./jaden-worker.mjs";

test("jaden-worker CLI runs one tick against SSA_DATA_ROOT without a web request", async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-jaden-worker-cli-test-"));
  const originalDataRoot = process.env.SSA_DATA_ROOT;
  const originalLlmProvider = process.env.SSA_LLM_PROVIDER;
  const writes = [];
  const originalWrite = process.stdout.write;

  try {
    process.env.SSA_DATA_ROOT = dataRoot;
    process.env.SSA_LLM_PROVIDER = "mock";
    process.stdout.write = function patchedWrite(chunk, ...args) {
      writes.push(String(chunk));
      return originalWrite.call(this, chunk, ...args);
    };

    await runCli(["--once", "--worker-id", "cli-test-worker", "--max-jobs", "1"]);

    const output = writes.join("");
    assert.match(output, /"workerId":"cli-test-worker"/);
    assert.match(output, /"claimed":0/);
  } finally {
    process.stdout.write = originalWrite;

    if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
    else process.env.SSA_DATA_ROOT = originalDataRoot;

    if (originalLlmProvider === undefined) delete process.env.SSA_LLM_PROVIDER;
    else process.env.SSA_LLM_PROVIDER = originalLlmProvider;

    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
