import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logEvent, redactSensitive } from "../src/lib/chronicle.js";

const originalFetch = globalThis.fetch;

describe("redactSensitive", () => {
  it("redacts password/token/secret/key/credential/otp keys", () => {
    const out = redactSensitive({
      path: "infrastructure/cf/api_key",
      password: "hunter2",
      token: "ops_abc",
      something_secret: "shh",
      ApiKey: "abc",
      credential: "x",
      otp: "123456",
      benign: "hello",
    });
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.something_secret).toBe("[REDACTED]");
    expect(out.ApiKey).toBe("[REDACTED]");
    expect(out.credential).toBe("[REDACTED]");
    expect(out.otp).toBe("[REDACTED]");
    expect(out.benign).toBe("hello");
    expect(out.path).toBe("infrastructure/cf/api_key");
  });

  it("is non-recursive on nested objects (top-level only)", () => {
    const out = redactSensitive({ outer: { token: "secret" } });
    expect((out.outer as { token: string }).token).toBe("secret");
  });
});

describe("logEvent", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts event with redacted payload", async () => {
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.get",
      actor: "ubuntu",
      data: { path: "infrastructure/cf/api_key", token: "ops_abc" },
    });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.data.path).toBe("infrastructure/cf/api_key");
    expect(body.data.token).toBe("[REDACTED]");
  });

  it("never throws when chronicle is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ENETDOWN"));
    await expect(
      logEvent({ service: "x", event: "y", actor: "z", data: {} }),
    ).resolves.toBeUndefined();
  });
});
