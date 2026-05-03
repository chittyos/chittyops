import { parseCredentialPath } from "../lib/credential-path.js";
import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";

export interface GetOptions {
  actor: string;
}

export async function runGet(
  pathArg: string,
  opts: GetOptions,
): Promise<number> {
  try {
    const path = parseCredentialPath(pathArg);
    const env = loadBridgeEnv();
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
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.get",
      actor: opts.actor,
      data: { path: pathArg, ok: false, error: msg },
    });
    return 1;
  }
}
