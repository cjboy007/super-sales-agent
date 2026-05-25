import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  securePathCheck,
  isSafeInlineExt,
  isAllowedFileType,
  getContentType,
} from "../path-guard";

// Create a temporary directory structure for testing
let testDir: string;
let allowedBase: string;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), "path-guard-test-"));
  allowedBase = path.join(testDir, "allowed");
  fs.mkdirSync(allowedBase, { recursive: true });
  // Create test files
  fs.writeFileSync(path.join(allowedBase, "document.pdf"), "fake pdf");
  fs.writeFileSync(path.join(allowedBase, "report.xlsx"), "fake xlsx");
  fs.writeFileSync(path.join(allowedBase, "page.html"), "<html>evil</html>");
  fs.writeFileSync(path.join(allowedBase, "icon.svg"), "<svg>icon</svg>");
  fs.writeFileSync(path.join(allowedBase, ".env"), "SECRET=leaked");
  fs.writeFileSync(path.join(allowedBase, "data.json"), '{"key":"value"}');
  // Create a file outside the allowed base
  fs.writeFileSync(path.join(testDir, "outside.txt"), "outside content");
  // Create a "prefix-similar" directory to test prefix bypass
  fs.mkdirSync(allowedBase + "-backup", { recursive: true });
  fs.writeFileSync(path.join(allowedBase + "-backup", "stolen.txt"), "stolen data");
  // Create a symlink pointing outside
  try {
    fs.symlinkSync(path.join(testDir, "outside.txt"), path.join(allowedBase, "escape-link"));
  } catch {
    // symlinks may fail on some platforms, tests handle this
  }
});

afterAll(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe("securePathCheck", () => {
  it("allows files inside the allowed base directory", () => {
    const result = securePathCheck(path.join(allowedBase, "document.pdf"), allowedBase);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // macOS resolves /var -> /private/var via realpath, compare against resolved base
      const expectedReal = fs.realpathSync(path.join(allowedBase, "document.pdf"));
      expect(result.resolved).toBe(expectedReal);
    }
  });

  it("rejects relative paths", () => {
    const result = securePathCheck("../../../etc/passwd", allowedBase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Path must be absolute");
    }
  });

  it("rejects files outside the allowed base directory", () => {
    const result = securePathCheck(path.join(testDir, "outside.txt"), allowedBase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Access denied: path outside allowed directory");
    }
  });

  it("rejects prefix-bypass attack (allowed-backup directory)", () => {
    // Attack: /tmp/path-guard-xxx/allowed-backup/stolen.txt should NOT pass
    // a startsWith("/tmp/path-guard-xxx/allowed/") check
    const result = securePathCheck(
      path.join(allowedBase + "-backup", "stolen.txt"),
      allowedBase
    );
    expect(result.ok).toBe(false);
  });

  it("rejects path traversal via .. inside allowed base", () => {
    const result = securePathCheck(
      path.join(allowedBase, "..", "outside.txt"),
      allowedBase
    );
    expect(result.ok).toBe(false);
  });

  it("rejects non-existent files", () => {
    const result = securePathCheck(path.join(allowedBase, "nonexistent.pdf"), allowedBase);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("File not found");
    }
  });

  it("follows symlinks and rejects if target is outside base", () => {
    const linkPath = path.join(allowedBase, "escape-link");
    if (!fs.existsSync(linkPath) || !fs.lstatSync(linkPath).isSymbolicLink()) {
      // Skip if symlink creation failed
      return;
    }
    const result = securePathCheck(linkPath, allowedBase);
    expect(result.ok).toBe(false);
  });

  it("allows the base directory itself", () => {
    const result = securePathCheck(allowedBase, allowedBase);
    expect(result.ok).toBe(true);
  });
});

describe("isSafeInlineExt", () => {
  it("blocks HTML files", () => {
    expect(isSafeInlineExt("/path/to/page.html")).toBe(false);
    expect(isSafeInlineExt("/path/to/page.HTM")).toBe(false);
  });

  it("blocks SVG files", () => {
    expect(isSafeInlineExt("/path/to/icon.svg")).toBe(false);
    expect(isSafeInlineExt("/path/to/icon.SVGZ")).toBe(false);
  });

  it("allows PDF files", () => {
    expect(isSafeInlineExt("/path/to/document.pdf")).toBe(true);
  });

  it("allows image files", () => {
    expect(isSafeInlineExt("/path/to/photo.jpg")).toBe(true);
    expect(isSafeInlineExt("/path/to/photo.png")).toBe(true);
  });

  it("allows spreadsheet files", () => {
    expect(isSafeInlineExt("/path/to/report.xlsx")).toBe(true);
  });
});

describe("isAllowedFileType", () => {
  it("blocks .env files", () => {
    expect(isAllowedFileType("/path/to/.env")).toBe(false);
    expect(isAllowedFileType("/path/to/.env.local")).toBe(false);
  });

  it("blocks source code files", () => {
    expect(isAllowedFileType("/path/to/app.ts")).toBe(false);
    expect(isAllowedFileType("/path/to/page.tsx")).toBe(false);
    expect(isAllowedFileType("/path/to/server.js")).toBe(false);
    expect(isAllowedFileType("/path/to/script.py")).toBe(false);
  });

  it("blocks database files", () => {
    expect(isAllowedFileType("/path/to/data.db")).toBe(false);
    expect(isAllowedFileType("/path/to/data.sqlite")).toBe(false);
    expect(isAllowedFileType("/path/to/data.sqlite3")).toBe(false);
  });

  it("blocks config and log files", () => {
    expect(isAllowedFileType("/path/to/data.json")).toBe(false);
    expect(isAllowedFileType("/path/to/app.log")).toBe(false);
    expect(isAllowedFileType("/path/to/config.yaml")).toBe(false);
    expect(isAllowedFileType("/path/to/config.yml")).toBe(false);
    expect(isAllowedFileType("/path/to/package.json")).toBe(false);
    expect(isAllowedFileType("/path/to/tsconfig.json")).toBe(false);
  });

  it("blocks lock files", () => {
    expect(isAllowedFileType("/path/to/package-lock.json")).toBe(false);
    // .lock extension
    expect(isAllowedFileType("/path/to/something.lock")).toBe(false);
  });

  it("allows business document files", () => {
    expect(isAllowedFileType("/path/to/quote.pdf")).toBe(true);
    expect(isAllowedFileType("/path/to/invoice.xlsx")).toBe(true);
    expect(isAllowedFileType("/path/to/contract.docx")).toBe(true);
    expect(isAllowedFileType("/path/to/notes.txt")).toBe(true);
    expect(isAllowedFileType("/path/to/data.csv")).toBe(true);
  });

  it("allows image files", () => {
    expect(isAllowedFileType("/path/to/logo.png")).toBe(true);
    expect(isAllowedFileType("/path/photo.jpg")).toBe(true);
  });
});

describe("getContentType", () => {
  it("returns correct MIME for PDF", () => {
    expect(getContentType("doc.pdf")).toBe("application/pdf");
  });

  it("returns correct MIME for Excel", () => {
    expect(getContentType("report.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });

  it("returns correct MIME for Word", () => {
    expect(getContentType("contract.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("returns octet-stream for unknown extensions", () => {
    expect(getContentType("file.xyz")).toBe("application/octet-stream");
  });

  it("is case-insensitive", () => {
    expect(getContentType("doc.PDF")).toBe("application/pdf");
    expect(getContentType("data.XLSX")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
  });
});
