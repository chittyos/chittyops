import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";
import { loadBridgeEnv } from "../src/lib/env.js";

vi.mock("node:child_process");

describe("loadBridgeEnv", () => {
  beforeEach(() => vi.resetAllMocks());

  it("resolves both tokens via op read", () => {
    const execSync = vi.spyOn(childProcess, "execSync");
    execSync.mockImplementation((cmd) => {
      if (String(cmd).includes("connect_url")) return Buffer.from("https://1p.local:8443\n");
      if (String(cmd).includes("connect_token")) return Buffer.from("ops_abc\n");
      throw new Error("unexpected command: " + cmd);
    });

    expect(loadBridgeEnv()).toEqual({
      onepasswordConnectUrl: "https://1p.local:8443",
      onepasswordConnectToken: "ops_abc",
    });
  });

  it("throws if op CLI errors", () => {
    vi.spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("op: command not found");
    });
    expect(() => loadBridgeEnv()).toThrow(/1Password|op CLI/);
  });

  it("throws if op returns empty value", () => {
    vi.spyOn(childProcess, "execSync").mockReturnValue(Buffer.from("\n"));
    expect(() => loadBridgeEnv()).toThrow(/empty/i);
  });
});
