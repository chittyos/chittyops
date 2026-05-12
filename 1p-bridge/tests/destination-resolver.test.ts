import { describe, it, expect } from "vitest";
import { resolveDestination } from "../src/lib/destination-resolver.js";
import { isPolicyError, PolicyError } from "../src/lib/errors.js";

describe("resolveDestination", () => {
  it("resolves a valid 1Password destination", () => {
    const r = resolveDestination({
      store: "1password",
      address: "infrastructure/cloudflare/api_key",
    });
    expect(r.verified).toBe(true);
    expect(r.store).toBe("1password");
  });

  it("rejects an unknown store", () => {
    let thrown: unknown;
    try {
      resolveDestination({ store: "redis", address: "k1" });
    } catch (e) {
      thrown = e;
    }
    expect(isPolicyError(thrown)).toBe(true);
    expect((thrown as PolicyError).code).toBe(
      "POLICY_BLOCKED_DESTINATION_UNVERIFIED",
    );
  });

  it("rejects malformed CF Secrets Store address", () => {
    let thrown: unknown;
    try {
      resolveDestination({
        store: "cloudflare-secrets-store",
        address: "not-an-account-id/store/key",
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as PolicyError).code).toBe("POLICY_BLOCKED_DESTINATION_UNVERIFIED");
  });

  it("accepts a well-formed CF Secrets Store address", () => {
    const r = resolveDestination({
      store: "cloudflare-secrets-store",
      address: "0bc21e3a5a9de1a4cc843be9c3e98121/chittyconnect/CF_TOKEN",
    });
    expect(r.verified).toBe(true);
  });

  it("rejects non-canonical chittyregistry address", () => {
    let thrown: unknown;
    try {
      resolveDestination({
        store: "chittyregistry",
        address: "https://registry.chitty.cc/services/x",
      });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as PolicyError).code).toBe("POLICY_BLOCKED_DESTINATION_UNVERIFIED");
  });

  it("accepts canonical chittyregistry URI", () => {
    const r = resolveDestination({
      store: "chittyregistry",
      address: "chittycanon://chittyos/services/chittyops",
    });
    expect(r.verified).toBe(true);
  });
});
