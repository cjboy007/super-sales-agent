import { describe, expect, it } from "vitest";

describe("/api/health route", () => {
  it("returns an ok health payload", async () => {
    const { GET } = await import("./route");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.status).toBe("ok");
    expect(new Date(json.timestamp).toString()).not.toBe("Invalid Date");
  });
});
