// Leak-containment override. Runs before ANY persistence/transmission of
// envelopes to chronicle, registry, or stdout-as-stderr. Catches:
//   - raw provider error strings that contain credential-shaped substrings
//   - URL-embedded tokens (?token=, ?key=, Authorization headers in messages)
//   - Bearer/Basic auth headers in serialized data
//
// Replaces matches with a fixed redaction marker before the value reaches
// any sink. Belt-and-braces with chronicle.redactSensitive — that one is
// key-name-based; this one is value-shape-based.

const TOKEN_SHAPED_PATTERNS: RegExp[] = [
  // JWT (header.payload.sig)
  /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g,
  // Generic high-entropy 1Password / CF / GitHub token shape
  /\b(ops_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|sk-|cf-)[A-Za-z0-9_-]{16,}\b/g,
  // Authorization header substrings
  /\b(Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{12,}/g,
  // URL-embedded credentials
  /(\?|&)(token|key|secret|password|access_token|api_key)=[^&\s"']+/gi,
  // 1Password Connect token shape (long base64-ish blob)
  /\b[A-Za-z0-9+/=]{60,}\b/g,
];

const REDACTION = "[REDACTED]";

export function scrubString(input: string): string {
  let out = input;
  for (const pat of TOKEN_SHAPED_PATTERNS) {
    out = out.replace(pat, REDACTION);
  }
  return out;
}

// Recursively scrub any string-valued field in an arbitrary payload.
// Object keys are NOT scrubbed (they are schema, not values). Array
// elements ARE scrubbed in place.
export function scrubPayload<T>(payload: T): T {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload === "string") return scrubString(payload) as unknown as T;
  if (Array.isArray(payload)) {
    return payload.map((item) => scrubPayload(item)) as unknown as T;
  }
  if (typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
      out[k] = scrubPayload(v);
    }
    return out as T;
  }
  return payload;
}
