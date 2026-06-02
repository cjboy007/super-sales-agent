import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function blockFor(selector: string) {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1];
}

function tokenValue(block: string, token: string) {
  const match = block.match(new RegExp(`${token}:\\s*([0-9.]+)px`));
  if (!match) throw new Error(`Missing token ${token}`);
  return Number(match[1]);
}

describe("UI size tokens", () => {
  test("large mode makes text and controls materially larger", () => {
    const root = blockFor(":root");
    const large = blockFor('html[data-ui-size="large"]');

    expect(tokenValue(large, "--ui-font-13")).toBeGreaterThanOrEqual(tokenValue(root, "--ui-font-13") + 3);
    expect(tokenValue(large, "--ui-font-sm")).toBeGreaterThanOrEqual(tokenValue(root, "--ui-font-sm") + 3);
    expect(tokenValue(large, "--ui-button-height")).toBeGreaterThanOrEqual(tokenValue(root, "--ui-button-height") + 10);
    expect(tokenValue(large, "--ui-control-height")).toBeGreaterThanOrEqual(tokenValue(root, "--ui-control-height") + 10);
  });

  test("large mode has dedicated title and panel scale tokens", () => {
    const root = blockFor(":root");
    const large = blockFor('html[data-ui-size="large"]');

    expect(tokenValue(large, "--ui-page-title")).toBeGreaterThan(tokenValue(root, "--ui-page-title"));
    expect(tokenValue(large, "--ui-panel-title")).toBeGreaterThan(tokenValue(root, "--ui-panel-title"));
    expect(tokenValue(large, "--ui-section-title")).toBeGreaterThan(tokenValue(root, "--ui-section-title"));
    expect(tokenValue(large, "--ui-topbar-height")).toBeGreaterThan(tokenValue(root, "--ui-topbar-height"));
    expect(tokenValue(large, "--ui-panel-header-height")).toBeGreaterThan(tokenValue(root, "--ui-panel-header-height"));
    expect(tokenValue(large, "--ui-section-header-height")).toBeGreaterThan(tokenValue(root, "--ui-section-header-height"));
  });
});
