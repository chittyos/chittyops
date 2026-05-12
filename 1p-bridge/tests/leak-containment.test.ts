import { describe, it, expect } from "vitest";
import { scrubString, scrubPayload } from "../src/lib/leak-containment.js";

describe("scrubString", () => {
  it("redacts JWT-shaped tokens", () => {
    const input =
      "auth failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eHh4In0.ABCDEFGHIJKL";
    const out = scrubString(input);
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts ops_/ghp_/gho_ prefixed tokens", () => {
    expect(scrubString("ops_AbCdEfGhIjKlMnOpQrSt")).toContain("[REDACTED]");
    expect(scrubString("ghp_RealisticGitHubTokenAbcdefg123")).toContain(
      "[REDACTED]",
    );
  });

  it("redacts URL-embedded credentials", () => {
    const url = "https://example.com/api?token=abcdef123456&other=ok";
    const out = scrubString(url);
    expect(out).not.toContain("abcdef123456");
    expect(out).toContain("[REDACTED]");
    expect(out).toContain("other=ok");
  });

  it("leaves benign strings unchanged", () => {
    expect(scrubString("vault/item/field")).toBe("vault/item/field");
  });
});

describe("scrubPayload", () => {
  it("recursively scrubs nested objects", () => {
    const payload = {
      ok: false,
      error_code: "EXECUTION_FAILED_PROVIDER_ERROR",
      details: {
        message:
          "fetch failed for https://api.cloudflare.com/x?api_key=hunter2longvalue&q=z",
        nested: { inner: "Bearer ghp_abcdef0123456789xyz" },
      },
    };
    const out = scrubPayload(payload);
    const json = JSON.stringify(out);
    expect(json).not.toContain("hunter2longvalue");
    expect(json).not.toContain("ghp_abcdef0123456789xyz");
    expect(out.ok).toBe(false);
    expect(out.error_code).toBe("EXECUTION_FAILED_PROVIDER_ERROR");
  });

  it("scrubs arrays element-by-element", () => {
    const out = scrubPayload([
      "ok",
      "Bearer ghp_realistic_credential_token_xyz123",
    ]);
    expect(out[0]).toBe("ok");
    expect(out[1]).toContain("[REDACTED]");
  });

  it("preserves null/undefined", () => {
    expect(scrubPayload(null)).toBe(null);
    expect(scrubPayload(undefined)).toBe(undefined);
  });
});
