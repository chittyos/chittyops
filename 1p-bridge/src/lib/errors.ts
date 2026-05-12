// Canonical policy / broker error envelope for chitty-1p-bridge.
// Every sensitive-intent failure MUST flow through PolicyError so callers
// (CLI, ch1tty handler, ChittyConnect proxies) emit a structured envelope
// instead of leaking raw provider strings.

export const POLICY_ERROR_CODES = [
  "POLICY_BLOCKED_BROKER_UNAVAILABLE",
  // Alias kept for parity with System-Wide Sensitive Intent Contract v1
  // (~/.ch1tty/canon/contract-v1.md). Emitted interchangeably with
  // POLICY_BLOCKED_BROKER_UNAVAILABLE depending on which broker failed.
  "POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE",
  "POLICY_BLOCKED_MANDATORY_BROKER_ROUTE",
  "POLICY_BLOCKED_DESTINATION_UNVERIFIED",
  "MISSING_CREDENTIAL_MATERIAL",
  "INSUFFICIENT_SCOPE",
  "EXECUTION_DENIED_BY_POLICY",
  "EXECUTION_FAILED_PROVIDER_ERROR",
] as const;

export type PolicyErrorCode = (typeof POLICY_ERROR_CODES)[number];

// MISSING_CREDENTIAL_MATERIAL is the only code that may request operator
// provisioning. Every other code MUST fail closed without prompting.
export interface MissingMaterialDetails {
  required_secret_path: string;
  required_scope: string;
  target_store: string;
  approved_resolution_paths: string[];
  retry_hint: string;
}

export interface PolicyEnvelope {
  ok: false;
  error_code: PolicyErrorCode;
  message: string;
  details?: Record<string, unknown> | MissingMaterialDetails;
}

export class PolicyError extends Error {
  public readonly code: PolicyErrorCode;
  public readonly details?: PolicyEnvelope["details"];

  constructor(
    code: PolicyErrorCode,
    message: string,
    details?: PolicyEnvelope["details"],
  ) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
    this.details = details;
  }

  toEnvelope(): PolicyEnvelope {
    const env: PolicyEnvelope = {
      ok: false,
      error_code: this.code,
      message: this.message,
    };
    if (this.details !== undefined) env.details = this.details;
    return env;
  }
}

export function isPolicyError(err: unknown): err is PolicyError {
  return err instanceof PolicyError;
}

// Adapt arbitrary thrown values into a canonical envelope. Provider errors
// (1Password SDK, fetch, etc.) collapse to EXECUTION_FAILED_PROVIDER_ERROR
// with the raw message redacted to the error class name only — provider
// strings can contain tokens/URLs and must NEVER reach the envelope body.
export function toEnvelope(err: unknown): PolicyEnvelope {
  if (isPolicyError(err)) return err.toEnvelope();
  const errorKind = err instanceof Error ? err.constructor.name : "UnknownError";
  return {
    ok: false,
    error_code: "EXECUTION_FAILED_PROVIDER_ERROR",
    message: `provider error (${errorKind})`,
    details: { error_kind: errorKind },
  };
}
