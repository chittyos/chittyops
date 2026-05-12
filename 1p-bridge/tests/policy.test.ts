import { describe, it, expect } from "vitest";
import {
  classifyIntent,
  assertBrokerRoutable,
  assertNoDirectSecretPrompt,
  assertScope,
  brokerUnavailable,
  missingMaterial,
} from "../src/lib/policy.js";
import { isPolicyError, PolicyError } from "../src/lib/errors.js";

describe("classifyIntent", () => {
  it("flags op.* tools as sensitive", () => {
    const v = classifyIntent({ tool: "op.get", args: { path: "v/i/f" } });
    expect(v.sensitive).toBe(true);
    expect(v.category).toBe("credential_read");
  });

  it("flags cf.* / cloudflare.* tools as sensitive", () => {
    expect(classifyIntent({ tool: "cf.deploy" }).sensitive).toBe(true);
    expect(classifyIntent({ tool: "cloudflare.secrets.put" }).sensitive).toBe(true);
  });

  it("flags args carrying credential-shaped keys as sensitive", () => {
    const v = classifyIntent({
      tool: "registry.read",
      args: { api_key: "ops_realtokenshape_long" },
    });
    expect(v.sensitive).toBe(true);
    expect(v.reasons.join(" ")).toMatch(/sensitive keyword/);
  });

  it("does not flag non-sensitive registry reads", () => {
    expect(classifyIntent({ tool: "registry.read" }).sensitive).toBe(false);
  });

  it("flags registry write surfaces", () => {
    const v = classifyIntent({ tool: "registry.update", args: {} });
    expect(v.sensitive).toBe(true);
    expect(v.category).toBe("registry_write");
  });

  it("flags rotate.* and deploy.* surfaces", () => {
    expect(classifyIntent({ tool: "rotate.cf-token" }).category).toBe(
      "credential_rotate",
    );
    expect(classifyIntent({ tool: "deploy.worker" }).category).toBe("deploy");
  });
});

describe("assertBrokerRoutable", () => {
  it("blocks sensitive intent arriving from chat", () => {
    let thrown: unknown;
    try {
      assertBrokerRoutable({
        tool: "op.get",
        args: { path: "v/i/f" },
        source: "chat",
      });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as PolicyError).code).toBe(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
    );
  });

  it("allows sensitive intent via broker source", () => {
    expect(() =>
      assertBrokerRoutable({
        tool: "op.get",
        args: { path: "v/i/f" },
        source: "broker",
      }),
    ).not.toThrow();
  });

  it("allows sensitive intent via cli source", () => {
    expect(() =>
      assertBrokerRoutable({
        tool: "op.get",
        args: { path: "v/i/f" },
        source: "cli",
      }),
    ).not.toThrow();
  });

  it("treats undefined source as chat (fail closed)", () => {
    let thrown: unknown;
    try {
      assertBrokerRoutable({ tool: "op.get", args: { path: "v/i/f" } });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as PolicyError).code).toBe(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
    );
  });

  it("passes through non-sensitive intents", () => {
    expect(() =>
      assertBrokerRoutable({
        tool: "registry.read",
        args: {},
        source: "chat",
      }),
    ).not.toThrow();
  });
});

describe("assertNoDirectSecretPrompt", () => {
  it("blocks chat-layer credential-shaped paste", () => {
    let thrown: unknown;
    try {
      assertNoDirectSecretPrompt({
        tool: "op.write",
        args: {
          api_key: "ops_VeryLongRealisticCredentialShapedString_abc123",
        },
        source: "chat",
      });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as PolicyError).code).toBe(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
    );
  });

  it("allows short references (broker paths, not credentials)", () => {
    expect(() =>
      assertNoDirectSecretPrompt({
        tool: "op.get",
        args: { api_key: "op://v/i/f" },
        source: "chat",
      }),
    ).not.toThrow();
  });

  it("ignores broker-source intents", () => {
    expect(() =>
      assertNoDirectSecretPrompt({
        tool: "op.get",
        args: { token: "ops_VeryLongRealisticCredentialShapedString_abc123" },
        source: "broker",
      }),
    ).not.toThrow();
  });
});

describe("assertScope", () => {
  it("rejects when no scope granted", () => {
    let thrown: unknown;
    try {
      assertScope({ required: "secrets:read" });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as PolicyError).code).toBe("INSUFFICIENT_SCOPE");
  });

  it("rejects when granted scope set lacks the required token", () => {
    let thrown: unknown;
    try {
      assertScope({ required: "secrets:write", granted: "secrets:read" });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as PolicyError).code).toBe("INSUFFICIENT_SCOPE");
  });

  it("accepts when required scope is in the granted set", () => {
    expect(() =>
      assertScope({
        required: "secrets:write",
        granted: "secrets:read secrets:write",
      }),
    ).not.toThrow();
  });

  it("accepts wildcard scope", () => {
    expect(() =>
      assertScope({ required: "secrets:write", granted: "*" }),
    ).not.toThrow();
  });
});

describe("brokerUnavailable", () => {
  it("uses ChittyConnect-specific code for chittyconnect target", () => {
    expect(brokerUnavailable("chittyconnect", "down").code).toBe(
      "POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE",
    );
    expect(brokerUnavailable("https://connect.chitty.cc", "timeout").code).toBe(
      "POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE",
    );
  });

  it("uses generic broker code for other targets", () => {
    expect(brokerUnavailable("1password-connect", "down").code).toBe(
      "POLICY_BLOCKED_BROKER_UNAVAILABLE",
    );
  });
});

describe("missingMaterial", () => {
  it("emits MISSING_CREDENTIAL_MATERIAL with all required provisioning fields", () => {
    const err = missingMaterial({
      required_secret_path: "op://infrastructure/cloudflare/api_key",
      required_scope: "secrets:read",
      target_store: "1password",
      approved_resolution_paths: [
        "ch1tty://chitty-1p-bridge",
        "https://connect.chitty.cc",
      ],
      retry_hint: "Provision via ChittyConnect, then retry",
    });
    expect(err.code).toBe("MISSING_CREDENTIAL_MATERIAL");
    const env = err.toEnvelope();
    expect(env.details).toMatchObject({
      required_secret_path: "op://infrastructure/cloudflare/api_key",
      required_scope: "secrets:read",
      target_store: "1password",
      approved_resolution_paths: expect.any(Array),
      retry_hint: expect.any(String),
    });
  });
});
