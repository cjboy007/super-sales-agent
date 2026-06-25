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

function declarationValue(block: string, property: string) {
  const match = block.match(new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*([^;]+);`));
  if (!match) throw new Error(`Missing declaration ${property}`);
  return match[1].trim();
}

function blockContaining(...selectors: string[]) {
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const block = blocks.find((match) => selectors.every((selector) => match[1].includes(selector)));
  if (!block) throw new Error(`Missing CSS block containing ${selectors.join(", ")}`);
  return block[2];
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

describe("light theme palette", () => {
  test("uses the previous warm workspace colors", () => {
    const light = blockFor('html[data-theme="light"]');
    const lightBody = blockFor('html[data-theme="light"] body');

    expect(declarationValue(light, "--background")).toBe("#e7ecf3");
    expect(declarationValue(light, "--foreground")).toBe("#182235");
    expect(declarationValue(light, "--card-bg")).toBe("#f8fafc");
    expect(declarationValue(light, "--border-color")).toBe("#a8b4c4");
    expect(declarationValue(light, "--accent")).toBe("#a44912");
    expect(declarationValue(light, "--accent-hover")).toBe("#7c2d12");
    expect(declarationValue(light, "--success")).toBe("#a44912");
    expect(declarationValue(light, "--warning")).toBe("#a44912");
    expect(declarationValue(light, "--danger")).toBe("#b91c1c");
    expect(declarationValue(lightBody, "color")).toBe("#182235");
    expect(declarationValue(lightBody, "background")).toBe("#e7ecf3");
  });

  test("keeps non-danger status hues on the single warm accent", () => {
    const statusText = blockContaining(
      'html[data-theme="light"] .text-emerald-100',
      'html[data-theme="light"] .text-blue-500',
      'html[data-theme="light"] .text-rose-500'
    );
    const panelHeaders = blockContaining(
      'html[data-theme="light"] .battle-panel-header[data-panel-tone="emerald"]',
      'html[data-theme="light"] .battle-panel-header[data-panel-tone="neutral"]'
    );
    const solidStatusBackgrounds = blockContaining(
      'html[data-theme="light"] .bg-emerald-400',
      'html[data-theme="light"] .bg-rose-600'
    );

    expect(declarationValue(statusText, "color")).toBe("#7c2d12 !important");
    expect(declarationValue(panelHeaders, "background-image")).toBe("linear-gradient(90deg, #7c2d12, #a44912) !important");
    expect(declarationValue(panelHeaders, "border-color")).toBe("rgb(124 45 18 / 0.72) !important");
    expect(declarationValue(solidStatusBackgrounds, "background-color")).toBe("#a44912 !important");
  });
});
