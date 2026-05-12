// Sensitive-intent classifier + mandatory broker route guard.
//
// Authority model (binding):
//   - Authority layer: ChittyConnect / ChittyAuth / ChittyID / 1P-backed broker
//   - The human operator is OPERATOR ONLY — never a credential store, KVS,
//     auth provider, or routing authority.
//   - KV is cache/projection; never credential authority.
//
// Every sensitive intent must:
//   1. Be classified (no silent passthrough).
//   2. Route through the broker (this module enforces that gate).
//   3. Never request long-lived credential material from chat.
//   4. Fail closed with canonical error codes (see errors.ts).

import { PolicyError, type MissingMaterialDetails } from "./errors.js";

// Sensitive surfaces — keep aligned with global agent contract. The
// prefix list is the broad signal; categorize() is the precise classifier
// and may downgrade specific tools (e.g. registry.read) to non_sensitive.
const SENSITIVE_TOOL_PREFIXES = [
  "auth.",
  "cf.", // Cloudflare
  "cloudflare.",
  "dns.",
  "deploy.",
  "gh.", // GitHub
  "github.",
  "neon.",
  "op.", // 1Password broker
  "registry.",
  "rotate.",
  "secret.",
  "service.bind",
  "token.",
  "worker.",
] as const;

// Tools known to be public read-only surfaces. These are never sensitive
// regardless of prefix match.
const NON_SENSITIVE_EXACT = new Set<string>(["registry.read"]);

const SENSITIVE_KEYWORDS =
  /\b(api[_-]?key|secret|token|password|credential|bearer|service[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key)\b/i;

export type IntentCategory =
  | "credential_read"
  | "credential_write"
  | "credential_rotate"
  | "credential_list"
  | "registry_write"
  | "destination_bind"
  | "deploy"
  | "non_sensitive";

export interface IntentDescriptor {
  tool: string;
  args?: Record<string, unknown>;
  // The transport that delivered this intent. "chat" means an LLM passed
  // it through directly (e.g. an inline credential paste). "broker" means
  // it arrived via ChittyConnect / ch1tty handler. Anything else fails
  // closed in classifyIntent.
  source?: "chat" | "broker" | "cli" | "systemd" | "test";
  // Pre-resolved scope if the caller already negotiated one with ChittyAuth.
  scope?: string;
}

export interface ClassifiedIntent {
  sensitive: boolean;
  category: IntentCategory;
  reasons: string[];
}

function categorize(tool: string): IntentCategory {
  if (NON_SENSITIVE_EXACT.has(tool)) return "non_sensitive";
  if (tool.startsWith("op.get") || tool.startsWith("secret.get") || tool.startsWith("auth."))
    return "credential_read";
  if (tool.startsWith("op.list") || tool.startsWith("op.otp")) return "credential_list";
  if (tool.startsWith("rotate.") || tool === "secret.rotate") return "credential_rotate";
  if (
    tool === "secret.put" ||
    tool === "secret.create" ||
    tool === "op.write" ||
    tool === "op.create" ||
    /^cloudflare\.secrets?\./.test(tool) ||
    /^cf\.secrets?\./.test(tool) ||
    /\.token\./.test(tool) ||
    tool.startsWith("token.")
  )
    return "credential_write";
  if (tool.startsWith("registry.") && tool !== "registry.read") return "registry_write";
  if (tool.startsWith("service.bind") || tool === "worker.bind") return "destination_bind";
  if (tool.startsWith("deploy.") || tool === "worker.deploy" || /^cf\.deploy/.test(tool))
    return "deploy";
  // Any other cf./cloudflare./gh./github./neon./dns./worker. surface that
  // didn't match a more specific category is still sensitive — collapse to
  // credential_write (the strictest write-class) rather than non_sensitive.
  if (
    tool.startsWith("cf.") ||
    tool.startsWith("cloudflare.") ||
    tool.startsWith("gh.") ||
    tool.startsWith("github.") ||
    tool.startsWith("neon.") ||
    tool.startsWith("dns.") ||
    tool.startsWith("worker.")
  )
    return "credential_write";
  return "non_sensitive";
}

export function classifyIntent(intent: IntentDescriptor): ClassifiedIntent {
  const reasons: string[] = [];
  const tool = intent.tool ?? "";
  const category = categorize(tool);

  const prefixHit = SENSITIVE_TOOL_PREFIXES.find((p) => tool.startsWith(p));
  if (prefixHit && category !== "non_sensitive") {
    reasons.push(`tool prefix '${prefixHit}' is sensitive`);
  }

  let argsContributedSensitive = false;
  if (intent.args) {
    for (const [k, v] of Object.entries(intent.args)) {
      if (SENSITIVE_KEYWORDS.test(k)) {
        reasons.push(`arg key '${k}' matches sensitive keyword`);
        argsContributedSensitive = true;
      }
      if (typeof v === "string" && v.length > 16 && SENSITIVE_KEYWORDS.test(k)) {
        reasons.push(`arg '${k}' carries credential-shaped value`);
        argsContributedSensitive = true;
      }
    }
  }

  // Sensitive iff category says so, OR args carried credential-shaped data.
  // A sensitive prefix on a known non-sensitive tool (e.g. registry.read)
  // does NOT flip the verdict.
  const sensitive = category !== "non_sensitive" || argsContributedSensitive;
  return { sensitive, category, reasons };
}

// Mandatory broker route guard. If the intent is sensitive but arrived
// through chat, fail closed: the broker is the ONLY legitimate path for
// these surfaces.
export function assertBrokerRoutable(intent: IntentDescriptor): void {
  const verdict = classifyIntent(intent);
  if (!verdict.sensitive) return;

  const source = intent.source ?? "chat";
  if (source === "chat") {
    throw new PolicyError(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
      `tool '${intent.tool}' is sensitive (${verdict.category}); ` +
        `must route through ChittyConnect / ch1tty broker, not chat`,
      {
        tool: intent.tool,
        category: verdict.category,
        reasons: verdict.reasons,
        approved_routes: [
          "ch1tty://chitty-1p-bridge",
          "https://connect.chitty.cc",
          "https://auth.chitty.cc",
        ],
      },
    );
  }
}

// Reject any chat-layer attempt to collect long-lived credential material.
// "I'll paste my Cloudflare token here" is the canonical failure case —
// even if the requesting tool LOOKS like it would accept it, the answer
// is never to ingest it from chat.
export function assertNoDirectSecretPrompt(intent: IntentDescriptor): void {
  if (intent.source !== "chat" && intent.source !== undefined) return;
  if (!intent.args) return;
  for (const [k, v] of Object.entries(intent.args)) {
    if (!SENSITIVE_KEYWORDS.test(k)) continue;
    if (typeof v !== "string") continue;
    if (v.length < 12) continue; // Short refs / placeholders are fine
    throw new PolicyError(
      "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
      `chat-layer credential paste detected for '${k}'; ` +
        `operator is not a credential store — fetch from broker instead`,
      {
        offending_arg: k,
        guidance: "Replace the inline value with a broker reference, e.g. op://vault/item/field",
      },
    );
  }
}

export interface ScopeRequirement {
  required: string;
  granted?: string;
}

export function assertScope({ required, granted }: ScopeRequirement): void {
  if (!granted) {
    throw new PolicyError(
      "INSUFFICIENT_SCOPE",
      `required scope '${required}' not granted`,
      { required, granted: null },
    );
  }
  // Scope strings are space- or comma-separated. Check membership.
  const tokens = granted
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!tokens.includes(required) && !tokens.includes("*")) {
    throw new PolicyError("INSUFFICIENT_SCOPE", `required scope '${required}' not in granted set`, {
      required,
      granted,
    });
  }
}

// Construct a MISSING_CREDENTIAL_MATERIAL envelope. This is the only
// code allowed to request operator provisioning, and it must carry every
// resolution field so the operator (or upstream automation) can act
// without further chat-side guesswork.
export function missingMaterial(details: MissingMaterialDetails): PolicyError {
  return new PolicyError(
    "MISSING_CREDENTIAL_MATERIAL",
    `credential material missing at '${details.required_secret_path}'`,
    details,
  );
}

export function brokerUnavailable(target: string, reason: string): PolicyError {
  // Use the ChittyConnect-specific code when the named broker is ChittyConnect;
  // this matches the System-Wide Sensitive Intent Contract v1 conformance set.
  const code =
    /^chittyconnect/i.test(target) || target.includes("connect.chitty.cc")
      ? "POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE"
      : "POLICY_BLOCKED_BROKER_UNAVAILABLE";
  return new PolicyError(code, `broker '${target}' unavailable: ${reason}`, {
    target,
    reason,
  });
}

export function executionDenied(reason: string, context?: Record<string, unknown>): PolicyError {
  return new PolicyError("EXECUTION_DENIED_BY_POLICY", reason, context);
}
