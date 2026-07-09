import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });
}

describe("open middleware", () => {
  it("does not redirect app pages", () => {
    const response = middleware(request("/leads"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not use browser cookies as a page gate", () => {
    const response = middleware(request("/settings", "workspace=farreach"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
