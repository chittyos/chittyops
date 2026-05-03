import { execSync } from "node:child_process";

export interface BridgeEnv {
  onepasswordConnectUrl: string;
  onepasswordConnectToken: string;
}

const OP_PATH_URL = "op://infrastructure/onepassword-connect/connect_url";
const OP_PATH_TOKEN = "op://infrastructure/onepassword-connect/connect_token";

function readFromOp(opPath: string): string {
  let raw: string;
  try {
    raw = execSync(`op read "${opPath}"`, {
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read ${opPath} via op CLI. ` +
        `Ensure op CLI is installed, signed in, and the path exists. Underlying: ${msg}`,
    );
  }
  const value = raw.trim();
  if (!value) throw new Error(`op returned empty value for ${opPath}`);
  return value;
}

export function loadBridgeEnv(): BridgeEnv {
  return {
    onepasswordConnectUrl: readFromOp(OP_PATH_URL),
    onepasswordConnectToken: readFromOp(OP_PATH_TOKEN),
  };
}
