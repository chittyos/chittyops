/**
 * Crypto helpers for daily-comms-triage worker.
 * Web Crypto API only — runs unmodified on Cloudflare Workers + V8 isolates.
 */

export async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function compositeHash(parts: ReadonlyArray<string | undefined | null>): Promise<string> {
  const joined = parts.map((p) => (p ?? "").trim().toLowerCase()).join("\x1f");
  return sha256(joined);
}
