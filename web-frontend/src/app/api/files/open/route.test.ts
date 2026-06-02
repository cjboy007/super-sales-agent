import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("child_process")>()),
  execFile: (...args: unknown[]) => execFileMock(...args),
}));

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-files-open-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function requestFor(filePath: string, project = "farreach"): NextRequest {
  return new NextRequest(`http://localhost/api/files/open?project=${encodeURIComponent(project)}`, {
    method: "POST",
    body: JSON.stringify({ path: filePath }),
  });
}

describe("/api/files/open route", () => {
  it("opens workspace files with the system default app", async () => {
    execFileMock.mockImplementation(
      (_file: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(null, "", "");
      }
    );
    const filePath = path.join(tempRoot, "companies", "farreach", "quotations", "QT-20260512-001.html");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "quote", "utf-8");
    const { POST } = await import("./route");

    const response = await POST(requestFor(filePath));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ success: true, fileName: "QT-20260512-001.html" });
    expect(execFileMock).toHaveBeenCalledOnce();
  });

  it("rejects files outside the selected workspace", async () => {
    const filePath = path.join(tempRoot, "companies", "hero-pumps", "quotations", "QT-20260512-001.html");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "quote", "utf-8");
    const { POST } = await import("./route");

    const response = await POST(requestFor(filePath));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain("outside allowed workspace directories");
    expect(execFileMock).not.toHaveBeenCalled();
  });
});
