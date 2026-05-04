import { loadBridgeEnv } from "../lib/env.js";
import { OpClient } from "../lib/op-client.js";
import { logEvent } from "../lib/chronicle.js";

export interface OtpOptions {
  actor: string;
}

export async function runOtp(
  pathArg: string,
  opts: OtpOptions,
): Promise<number> {
  try {
    const segments = pathArg.split("/");
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
      throw new Error(
        `otp path must be vault/item (no field), got '${pathArg}'`,
      );
    }
    const [vault, item] = segments as [string, string];
    const env = loadBridgeEnv();
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
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`error: ${msg}\n`);
    return 1;
  }
}
