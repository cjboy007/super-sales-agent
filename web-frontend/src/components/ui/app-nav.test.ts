import { describe, expect, it } from "vitest";
import { APP_NAV_ITEMS } from "./app-nav";

describe("global app navigation", () => {
  it("keeps onboarding out of the interface nav", () => {
    expect(APP_NAV_ITEMS.map((item) => item.href)).not.toContain("/jadenos/onboarding");
  });

  it("labels the email workspace as outreach in Chinese", () => {
    expect(APP_NAV_ITEMS.find((item) => item.href === "/emails")).toMatchObject({
      label: "Outreach",
      zhLabel: "开发信",
    });
  });
});
