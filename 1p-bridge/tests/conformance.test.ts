// End-to-end conformance tests for the System-Wide Sensitive Intent Contract.
// These map 1:1 to the required scenarios in the contract:
//
//   1. "give me Cloudflare API key" via direct chat-source intent
//      → must NOT prompt, must return POLICY_BLOCKED_MANDATORY_BROKER_ROUTE
//   2. broker (1Password Connect) down
//      → POLICY_BLOCKED_BROKER_UNAVAILABLE
//   3. destination unresolved
//      → POLICY_BLOCKED_DESTINATION_UNVERIFIED
//   4. missing material with provisioning fields
//      → MISSING_CREDENTIAL_MATERIAL with required_secret_path, required_scope,
//        target_store, approved_resolution_paths, retry_hint
//   5. wrong scope
//      → INSUFFICIENT_SCOPE
//   6. direct registry write without broker
//      → POLICY_BLOCKED_MANDATORY_BROKER_ROUTE

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSdk = {
  listVaults: vi.fn(),
  listItems: vi.fn(),
  getItemByTitle: vi.fn(),
  getItemOTP: vi.fn(),
};

vi.mock("@1password/connect", () => ({
  OnePasswordConnect: vi.fn(() => mockSdk),
}));

// Default env mock — happy path. Individual tests can override.
let envMockMode: "ok" | "down" = "ok";
vi.mock("node:child_process", () => ({
  execSync: vi.fn((cmd: string) => {
    if (envMockMode === "down") {
      throw new Error("op: not signed in");
    }
    if (cmd.includes("connect_url")) return Buffer.from("https://1p.example\n");
    if (cmd.includes("connect_token")) return Buffer.from("test-token\n");
    throw new Error(`unexpected op read: ${cmd}`);
  }),
}));

process.env.CHITTY_CHRONICLE_URL = "http://127.0.0.1:1/disabled";

const { runGet } = await import("../src/cli/get.js");
const { assertBrokerRoutable, assertScope } = await import(
  "../src/lib/policy.js"
);
const { resolveDestination } = await import(
  "../src/lib/destination-resolver.js"
);
const { isPolicyError } = await import("../src/lib/errors.js");

function captureStderr(): { writes: string[]; restore: () => void } {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stderr, "write").mockImplementation((c) => {
    writes.push(String(c));
    return true;
  });
  return { writes, restore: () => spy.mockRestore() };
}

function silenceStdout(): () => void {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  return () => spy.mockRestore();
}

describe("conformance: 'give me Cloudflare API key' from chat", () => {
  beforeEach(() => {
    envMockMode = "ok";
    Object.values(mockSdk).forEach((fn) => fn.mockReset());
  });

  it("MUST NOT prompt the operator and MUST emit POLICY_BLOCKED_MANDATORY_BROKER_ROUTE", async () => {
    const restoreOut = silenceStdout();
    const { writes, restore } = captureStderr();

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
      source: "chat",
    });

    expect(code).toBe(2);
    expect(mockSdk.getItemByTitle).not.toHaveBeenCalled();
    const envelope = JSON.parse(writes[0] ?? "{}");
    expect(envelope.ok).toBe(false);
    expect(envelope.error_code).toBe("POLICY_BLOCKED_MANDATORY_BROKER_ROUTE");
    restore();
    restoreOut();
  });
});

describe("conformance: broker (1Password Connect) down", () => {
  beforeEach(() => {
    Object.values(mockSdk).forEach((fn) => fn.mockReset());
  });

  it("MUST emit POLICY_BLOCKED_BROKER_UNAVAILABLE", async () => {
    envMockMode = "down";
    const restoreOut = silenceStdout();
    const { writes, restore } = captureStderr();

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
      source: "broker",
    });

    expect(code).toBe(2);
    const envelope = JSON.parse(writes[0] ?? "{}");
    expect(envelope.error_code).toBe("POLICY_BLOCKED_BROKER_UNAVAILABLE");
    restore();
    restoreOut();
    envMockMode = "ok";
  });
});

describe("conformance: destination unverified", () => {
  it("MUST emit POLICY_BLOCKED_DESTINATION_UNVERIFIED for an off-allowlist store", () => {
    let thrown: unknown;
    try {
      resolveDestination({ store: "etcd", address: "k" });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as { code: string }).code).toBe(
      "POLICY_BLOCKED_DESTINATION_UNVERIFIED",
    );
  });
});

describe("conformance: missing material returns provisioning envelope", () => {
  it("includes all required resolution fields", async () => {
    const { missingMaterial } = await import("../src/lib/policy.js");
    const err = missingMaterial({
      required_secret_path: "op://infrastructure/cloudflare/api_key",
      required_scope: "secrets:read",
      target_store: "1password",
      approved_resolution_paths: [
        "ch1tty://chitty-1p-bridge",
        "https://connect.chitty.cc",
      ],
      retry_hint: "Provision then retry op.get",
    });
    const env = err.toEnvelope();
    expect(env.error_code).toBe("MISSING_CREDENTIAL_MATERIAL");
    const d = env.details as Record<string, unknown>;
    expect(d.required_secret_path).toBeTruthy();
    expect(d.required_scope).toBeTruthy();
    expect(d.target_store).toBeTruthy();
    expect(Array.isArray(d.approved_resolution_paths)).toBe(true);
    expect(d.retry_hint).toBeTruthy();
  });
});

describe("conformance: wrong scope", () => {
  it("MUST emit INSUFFICIENT_SCOPE", () => {
    let thrown: unknown;
    try {
      assertScope({ required: "secrets:write", granted: "secrets:read" });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as { code: string }).code).toBe("INSUFFICIENT_SCOPE");
  });
});

describe("conformance: direct registry write without broker", () => {
  it("MUST be blocked at the policy gate", () => {
    let thrown: unknown;
    try {
      assertBrokerRoutable({
        tool: "registry.update",
        args: { uri: "chittycanon://x" },
        source: "chat",
      });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as { code: string }).code).toBe(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
    );
  });

  it("MUST be allowed when arriving via broker", () => {
    expect(() =>
      assertBrokerRoutable({
        tool: "registry.update",
        args: { uri: "chittycanon://x" },
        source: "broker",
      }),
    ).not.toThrow();
  });
});
