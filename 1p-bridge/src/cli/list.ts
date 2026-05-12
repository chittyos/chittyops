import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";
import { assertBrokerRoutable } from "../lib/policy.js";
import { isPolicyError, toEnvelope, PolicyError } from "../lib/errors.js";
import { scrubPayload } from "../lib/leak-containment.js";

export interface ListOptions {
  actor: string;
  source?: "cli" | "broker" | "systemd" | "test" | "chat";
}

export async function runList(
  vault: string | undefined,
  opts: ListOptions,
): Promise<number> {
  const source = opts.source ?? "cli";
  try {
    assertBrokerRoutable({
      tool: vault ? "op.list_items" : "op.list_vaults",
      args: vault ? { vault } : {},
      source,
    });

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

    if (vault) {
      const items = await client.listItems(vault);
      for (const item of items) {
        process.stdout.write(`${item.title}\t${item.id}\n`);
      }
      await logEvent({
        service: "chitty-1p-bridge",
        event: "op.list_items",
        actor: opts.actor,
        data: { vault, count: items.length },
      });
    } else {
      const vaults = await client.listVaults();
      for (const v of vaults) {
        process.stdout.write(`${v.name}\t${v.id}\n`);
      }
      await logEvent({
        service: "chitty-1p-bridge",
        event: "op.list_vaults",
        actor: opts.actor,
        data: { count: vaults.length },
      });
    }
    return 0;
  } catch (err) {
    const envelope = toEnvelope(err);
    const safeEnvelope = scrubPayload(envelope);
    process.stderr.write(`${JSON.stringify(safeEnvelope)}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: vault ? "op.list_items" : "op.list_vaults",
      actor: opts.actor,
      data: {
        vault,
        ok: false,
        error_code: safeEnvelope.error_code,
      },
    });
    return isPolicyError(err) ? 2 : 1;
  }
}
