# Policy

Runtime enforcement for the **System-Wide Sensitive Intent Contract v1**.

## Layout

| Path | Purpose |
|---|---|
| `canon/contract-v1.md` | Authoritative contract (canonical URI: `chittycanon://gov/policy/system-wide-sensitive-intent-contract`) |
| `canon/policy.json` | Machine-readable policy with rules, error codes, forbidden patterns |
| `canon/conformance-tests.yaml` | Conformance test catalog mapping scenarios → test files |
| `canon/integration-map.json` | Where the contract is enforced (local, chittyserv-vm, chittyconnect, chittyauth) |
| `canon/cardinal-rules.yaml` | Audit rules for `chittycanon-code-cardinal` agent — fails agent definitions referencing manual credential admin steps |
| `sensitive-intent/block-credential-asking.sh` | Stop-hook chat-layer guard (canonical hook artifact) |
| `sensitive-intent/install.sh` | Idempotent installer for local + chittyserv-vm |
| `sensitive-intent/test-hook.sh` | Hook self-test (12 scenarios, must pass before deploy) |

## Authority model

- **Operator (human):** OPERATOR ONLY. Never a credential store, KVS, auth provider, or routing authority.
- **ChittyConnect / ChittyAuth / ChittyID / 1P-backed broker:** authority for credentials, tokens, secrets, identity.
- **KV / cache:** projection only.

## Runtime enforcement layers

1. **Chat-layer Stop hook** — `policy/sensitive-intent/block-credential-asking.sh` (installed at `~/.claude/hooks/` on local + chittyserv-vm). Blocks credential-asking AND admin-bypass phrasings.
2. **Broker CLI policy gate** — `1p-bridge/src/lib/policy.ts` (`assertBrokerRoutable`, `assertNoDirectSecretPrompt`, `assertScope`).
3. **Broker handler envelope** — `1p-bridge/ch1tty/handler.sh` emits canonical `{ok, error_code, message, details}`.
4. **Leak containment** — `1p-bridge/src/lib/leak-containment.ts` scrubs token-shaped values from any envelope before it reaches stderr/chronicle.
5. **Destination resolver** — `1p-bridge/src/lib/destination-resolver.ts` allowlists target stores and validates address shape.
6. **Cardinal audit rules** — `policy/canon/cardinal-rules.yaml` reviewed by the `chittycanon-code-cardinal` agent on agent/skill definitions.

## Canonical error codes

```
POLICY_BLOCKED_BROKER_UNAVAILABLE
POLICY_BLOCKED_CHITTYCONNECT_UNAVAILABLE
POLICY_BLOCKED_MANDATORY_BROKER_ROUTE
POLICY_BLOCKED_DESTINATION_UNVERIFIED
MISSING_CREDENTIAL_MATERIAL          ← only code allowed to request operator provisioning
INSUFFICIENT_SCOPE
EXECUTION_DENIED_BY_POLICY
EXECUTION_FAILED_PROVIDER_ERROR
```

## Install / re-deploy

```bash
# Local only
policy/sensitive-intent/install.sh

# Local + chittyserv-vm
policy/sensitive-intent/install.sh --remote chittyserv-dev

# VM only
policy/sensitive-intent/install.sh --remote-only chittyserv-dev
```

The installer is idempotent: re-running diff-checks the hook before copying, runs the self-test against the installed hook, and verifies the Stop hook entry in `~/.claude/settings.json` (warns if missing).

## Conformance

```bash
# Broker policy / envelope / containment / destination tests
cd 1p-bridge && npm test

# Hook self-test (12 scenarios)
bash policy/sensitive-intent/test-hook.sh

# ch1tty handler envelope test
bash 1p-bridge/tests/ch1tty-handler.test.sh
```
