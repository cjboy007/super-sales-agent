import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-local-onboarding-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("local gateway onboarding state", () => {
  it("persists completion state under SSA_DATA_ROOT", async () => {
    const {
      getLocalOnboardingStatus,
      markLocalOnboardingComplete,
      resetLocalOnboarding,
    } = await import("./local-onboarding");

    expect(getLocalOnboardingStatus()).toMatchObject({
      completed: false,
      completedAt: null,
      testUploadCompleted: false,
      synthesisTestCompleted: false,
    });

    markLocalOnboardingComplete({
      accessMode: "lan",
      modelProvider: "ollama",
      testUploadCompleted: true,
      synthesisTestCompleted: true,
    });

    const completed = getLocalOnboardingStatus();
    expect(completed).toMatchObject({
      completed: true,
      accessMode: "lan",
      modelProvider: "ollama",
      testUploadCompleted: true,
      synthesisTestCompleted: true,
    });
    expect(completed.completedAt).toEqual(expect.any(String));
    expect(fs.existsSync(path.join(tempRoot, "local-onboarding.json"))).toBe(true);

    resetLocalOnboarding();
    expect(getLocalOnboardingStatus().completed).toBe(false);
  });
});
