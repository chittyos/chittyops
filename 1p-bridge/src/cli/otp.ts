import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";
import { assertBrokerRoutable } from "../lib/policy.js";
import { isPolicyError, toEnvelope, PolicyError } from "../lib/errors.js";
import { scrubPayload } from "../lib/leak-containment.js";

export interface OtpOptions {
  actor: string;
  source?: "cli" | "broker" | "systemd" | "test" | "chat";
}

export async function runOtp(
  pathArg: string,
  opts: OtpOptions,
): Promise<number> {
  const source = opts.source ?? "cli";
  try {
    assertBrokerRoutable({ tool: "op.otp", args: { path: pathArg }, source });

    const segments = pathArg.split("/");
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
      throw new Error(
        `otp path must be vault/item (no field), got '${pathArg}'`,
      );
    }
    const [vault, item] = segments as [string, string];

    let env;
    try {
      env = loadBridgeEnv();
    } catch (envErr) {
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
    const code = await client.getOtp(vault, item);
    process.stdout.write(`${code}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.otp",
      actor: opts.actor,
      data: { vault, item },
    });
    return 0;
  } catch (err) {
    const envelope = toEnvelope(err);
    const safeEnvelope = scrubPayload(envelope);
    process.stderr.write(`${JSON.stringify(safeEnvelope)}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.otp",
      actor: opts.actor,
      data: {
        path: pathArg,
        ok: false,
        error_code: safeEnvelope.error_code,
      },
    });
    return isPolicyError(err) ? 2 : 1;
  }
}
