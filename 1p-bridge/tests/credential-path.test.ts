import { describe, it, expect } from "vitest";
import { parseCredentialPath } from "../src/lib/credential-path.js";

describe("parseCredentialPath", () => {
  it("parses a 3-segment path", () => {
    expect(parseCredentialPath("infrastructure/cloudflare/api_key")).toEqual({
      vault: "infrastructure",
      item: "cloudflare",
      field: "api_key",
    });
  });

  it("parses a 2-segment path with field defaulted to credential", () => {
    expect(parseCredentialPath("services/chittyconnect")).toEqual({
      vault: "services",
      item: "chittyconnect",
      field: "credential",
    });
  });

  it("rejects empty string", () => {
    expect(() => parseCredentialPath("")).toThrow(/empty/i);
  });

  it("rejects 1-segment path", () => {
    expect(() => parseCredentialPath("justavault")).toThrow(/format/i);
  });

  it("rejects 4+ segment path", () => {
    expect(() => parseCredentialPath("a/b/c/d")).toThrow(/format/i);
  });

  it("rejects whitespace-only segments", () => {
    expect(() => parseCredentialPath("a/ /c")).toThrow(/segment/i);
  });
});
