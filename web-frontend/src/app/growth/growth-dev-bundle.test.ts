import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../../next.config.js");

describe("lead development dev bundle", () => {
  it("does not use eval-based source maps for client dev chunks", () => {
    expect(typeof nextConfig.webpack).toBe("function");

    const result = nextConfig.webpack(
      { devtool: "eval-source-map" },
      { dev: true, isServer: false }
    );

    expect(result.devtool).toBe(false);
  });
});
