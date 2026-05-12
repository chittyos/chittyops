import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock only external boundaries: the op CLI subprocess (used by env.ts)
// and the @1password/connect SDK (used by op-client.ts). Internal modules
// (env, op-client, chronicle, get/list/otp) execute real code paths.
const mockSdk = {
  listVaults: vi.fn(),
  listItems: vi.fn(),
  getItemByTitle: vi.fn(),
  getItemOTP: vi.fn(),
};

vi.mock("@1password/connect", () => ({
  OnePasswordConnect: vi.fn(() => mockSdk),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes("connect_url")) return Buffer.from("https://1p.example\n");
    if (cmd.includes("connect_token")) return Buffer.from("test-token\n");
    throw new Error(`unexpected op read: ${cmd}`);
  }),
}));

// Point chronicle at an unreachable URL so audit POSTs fail fast and
// surface via stderr without contacting a real endpoint. Logs are
// best-effort and must never crash the caller.
process.env.CHITTY_CHRONICLE_URL = "http://127.0.0.1:1/disabled";

const { runGet } = await import("../src/cli/get.js");
const { runList } = await import("../src/cli/list.js");
const { runOtp } = await import("../src/cli/otp.js");

function captureStdout(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
    writes.push(String(c));
    return true;
  });
  return { writes, restore: () => spy.mockRestore() };
}

function silenceStderr(): () => void {
  const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  return () => spy.mockRestore();
}

describe("runGet", () => {
  beforeEach(() => Object.values(mockSdk).forEach((fn) => fn.mockReset()));

  it("prints field value to stdout on success", async () => {
    mockSdk.getItemByTitle.mockResolvedValue({
      id: "i1",
      title: "cloudflare",
      fields: [{ id: "f1", label: "api_key", value: "secret-value" }],
    });
    const { writes, restore } = captureStdout();
    const restoreErr = silenceStderr();

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
    });

    expect(code).toBe(0);
    expect(writes.join("")).toBe("secret-value\n");
    restore();
    restoreErr();
  });

  it("returns exit code 1, scrubs token-shaped strings from envelope, never logs raw provider message", async () => {
    // SDK error message contains a token-shaped string that must NOT leak.
    mockSdk.getItemByTitle.mockRejectedValue(
      new Error(
        "https://1p.example?token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyZWFsIn0.realsecretsigvalue failed",
      ),
    );
    const restoreOut = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderrCaptured: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((c) => {
      stderrCaptured.push(String(c));
      return true;
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
      source: "cli",
    });

    // Provider failure (not policy) → exit 1.
    expect(code).toBe(1);

    // Stderr envelope is canonical and scrubbed.
    const stderrJoined = stderrCaptured.join("");
    expect(stderrJoined).toContain('"ok":false');
    expect(stderrJoined).toContain("EXECUTION_FAILED_PROVIDER_ERROR");
    expect(stderrJoined).not.toContain("realsecretsigvalue");

    // Chronicle audit was attempted with error_code only — body must not
    // include the raw SDK message (which contained a token-shaped substring).
    expect(fetchSpy).toHaveBeenCalled();
    const body = String(fetchSpy.mock.calls[0]![1]!.body);
    expect(body).toContain("error_code");
    expect(body).toContain('"ok":false');
    expect(body).not.toContain("realsecretsigvalue");

    restoreOut.mockRestore();
    fetchSpy.mockRestore();
  });
});

describe("runList", () => {
  beforeEach(() => Object.values(mockSdk).forEach((fn) => fn.mockReset()));

  it("lists vaults when no arg provided", async () => {
    mockSdk.listVaults.mockResolvedValue([
      { id: "v1", name: "infrastructure" },
      { id: "v2", name: "services" },
    ]);
    const { writes, restore } = captureStdout();
    const restoreErr = silenceStderr();

    const code = await runList(undefined, { actor: "ubuntu" });

    expect(code).toBe(0);
    expect(writes.join("")).toContain("infrastructure");
    expect(writes.join("")).toContain("services");
    restore();
    restoreErr();
  });

  it("lists items when vault arg provided", async () => {
    mockSdk.listItems.mockResolvedValue([{ id: "i1", title: "cloudflare" }]);
    const { writes, restore } = captureStdout();
    const restoreErr = silenceStderr();

    const code = await runList("infrastructure", { actor: "ubuntu" });

    expect(code).toBe(0);
    expect(mockSdk.listItems).toHaveBeenCalledWith("infrastructure");
    expect(writes.join("")).toContain("cloudflare");
    restore();
    restoreErr();
  });

  it("logs failure with error_code on listItems error", async () => {
    mockSdk.listItems.mockRejectedValue(new Error("boom"));
    silenceStderr();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 200 }));

    const code = await runList("infrastructure", { actor: "ubuntu", source: "cli" });

    expect(code).toBe(1);
    expect(fetchSpy).toHaveBeenCalled();
    const body = String(fetchSpy.mock.calls[0]![1]!.body);
    expect(body).toContain("error_code");
    fetchSpy.mockRestore();
  });
});

describe("runOtp", () => {
  beforeEach(() => Object.values(mockSdk).forEach((fn) => fn.mockReset()));

  it("prints OTP for vault/item", async () => {
    mockSdk.getItemOTP.mockResolvedValue("654321");
    const { writes, restore } = captureStdout();
    const restoreErr = silenceStderr();

    const code = await runOtp("services/github", { actor: "ubuntu" });

    expect(code).toBe(0);
    expect(mockSdk.getItemOTP).toHaveBeenCalledWith("services", "github");
    expect(writes.join("")).toBe("654321\n");
    restore();
    restoreErr();
  });

  it("rejects 3-segment path (otp does not take field)", async () => {
    silenceStderr();
    const code = await runOtp("a/b/c", { actor: "ubuntu" });
    expect(code).toBe(1);
  });

  it("fails when SDK returns empty OTP", async () => {
    mockSdk.getItemOTP.mockResolvedValue("");
    silenceStderr();
    const code = await runOtp("services/github", { actor: "ubuntu" });
    expect(code).toBe(1);
  });
});
