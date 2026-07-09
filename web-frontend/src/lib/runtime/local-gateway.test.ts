import fs from "fs";
import path from "path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(tmpdir(), "ssa-local-gateway-test-"));
  process.env = { ...ORIGINAL_ENV, SSA_DATA_ROOT: tempRoot };
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("node:os");
  process.env = { ...ORIGINAL_ENV };
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("local gateway LAN status", () => {
  it("defaults to local-only access without activation-token protection", async () => {
    delete process.env.SSA_BIND_HOST;
    delete process.env.SSA_PUBLIC_HOST;
    delete process.env.SSA_PUBLIC_PORT;
    process.env.SSA_LOCAL_GATEWAY = "true";

    const { getLocalGatewayStatus } = await import("./local-gateway-status");
    const status = getLocalGatewayStatus();

    expect(status).toMatchObject({
      accessMode: "local",
      bindHost: "127.0.0.1",
      publicHost: "127.0.0.1",
      port: "3001",
      tokenRequired: false,
      localUrl: "http://127.0.0.1:3001",
      lanUrl: null,
    });
    expect(status.warning).toContain("LAN");
  });

  it("reports LAN access when explicitly bound to all interfaces", async () => {
    process.env.SSA_LOCAL_GATEWAY = "true";
    process.env.SSA_BIND_HOST = "0.0.0.0";
    process.env.SSA_PUBLIC_HOST = "192.168.1.20";
    process.env.SSA_PUBLIC_PORT = "3100";

    const { getLocalGatewayStatus } = await import("./local-gateway-status");
    const status = getLocalGatewayStatus();

    expect(status).toMatchObject({
      accessMode: "lan",
      bindHost: "0.0.0.0",
      publicHost: "192.168.1.20",
      port: "3100",
      tokenRequired: false,
      localUrl: "http://127.0.0.1:3100",
      lanUrl: "http://192.168.1.20:3100",
    });
    expect(status.warning).toContain("public internet");
    expect(status.firewallHint).toContain("firewall");
  });

  it("auto-detects a LAN address when LAN mode has no public host override", async () => {
    process.env.SSA_LOCAL_GATEWAY = "true";
    process.env.SSA_GATEWAY_ACCESS_MODE = "lan";
    process.env.SSA_BIND_HOST = "0.0.0.0";
    process.env.SSA_PUBLIC_PORT = "3200";
    delete process.env.SSA_PUBLIC_HOST;

    vi.doMock("node:os", () => ({
      default: {
        homedir: () => path.dirname(tempRoot),
        networkInterfaces: () => ({
          lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
          en0: [{ family: "IPv4", address: "192.168.50.23", internal: false }],
          utun: [{ family: "IPv4", address: "169.254.10.4", internal: false }],
        }),
      },
      networkInterfaces: () => ({
        lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
        en0: [{ family: "IPv4", address: "192.168.50.23", internal: false }],
        utun: [{ family: "IPv4", address: "169.254.10.4", internal: false }],
      }),
    }));

    const { getLocalGatewayStatus } = await import("./local-gateway-status");
    const status = getLocalGatewayStatus();

    expect(status).toMatchObject({
      accessMode: "lan",
      bindHost: "0.0.0.0",
      publicHost: "192.168.50.23",
      lanUrl: "http://192.168.50.23:3200",
    });
  });
});
