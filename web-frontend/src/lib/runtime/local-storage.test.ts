import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-local-storage-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function writeWorkspaceFile(workspaceId: string, relativePath: string, contents: string) {
  const filePath = path.join(tempRoot, "companies", workspaceId, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, "utf-8");
  return filePath;
}

describe("local storage browser", () => {
  it("summarizes workspace storage without deleting intake data", async () => {
    writeWorkspaceFile("farreach", "intake/uploads/intake-1/rfq.txt", "rfq");
    writeWorkspaceFile("farreach", "documents/syntheses/SYN-1.md", "summary");
    writeWorkspaceFile("farreach", "documents/pi/PI-1.html", "pi");

    const { getLocalStorageSummary } = await import("./local-storage");
    const summary = getLocalStorageSummary("farreach");

    expect(summary.dataRoot).toBe(tempRoot);
    expect(summary.workspaceId).toBe("farreach");
    expect(summary.retention).toMatchObject({
      mode: "keep",
      maxActiveSessions: null,
      deletesOriginals: false,
    });
    expect(summary.directories.map((item) => item.id)).toEqual([
      "intake-uploads",
      "syntheses",
      "documents",
    ]);
    expect(summary.totalBytes).toBeGreaterThan(0);
  });

  it("lists safe workspace files with download URLs and blocks path escape", async () => {
    const storedPath = writeWorkspaceFile("farreach", "documents/syntheses/SYN-safe.md", "safe summary");
    writeWorkspaceFile("farreach", ".jadenos/file-tokens.json", "secret token registry");

    const { listLocalStorageEntries } = await import("./local-storage");
    const listing = listLocalStorageEntries({
      workspaceId: "farreach",
      relativePath: "documents/syntheses",
    });

    expect(listing.relativePath).toBe("documents/syntheses");
    expect(listing.entries).toHaveLength(1);
    expect(listing.entries[0]).toMatchObject({
      name: "SYN-safe.md",
      kind: "file",
      downloadUrl: expect.stringContaining("/api/files?"),
      previewUrl: expect.stringContaining("/api/files?"),
    });
    expect(JSON.stringify(listing)).not.toContain(storedPath);
    expect(JSON.stringify(listing)).not.toContain(tempRoot);
    expect(() => listLocalStorageEntries({
      workspaceId: "farreach",
      relativePath: "../hero-pumps/documents",
    })).toThrow(/outside local storage/i);
    expect(() => listLocalStorageEntries({
      workspaceId: "farreach",
      relativePath: ".jadenos",
    })).toThrow(/outside local storage/i);
  });
});
