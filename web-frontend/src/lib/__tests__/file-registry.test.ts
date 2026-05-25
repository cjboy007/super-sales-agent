import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import {
  registerFile,
  lookupToken,
  sweepExpiredTokens,
  revokeToken,
  ALLOWED_BASE_DIRS,
} from "../file-registry";

// Find an existing allowed base directory to use for testing
let testBaseDir: string | null = null;
let testFilePath: string | null = null;

beforeAll(() => {
  for (const dir of ALLOWED_BASE_DIRS) {
    if (fs.existsSync(dir)) {
      testBaseDir = dir;
      break;
    }
  }
  if (testBaseDir) {
    testFilePath = path.join(testBaseDir, `__test-file-${Date.now()}.pdf`);
    fs.writeFileSync(testFilePath, "test pdf content for registry");
  }
});

afterAll(() => {
  if (testFilePath && fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
  }
});

describe("registerFile", () => {
  it("returns a token for a valid file in an allowed directory", () => {
    if (!testFilePath) {
      // No allowed base dirs exist on this machine
      return;
    }
    const result = registerFile(testFilePath);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.entry.fileName).toContain(".pdf");
      expect(result.entry.contentType).toBe("application/pdf");
      // Clean up the token
      revokeToken(result.token);
    }
  });

  it("rejects relative paths", () => {
    const result = registerFile("documents/invoice.pdf");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Path must be absolute");
    }
  });

  it("rejects files outside allowed directories", () => {
    const result = registerFile("/etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("rejects disallowed file types (.json)", () => {
    // Use a path inside an allowed base dir but with blocked extension
    const dir = testBaseDir || ALLOWED_BASE_DIRS[0];
    const jsonPath = path.join(dir, `__test-config-${Date.now()}.json`);
    fs.writeFileSync(jsonPath, '{"key":"value"}');
    const result = registerFile(jsonPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("File type not allowed");
    }
    // Clean up
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
  });

  it("rejects disallowed file types (.ts source code)", () => {
    const dir = testBaseDir || ALLOWED_BASE_DIRS[0];
    const tsPath = path.join(dir, `__test-app-${Date.now()}.ts`);
    fs.writeFileSync(tsPath, "const x = 1;");
    const result = registerFile(tsPath);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("File type not allowed");
    }
    if (fs.existsSync(tsPath)) fs.unlinkSync(tsPath);
  });

  it("rejects directories", () => {
    const dir = testBaseDir || ALLOWED_BASE_DIRS[0];
    if (fs.existsSync(dir)) {
      const result = registerFile(dir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("Not a file");
      }
    }
  });

  it("rejects non-existent files", () => {
    const dir = testBaseDir || ALLOWED_BASE_DIRS[0];
    const result = registerFile(path.join(dir, `nonexistent-${Date.now()}.pdf`));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("File not found");
    }
  });

  it("rejects files with path traversal attempt", () => {
    const base = testBaseDir || ALLOWED_BASE_DIRS[0];
    const result = registerFile(path.join(base, "../../../etc/passwd"));
    expect(result.ok).toBe(false);
  });
});

describe("lookupToken", () => {
  it("rejects invalid tokens", () => {
    const lookup = lookupToken("nonexistent-token-abc123");
    expect(lookup.ok).toBe(false);
    if (!lookup.ok) {
      expect(lookup.reason).toBe("Invalid or expired file token");
    }
  });

  it("rejects empty tokens", () => {
    const lookup = lookupToken("");
    expect(lookup.ok).toBe(false);
  });

  it("returns entry for a freshly registered token", () => {
    if (!testFilePath) return;
    const reg = registerFile(testFilePath);
    if (!reg.ok) throw new Error("Registration failed");

    const lookup = lookupToken(reg.token);
    expect(lookup.ok).toBe(true);
    if (lookup.ok) {
      expect(lookup.entry.resolvedPath).toBe(fs.realpathSync(testFilePath));
      expect(lookup.entry.fileName).toContain(".pdf");
    }
    revokeToken(reg.token);
  });
});

describe("revokeToken", () => {
  it("makes a token invalid after revocation", () => {
    if (!testFilePath) return;
    const reg = registerFile(testFilePath);
    if (!reg.ok) throw new Error("Registration failed");

    revokeToken(reg.token);

    const lookup = lookupToken(reg.token);
    expect(lookup.ok).toBe(false);
  });
});

describe("sweepExpiredTokens", () => {
  it("does not remove non-expired tokens", () => {
    if (!testFilePath) return;
    const reg = registerFile(testFilePath);
    if (!reg.ok) throw new Error("Registration failed");

    sweepExpiredTokens();
    const lookup = lookupToken(reg.token);
    expect(lookup.ok).toBe(true);
    revokeToken(reg.token);
  });
});
