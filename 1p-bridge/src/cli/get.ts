import { parseCredentialPath } from "../lib/credential-path.js";
import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";
import {
  assertBrokerRoutable,
  assertNoDirectSecretPrompt,
} from "../lib/policy.js";
import { isPolicyError, toEnvelope, PolicyError } from "../lib/errors.js";
import { scrubPayload } from "../lib/leak-containment.js";

export interface GetOptions {
  actor: string;
  // Source declared by the caller. Defaults to "cli" because the entry
  // point is the chitty-op binary; the ch1tty handler overrides to "broker".
  source?: "cli" | "broker" | "systemd" | "test" | "chat";
}

export async function runGet(
  pathArg: string,
  opts: GetOptions,
): Promise<number> {
  const source = opts.source ?? "cli";
  try {
    // Policy gate: classify intent + enforce broker route + reject
    // chat-layer credential pastes BEFORE we touch any provider.
    assertBrokerRoutable({ tool: "op.get", args: { path: pathArg }, source });
    assertNoDirectSecretPrompt({
      tool: "op.get",
      args: { path: pathArg },
      source,
    });

    const path = parseCredentialPath(pathArg);

    let env;
    try {
      env = loadBridgeEnv();
    } catch (envErr) {
      // 1Password Connect bootstrap failed — emit canonical broker-unavailable
      // envelope rather than a raw provider string.
      throw new PolicyError(
        "POLICY_BLOCKED_BROKER_UNAVAILABLE",
        "1Password Connect bootstrap failed",
        {
          target: "1password-connect",
          reason: envErr instanceof Error ? envErr.constructor.name : "Unknown",
        },
      );
    }

    const client = new OpClient({
      url: env.onepasswordConnectUrl,
      token: env.onepasswordConnectToken,
    });
    const value = await client.getField(path.vault, path.item, path.field);
    process.stdout.write(`${value}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.get",
      actor: opts.actor,
      data: { path: pathArg, ok: true },
    });
    return 0;
  } catch (err) {
    const envelope = toEnvelope(err);
    // scrubPayload is the last line of defense before stderr — provider
    // strings, URL-embedded tokens, JWTs are all scrubbed by value shape.
    const safeEnvelope = scrubPayload(envelope);
    process.stderr.write(`${JSON.stringify(safeEnvelope)}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.get",
      actor: opts.actor,
      data: {
        path: pathArg,
        ok: false,
        error_code: safeEnvelope.error_code,
      },
    });
    // Policy failures: exit 2 (machine-actionable). Provider failures: exit 1.
    return isPolicyError(err) ? 2 : 1;
  }
}
