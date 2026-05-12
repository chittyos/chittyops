---
uri: chittycanon://gov/policy/system-wide-sensitive-intent-contract
namespace: chittycanon://gov/policy
type: policy
version: 1.0.0
status: ACTIVE
registered_with: chittycanon://core/services/canon
title: "System-Wide Sensitive Intent Contract v1"
visibility: PUBLIC
---

# System-Wide Sensitive Intent Contract v1

## Authority model

| Layer | Role |
|---|---|
| Operator (human) | OPERATOR ONLY — not a credential store, KVS, auth provider, or routing authority |
| ChittyConnect / ChittyAuth / ChittyID / 1P-backed brokered storage | Authority for credentials, tokens, secrets, identity |
| KV / cache | Projection only — never credential authority |

## Sensitive surfaces

Any tool surface that can read/write/rotate/bind:
- credentials, tokens, secrets, auth material
- deploys, registry writes, service bindings
- Cloudflare, GitHub, Neon, DNS, Workers

## Non-negotiable rules

1. Classify as sensitive **before** execution.
2. Route through the mandatory ChittyConnect / ChittyAuth / ch1tty broker path.
3. Do **not** ask the operator to paste long-lived credentials.
4. Do **not** emit plaintext credentials.
5. Do **not** fall back to chat-based credential collection.
6. If broker routing fails, fail closed with a canonical error code.

## Canonical error codes

| Code | When |
|---|---|
| `POLICY_BLOCKED_BROKER_UNAVAILABLE` | Generic broker (1P Connect, etc.) is unreachable |
| `POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE` | ChittyConnect specifically is unreachable |
| `POLICY_BLOCKED_MANDATORY_BROKER_ROUTE` | Sensitive intent arrived via chat instead of the broker |
| `POLICY_BLOCKED_DESTINATION_UNVERIFIED` | Target store is off-allowlist or address malformed |
| `MISSING_CREDENTIAL_MATERIAL` | Material absent — only code allowed to request operator provisioning |
| `INSUFFICIENT_SCOPE` | Required scope not in granted set |
| `EXECUTION_DENIED_BY_POLICY` | Other policy deny |
| `EXECUTION_FAILED_PROVIDER_ERROR` | Provider error after policy passed; raw message scrubbed |

## MISSING_CREDENTIAL_MATERIAL contract

Only this code may request operator provisioning, and it MUST carry every resolution field:

```json
{
  "ok": false,
  "error_code": "MISSING_CREDENTIAL_MATERIAL",
  "message": "credential material missing at '<path>'",
  "details": {
    "required_secret_path": "op://vault/item/field",
    "required_scope": "secrets:read",
    "target_store": "1password",
    "approved_resolution_paths": ["ch1tty://chitty-1p-bridge", "https://connect.chitty.cc"],
    "retry_hint": "Provision then retry op.get"
  }
}
```

## Forbidden patterns

| Pattern name | Description |
|---|---|
| `direct_provider_secret_bypass` | Telling the operator to administer credentials directly in provider UI (1P admin, CF dashboard, GitHub settings) instead of routing through the broker |
| `ask_user_for_long_lived_secret` | Asking the operator to paste/share a long-lived secret in chat |
| `chat_layer_credential_collection` | Treating chat as a credential ingest path |
| `unverified_destination_write` | Writing/rotating to a destination that hasn't passed `resolveDestination` |

## Runtime enforcement

| Layer | Enforcement |
|---|---|
| Chat (assistant output) | `policy/sensitive-intent/block-credential-asking.sh` Stop hook — blocks credential-asking and admin-bypass phrasings |
| Broker (chitty-1p-bridge CLI) | `1p-bridge/src/lib/policy.ts` — `assertBrokerRoutable`, `assertNoDirectSecretPrompt`, `assertScope` |
| Broker (ch1tty handler) | `1p-bridge/ch1tty/handler.sh` — emits canonical envelope with `error_code` |
| Provider error scrubbing | `1p-bridge/src/lib/leak-containment.ts` — value-shape redaction before any sink |
| Destination verification | `1p-bridge/src/lib/destination-resolver.ts` — allowlist + address validation |

## Conformance tests

| Scenario | Expected |
|---|---|
| "give me Cloudflare API key" via chat-source | `POLICY_BLOCKED_MANDATORY_BROKER_ROUTE`, no operator prompt |
| 1P Connect down during op.get | `POLICY_BLOCKED_BROKER_UNAVAILABLE` |
| ChittyConnect down | `POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE` |
| Off-allowlist destination | `POLICY_BLOCKED_DESTINATION_UNVERIFIED` |
| Missing credential material | `MISSING_CREDENTIAL_MATERIAL` with full provisioning fields |
| Wrong scope | `INSUFFICIENT_SCOPE` |
| Direct registry write from chat | `POLICY_BLOCKED_MANDATORY_BROKER_ROUTE` |
| Provider error with token-shaped string | `EXECUTION_FAILED_PROVIDER_ERROR`, scrubbed envelope |

Tests live at:
- `1p-bridge/tests/policy.test.ts`
- `1p-bridge/tests/destination-resolver.test.ts`
- `1p-bridge/tests/leak-containment.test.ts`
- `1p-bridge/tests/conformance.test.ts`
- `1p-bridge/tests/cli.test.ts`
- `1p-bridge/tests/ch1tty-handler.test.sh`
- `policy/sensitive-intent/test-hook.sh`
