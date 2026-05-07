import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";

export interface ListOptions {
  actor: string;
}

export async function runList(
  vault: string | undefined,
  opts: ListOptions,
): Promise<number> {
  try {
    const env = loadBridgeEnv();
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
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    const errorKind =
      err instanceof Error ? err.constructor.name : "UnknownError";
    await logEvent({
      service: "chitty-1p-bridge",
      event: vault ? "op.list_items" : "op.list_vaults",
      actor: opts.actor,
      data: { vault, ok: false, error_kind: errorKind },
    });
    return 1;
  }
}
