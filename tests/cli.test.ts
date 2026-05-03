import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGet } from "../src/cli/get.js";
import * as opClient from "../src/lib/op-client.js";
import * as env from "../src/lib/env.js";
import * as chronicle from "../src/lib/chronicle.js";

describe("runGet", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prints field value to stdout and logs to chronicle", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const getField = vi.fn().mockResolvedValue("secret-value");
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ getField }) as unknown as opClient.OpClient,
    );
    const log = vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
    });

    expect(code).toBe(0);
    expect(getField).toHaveBeenCalledWith(
      "infrastructure",
      "cloudflare",
      "api_key",
    );
    expect(stdout).toHaveBeenCalledWith("secret-value\n");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "chitty-1p-bridge",
        event: "op.get",
        actor: "ubuntu",
      }),
    );
  });

  it("returns exit code 1 on error", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockImplementation(() => {
      throw new Error("op CLI not signed in");
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runGet("a/b/c", { actor: "ubuntu" });
    expect(code).toBe(1);
  });
});
import { runList } from "../src/cli/list.js";

describe("runList", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists vaults when no arg provided", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const listVaults = vi.fn().mockResolvedValue([
      { id: "v1", name: "infrastructure" },
      { id: "v2", name: "services" },
    ]);
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ listVaults }) as unknown as opClient.OpClient,
    );
    vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });

    const code = await runList(undefined, { actor: "ubuntu" });
    expect(code).toBe(0);
    expect(writes.join("")).toContain("infrastructure");
    expect(writes.join("")).toContain("services");
  });

  it("lists items when vault arg provided", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const listItems = vi.fn().mockResolvedValue([
      { id: "i1", title: "cloudflare" },
    ]);
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ listItems }) as unknown as opClient.OpClient,
    );
    vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });

    const code = await runList("infrastructure", { actor: "ubuntu" });
    expect(code).toBe(0);
    expect(listItems).toHaveBeenCalledWith("infrastructure");
    expect(writes.join("")).toContain("cloudflare");
  });
});
