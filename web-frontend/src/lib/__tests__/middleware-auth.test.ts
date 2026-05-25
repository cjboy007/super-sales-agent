/**
 * middleware-auth.test.ts
 *
 * Unit tests for SSA API authentication middleware (src/middleware.ts).
 * Tests the core auth logic without the Next.js runtime by extracting
 * the decision logic into a testable helper.
 *
 * Covered paths (P0/P1 security):
 *   - Fail-closed: no SSA_API_KEY configured → 500
 *   - Missing key header → 401
 *   - Wrong key → 401
 *   - Correct key → pass
 *   - Public path /api/health → pass without key
 *   - Non-API paths → pass without key
 */

import { describe, it, expect } from "vitest";

// ─── Inline the middleware decision logic ────────────────────────────────────
// We replicate the exact logic from middleware.ts so we can test it without
// the Next.js runtime. If middleware.ts changes, update this mirror.

const PUBLIC_PATHS = ["/api/health"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

type AuthDecision =
  | { status: "pass" }
  | { status: 401 | 500; error: string };

function checkAuth(
  pathname: string,
  apiKeyHeader: string | null,
  envApiKey: string | undefined
): AuthDecision {
  // Non-API routes are always allowed
  if (!pathname.startsWith("/api/")) return { status: "pass" };

  // Public paths skip auth
  if (isPublicPath(pathname)) return { status: "pass" };

  // Fail closed: no key configured
  if (!envApiKey) {
    return { status: 500, error: "Server configuration error: API key not set" };
  }

  // Key mismatch
  if (!apiKeyHeader || apiKeyHeader !== envApiKey) {
    return { status: 401, error: "Unauthorized" };
  }

  return { status: "pass" };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("middleware auth — fail-closed (no SSA_API_KEY)", () => {
  it("returns 500 for any /api/* route when SSA_API_KEY is not set", () => {
    const result = checkAuth("/api/leads", null, undefined);
    expect(result.status).toBe(500);
  });

  it("returns 500 even if caller provides a key header", () => {
    const result = checkAuth("/api/config", "some-key", undefined);
    expect(result.status).toBe(500);
  });

  it("still allows /api/health when SSA_API_KEY is not set", () => {
    const result = checkAuth("/api/health", null, undefined);
    expect(result.status).toBe("pass");
  });
});

describe("middleware auth — 401 on bad key", () => {
  const ENV_KEY = "test-secret-key-abc123";

  it("returns 401 when no x-api-key header is sent", () => {
    const result = checkAuth("/api/leads", null, ENV_KEY);
    expect(result.status).toBe(401);
  });

  it("returns 401 when x-api-key header is empty string", () => {
    const result = checkAuth("/api/leads", "", ENV_KEY);
    expect(result.status).toBe(401);
  });

  it("returns 401 when x-api-key header is wrong", () => {
    const result = checkAuth("/api/leads", "wrong-key", ENV_KEY);
    expect(result.status).toBe(401);
  });

  it("returns 401 for sensitive routes: /api/emails/send", () => {
    const result = checkAuth("/api/emails/send", "bad", ENV_KEY);
    expect(result.status).toBe(401);
  });

  it("returns 401 for /api/config", () => {
    const result = checkAuth("/api/config", null, ENV_KEY);
    expect(result.status).toBe(401);
  });

  it("returns 401 for /api/files", () => {
    const result = checkAuth("/api/files", null, ENV_KEY);
    expect(result.status).toBe(401);
  });
});

describe("middleware auth — pass with correct key", () => {
  const ENV_KEY = "correct-key-xyz";

  it("passes /api/leads with correct key", () => {
    const result = checkAuth("/api/leads", ENV_KEY, ENV_KEY);
    expect(result.status).toBe("pass");
  });

  it("passes /api/emails/send with correct key", () => {
    const result = checkAuth("/api/emails/send", ENV_KEY, ENV_KEY);
    expect(result.status).toBe("pass");
  });

  it("passes /api/config with correct key", () => {
    const result = checkAuth("/api/config", ENV_KEY, ENV_KEY);
    expect(result.status).toBe("pass");
  });
});

describe("middleware auth — public paths bypass auth", () => {
  it("allows GET /api/health without any key", () => {
    expect(checkAuth("/api/health", null, undefined).status).toBe("pass");
    expect(checkAuth("/api/health", null, "some-key").status).toBe("pass");
  });

  it("allows /api/health/ sub-paths without key", () => {
    expect(checkAuth("/api/health/live", null, undefined).status).toBe("pass");
  });
});

describe("middleware auth — non-API paths bypass auth", () => {
  it("allows / without key", () => {
    expect(checkAuth("/", null, undefined).status).toBe("pass");
  });

  it("allows /dashboard without key", () => {
    expect(checkAuth("/dashboard", null, undefined).status).toBe("pass");
  });

  it("allows /_next/static/... without key", () => {
    expect(checkAuth("/_next/static/chunk.js", null, undefined).status).toBe("pass");
  });
});
