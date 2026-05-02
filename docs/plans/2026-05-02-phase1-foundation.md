# chitty-1p-bridge Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Node module + `chitty-op` CLI on chittyserv-dev that lets operators read 1Password credentials via a single canonical interface, registered with ChittyRegistry as a Tier 3 service.

**Architecture:** Node 22 + TypeScript strict. Thin wrapper around `@1password/connect` SDK (used as designed, no Workers shim needed). Commander-based CLI. ChittyChronicle audit logging with credential redaction. All runtime credentials resolved via `op` CLI on the VM — never typed, pasted, or stored outside 1Password.

**Tech Stack:** Node 22 LTS, TypeScript 5.x, `@1password/connect`, commander, vitest, built-in fetch.

**Working directory:** `chittyserv-dev:~/projects/github.com/CHITTYOS/chitty-1p-bridge` (already initialized; compliance triad already committed).

---

## File structure

```
chitty-1p-bridge/
├── package.json                    # NEW: deps + bin entry
├── tsconfig.json                   # NEW: strict TS config
├── vitest.config.ts                # NEW: test runner config
├── .gitignore                      # NEW
├── src/
│   ├── lib/
│   │   ├── credential-path.ts      # NEW: vault/item/field parser
│   │   ├── env.ts                  # NEW: load tokens via op CLI
│   │   ├── op-client.ts            # NEW: SDK wrapper singleton
│   │   └── chronicle.ts            # NEW: audit logger w/ redaction
│   └── cli/
│       ├── index.ts                # NEW: commander entry, bin target
│       ├── get.ts                  # NEW: chitty-op get
│       ├── list.ts                 # NEW: chitty-op list
│       └── otp.ts                  # NEW: chitty-op otp
└── tests/
    ├── credential-path.test.ts     # NEW
    ├── env.test.ts                 # NEW
    ├── chronicle.test.ts           # NEW
    ├── op-client.test.ts           # NEW
    └── cli.test.ts                 # NEW
```

Each `src/lib/*` file has a single responsibility and one default export. CLI files are kept separate from lib so the lib can be imported without pulling in commander.

---

### Task 1: Repo bootstrap

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@chittyos/1p-bridge",
  "version": "0.1.0",
  "description": "1Password to Cloudflare Secrets Store bridge + chitty-op CLI for chittyserv-dev",
  "type": "module",
  "bin": { "chitty-op": "./dist/cli/index.js" },
  "main": "./dist/lib/op-client.js",
  "types": "./dist/lib/op-client.d.ts",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests --ext .ts",
    "typecheck": "tsc --noEmit",
    "preflight": "npm run typecheck && npm run lint && npm test"
  },
  "dependencies": {
    "@1password/connect": "^1.4.0",
    "commander": "^12.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Write vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "json"] },
  },
});
```

- [ ] **Step 4: Write .gitignore**

```
node_modules/
dist/
coverage/
*.log
.DS_Store
.env
```

- [ ] **Step 5: Install + verify build harness works**

```bash
npm install
npx tsc --noEmit
```
Expected: `npm install` succeeds (~120 packages); `tsc --noEmit` exits 0 (rootDir empty so no output).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: bootstrap TypeScript/vitest/commander harness"
```

---

### Task 2: credential-path.ts (TDD)

**Files:** Create `src/lib/credential-path.ts`, `tests/credential-path.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/credential-path.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCredentialPath } from "../src/lib/credential-path.js";

describe("parseCredentialPath", () => {
  it("parses a 3-segment path", () => {
    expect(parseCredentialPath("infrastructure/cloudflare/api_key")).toEqual({
      vault: "infrastructure",
      item: "cloudflare",
      field: "api_key",
    });
  });

  it("parses a 2-segment path with field defaulted to credential", () => {
    expect(parseCredentialPath("services/chittyconnect")).toEqual({
      vault: "services",
      item: "chittyconnect",
      field: "credential",
    });
  });

  it("rejects empty string", () => {
    expect(() => parseCredentialPath("")).toThrow(/empty/i);
  });

  it("rejects 1-segment path", () => {
    expect(() => parseCredentialPath("justavault")).toThrow(/format/i);
  });

  it("rejects 4+ segment path", () => {
    expect(() => parseCredentialPath("a/b/c/d")).toThrow(/format/i);
  });

  it("rejects whitespace-only segments", () => {
    expect(() => parseCredentialPath("a/ /c")).toThrow(/segment/i);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run tests/credential-path.test.ts
```
Expected: 6 fail (`Cannot find module '../src/lib/credential-path.js'`).

- [ ] **Step 3: Implement credential-path.ts**

`src/lib/credential-path.ts`:
```ts
export interface CredentialPath {
  vault: string;
  item: string;
  field: string;
}

export function parseCredentialPath(raw: string): CredentialPath {
  if (!raw) throw new Error("credential path is empty");
  const segments = raw.split("/");
  if (segments.length < 2 || segments.length > 3) {
    throw new Error(
      `invalid path format: expected vault/item or vault/item/field, got '${raw}'`,
    );
  }
  for (const seg of segments) {
    if (!seg.trim()) throw new Error(`empty segment in path '${raw}'`);
  }
  return {
    vault: segments[0]!,
    item: segments[1]!,
    field: segments[2] ?? "credential",
  };
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/credential-path.test.ts
```
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/credential-path.ts tests/credential-path.test.ts
git commit -m "feat(lib): credential-path parser with vault/item/field semantics"
```

---

### Task 3: env.ts (TDD: resolve tokens via op CLI)

**Files:** Create `src/lib/env.ts`, `tests/env.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/env.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as childProcess from "node:child_process";
import { loadBridgeEnv } from "../src/lib/env.js";

vi.mock("node:child_process");

describe("loadBridgeEnv", () => {
  beforeEach(() => vi.resetAllMocks());

  it("resolves both tokens via op read", () => {
    const execSync = vi.spyOn(childProcess, "execSync");
    execSync.mockImplementation((cmd) => {
      if (String(cmd).includes("connect_url")) return Buffer.from("https://1p.local:8443\n");
      if (String(cmd).includes("connect_token")) return Buffer.from("ops_abc\n");
      throw new Error("unexpected command: " + cmd);
    });

    expect(loadBridgeEnv()).toEqual({
      onepasswordConnectUrl: "https://1p.local:8443",
      onepasswordConnectToken: "ops_abc",
    });
  });

  it("throws if op CLI errors", () => {
    vi.spyOn(childProcess, "execSync").mockImplementation(() => {
      throw new Error("op: command not found");
    });
    expect(() => loadBridgeEnv()).toThrow(/1Password|op CLI/);
  });

  it("throws if op returns empty value", () => {
    vi.spyOn(childProcess, "execSync").mockReturnValue(Buffer.from("\n"));
    expect(() => loadBridgeEnv()).toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run tests/env.test.ts
```
Expected: 3 fail (module missing).

- [ ] **Step 3: Implement env.ts**

`src/lib/env.ts`:
```ts
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
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/env.test.ts
```
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts tests/env.test.ts
git commit -m "feat(lib): env loader resolves bridge tokens via op CLI"
```

---

### Task 4: chronicle.ts (TDD: audit logger with credential redaction)

**Files:** Create `src/lib/chronicle.ts`, `tests/chronicle.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/chronicle.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logEvent, redactSensitive } from "../src/lib/chronicle.js";

const originalFetch = globalThis.fetch;

describe("redactSensitive", () => {
  it("redacts password/token/secret/key/credential/otp keys", () => {
    const out = redactSensitive({
      path: "infrastructure/cf/api_key",
      password: "hunter2",
      token: "ops_abc",
      something_secret: "shh",
      ApiKey: "abc",
      credential: "x",
      otp: "123456",
      benign: "hello",
    });
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.something_secret).toBe("[REDACTED]");
    expect(out.ApiKey).toBe("[REDACTED]");
    expect(out.credential).toBe("[REDACTED]");
    expect(out.otp).toBe("[REDACTED]");
    expect(out.benign).toBe("hello");
    expect(out.path).toBe("infrastructure/cf/api_key");
  });

  it("is non-recursive on nested objects (top-level only)", () => {
    const out = redactSensitive({ outer: { token: "secret" } });
    expect((out.outer as { token: string }).token).toBe("secret");
  });
});

describe("logEvent", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("", { status: 202 }));
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts event with redacted payload", async () => {
    await logEvent({
      service: "chitty-1p-bridge",
      event: "op.get",
      actor: "ubuntu",
      data: { path: "infrastructure/cf/api_key", token: "ops_abc" },
    });
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.data.path).toBe("infrastructure/cf/api_key");
    expect(body.data.token).toBe("[REDACTED]");
  });

  it("never throws when chronicle is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ENETDOWN"));
    await expect(
      logEvent({ service: "x", event: "y", actor: "z", data: {} }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run tests/chronicle.test.ts
```
Expected: failures (module missing).

- [ ] **Step 3: Implement chronicle.ts**

`src/lib/chronicle.ts`:
```ts
const SENSITIVE_KEY_PATTERN = /password|token|secret|key|credential|otp/i;
const CHRONICLE_URL =
  process.env.CHITTY_CHRONICLE_URL ?? "https://chronicle.chitty.cc/v1/events";

export interface ChronicleEvent {
  service: string;
  event: string;
  actor: string;
  data: Record<string, unknown>;
}

export function redactSensitive(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] =
      SENSITIVE_KEY_PATTERN.test(k) && typeof v === "string"
        ? "[REDACTED]"
        : v;
  }
  return out;
}

export async function logEvent(event: ChronicleEvent): Promise<void> {
  const payload = {
    service: event.service,
    event: event.event,
    actor: event.actor,
    timestamp: new Date().toISOString(),
    data: redactSensitive(event.data),
  };
  try {
    await fetch(CHRONICLE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // chronicle is best-effort; never crash the caller
  }
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/chronicle.test.ts
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chronicle.ts tests/chronicle.test.ts
git commit -m "feat(lib): chronicle logger with top-level credential redaction"
```

---

### Task 5: op-client.ts (TDD: thin SDK wrapper)

**Files:** Create `src/lib/op-client.ts`, `tests/op-client.test.ts`.

- [ ] **Step 1: Write the failing tests**

`tests/op-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpClient } from "../src/lib/op-client.js";

const mockSdk = {
  listVaults: vi.fn(),
  listItems: vi.fn(),
  getItemByTitle: vi.fn(),
  getItemOTP: vi.fn(),
};

vi.mock("@1password/connect", () => ({
  OnePasswordConnect: vi.fn(() => mockSdk),
}));

describe("OpClient", () => {
  beforeEach(() => Object.values(mockSdk).forEach((fn) => fn.mockReset()));

  it("returns vault list from listVaults", async () => {
    mockSdk.listVaults.mockResolvedValue([
      { id: "v1", name: "infrastructure" },
    ]);
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.listVaults();
    expect(out).toEqual([{ id: "v1", name: "infrastructure" }]);
  });

  it("returns field value via getField", async () => {
    mockSdk.getItemByTitle.mockResolvedValue({
      id: "i1",
      title: "cloudflare",
      fields: [
        { id: "f1", label: "username", value: "nick" },
        { id: "f2", label: "api_key", value: "abc-123" },
      ],
    });
    const c = new OpClient({ url: "https://1p", token: "t" });
    const v = await c.getField("infrastructure", "cloudflare", "api_key");
    expect(v).toBe("abc-123");
  });

  it("throws when field is missing", async () => {
    mockSdk.getItemByTitle.mockResolvedValue({ id: "i1", fields: [] });
    const c = new OpClient({ url: "https://1p", token: "t" });
    await expect(
      c.getField("infrastructure", "cloudflare", "missing"),
    ).rejects.toThrow(/field/i);
  });

  it("returns OTP via getOtp", async () => {
    mockSdk.getItemOTP.mockResolvedValue("123456");
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.getOtp("services", "github");
    expect(out).toBe("123456");
  });

  it("returns item titles from listItems", async () => {
    mockSdk.listItems.mockResolvedValue([
      { id: "i1", title: "cloudflare" },
      { id: "i2", title: "neon" },
    ]);
    const c = new OpClient({ url: "https://1p", token: "t" });
    const out = await c.listItems("infrastructure");
    expect(out).toEqual([
      { id: "i1", title: "cloudflare" },
      { id: "i2", title: "neon" },
    ]);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
npx vitest run tests/op-client.test.ts
```
Expected: 5 fail (module missing).

- [ ] **Step 3: Implement op-client.ts**

`src/lib/op-client.ts`:
```ts
import { OnePasswordConnect } from "@1password/connect";

export interface OpClientConfig {
  url: string;
  token: string;
}

export interface VaultRef {
  id: string;
  name: string;
}

export interface ItemRef {
  id: string;
  title: string;
}

interface SdkItemField {
  id: string;
  label: string;
  value?: string;
}

interface SdkItem {
  id: string;
  title?: string;
  fields?: SdkItemField[];
}

export class OpClient {
  private readonly sdk: ReturnType<typeof OnePasswordConnect>;

  constructor(config: OpClientConfig) {
    this.sdk = OnePasswordConnect({
      serverURL: config.url,
      token: config.token,
      keepAlive: true,
    });
  }

  async listVaults(): Promise<VaultRef[]> {
    const vaults = await this.sdk.listVaults();
    return vaults.map((v) => ({ id: v.id ?? "", name: v.name ?? "" }));
  }

  async listItems(vault: string): Promise<ItemRef[]> {
    const items = await this.sdk.listItems(vault);
    return items.map((i: SdkItem) => ({
      id: i.id,
      title: i.title ?? "",
    }));
  }

  async getField(
    vault: string,
    item: string,
    field: string,
  ): Promise<string> {
    const fullItem = (await this.sdk.getItemByTitle(vault, item)) as SdkItem;
    const found = fullItem.fields?.find(
      (f) =>
        f.label?.toLowerCase() === field.toLowerCase() ||
        f.id?.toLowerCase() === field.toLowerCase(),
    );
    if (!found || !found.value) {
      throw new Error(
        `field '${field}' not found or empty in ${vault}/${item}`,
      );
    }
    return found.value;
  }

  async getOtp(vault: string, item: string): Promise<string> {
    return await this.sdk.getItemOTP(vault, item);
  }
}
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/op-client.test.ts
```
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/op-client.ts tests/op-client.test.ts
git commit -m "feat(lib): OpClient wrapping 1Password Connect SDK"
```

---

### Task 6: CLI command — `chitty-op get`

**Files:** Create `src/cli/get.ts`, `tests/cli.test.ts`.

- [ ] **Step 1: Write the failing test**

`tests/cli.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runGet } from "../src/cli/get.js";
import * as opClient from "../src/lib/op-client.js";
import * as env from "../src/lib/env.js";
import * as chronicle from "../src/lib/chronicle.js";

describe("runGet", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prints field value to stdout and logs to chronicle", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const getField = vi.fn().mockResolvedValue("secret-value");
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ getField }) as unknown as opClient.OpClient,
    );
    const log = vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    const code = await runGet("infrastructure/cloudflare/api_key", {
      actor: "ubuntu",
    });

    expect(code).toBe(0);
    expect(getField).toHaveBeenCalledWith(
      "infrastructure",
      "cloudflare",
      "api_key",
    );
    expect(stdout).toHaveBeenCalledWith("secret-value\n");
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "chitty-1p-bridge",
        event: "op.get",
        actor: "ubuntu",
      }),
    );
  });

  it("returns exit code 1 on error", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockImplementation(() => {
      throw new Error("op CLI not signed in");
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runGet("a/b/c", { actor: "ubuntu" });
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npx vitest run tests/cli.test.ts
```
Expected: failures (module missing).

- [ ] **Step 3: Implement get.ts**

`src/cli/get.ts`:
```ts
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
```

- [ ] **Step 4: Run test and confirm pass**

```bash
npx vitest run tests/cli.test.ts
```
Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/get.ts tests/cli.test.ts
git commit -m "feat(cli): chitty-op get command with chronicle logging"
```

---

### Task 7: CLI command — `chitty-op list`

**Files:** Create `src/cli/list.ts`; modify `tests/cli.test.ts`.

- [ ] **Step 1: Append failing tests to tests/cli.test.ts**

```ts
import { runList } from "../src/cli/list.js";

describe("runList", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists vaults when no arg provided", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const listVaults = vi.fn().mockResolvedValue([
      { id: "v1", name: "infrastructure" },
      { id: "v2", name: "services" },
    ]);
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ listVaults }) as unknown as opClient.OpClient,
    );
    vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });

    const code = await runList(undefined, { actor: "ubuntu" });
    expect(code).toBe(0);
    expect(writes.join("")).toContain("infrastructure");
    expect(writes.join("")).toContain("services");
  });

  it("lists items when vault arg provided", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const listItems = vi.fn().mockResolvedValue([
      { id: "i1", title: "cloudflare" },
    ]);
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ listItems }) as unknown as opClient.OpClient,
    );
    vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });

    const code = await runList("infrastructure", { actor: "ubuntu" });
    expect(code).toBe(0);
    expect(listItems).toHaveBeenCalledWith("infrastructure");
    expect(writes.join("")).toContain("cloudflare");
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npx vitest run tests/cli.test.ts
```
Expected: 2 new failures.

- [ ] **Step 3: Implement list.ts**

`src/cli/list.ts`:
```ts
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
    return 1;
  }
}
```

- [ ] **Step 4: Run test and confirm pass**

```bash
npx vitest run tests/cli.test.ts
```
Expected: 4 pass total in cli.test.ts.

- [ ] **Step 5: Commit**

```bash
git add src/cli/list.ts tests/cli.test.ts
git commit -m "feat(cli): chitty-op list (vaults | items)"
```

---

### Task 8: CLI command — `chitty-op otp`

**Files:** Create `src/cli/otp.ts`; modify `tests/cli.test.ts`.

- [ ] **Step 1: Append failing tests**

```ts
import { runOtp } from "../src/cli/otp.js";

describe("runOtp", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("prints OTP for vault/item", async () => {
    vi.spyOn(env, "loadBridgeEnv").mockReturnValue({
      onepasswordConnectUrl: "https://1p",
      onepasswordConnectToken: "t",
    });
    const getOtp = vi.fn().mockResolvedValue("654321");
    vi.spyOn(opClient, "OpClient").mockImplementation(
      () => ({ getOtp }) as unknown as opClient.OpClient,
    );
    vi.spyOn(chronicle, "logEvent").mockResolvedValue();
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      writes.push(String(c));
      return true;
    });

    const code = await runOtp("services/github", { actor: "ubuntu" });
    expect(code).toBe(0);
    expect(getOtp).toHaveBeenCalledWith("services", "github");
    expect(writes.join("")).toBe("654321\n");
  });

  it("rejects 3-segment path (otp does not take field)", async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = await runOtp("a/b/c", { actor: "ubuntu" });
    expect(code).toBe(1);
  });
});
```

- [ ] **Step 2: Run test, confirm failure**

```bash
npx vitest run tests/cli.test.ts
```
Expected: 2 new failures.

- [ ] **Step 3: Implement otp.ts**

`src/cli/otp.ts`:
```ts
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
```

- [ ] **Step 4: Run tests and confirm pass**

```bash
npx vitest run tests/cli.test.ts
```
Expected: 6 pass total.

- [ ] **Step 5: Commit**

```bash
git add src/cli/otp.ts tests/cli.test.ts
git commit -m "feat(cli): chitty-op otp command"
```

---

### Task 9: CLI entry — wire commander, build, smoke

**Files:** Create `src/cli/index.ts`.

- [ ] **Step 1: Write CLI entry**

`src/cli/index.ts`:
```ts
#!/usr/bin/env node
import { Command } from "commander";
import { runGet } from "./get.js";
import { runList } from "./list.js";
import { runOtp } from "./otp.js";

const program = new Command();
const actor = process.env.USER ?? "unknown";

program
  .name("chitty-op")
  .description("Operator-grade 1Password access via the chitty-1p-bridge")
  .version("0.1.0");

program
  .command("get <path>")
  .description("Read a credential field. path = vault/item or vault/item/field")
  .action(async (path: string) => {
    process.exit(await runGet(path, { actor }));
  });

program
  .command("list [vault]")
  .description("List vaults (no arg) or items in a vault")
  .action(async (vault?: string) => {
    process.exit(await runList(vault, { actor }));
  });

program
  .command("otp <path>")
  .description("Print current TOTP code. path = vault/item")
  .action(async (path: string) => {
    process.exit(await runOtp(path, { actor }));
  });

await program.parseAsync(process.argv);
```

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: `dist/cli/index.js` exists; declaration files generated.

- [ ] **Step 3: Make built CLI executable + smoke help text**

```bash
chmod +x dist/cli/index.js
node dist/cli/index.js --help
```
Expected: help text printed listing get, list, otp commands.

- [ ] **Step 4: Run preflight (typecheck + lint + test)**

```bash
npm run preflight
```
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): commander-based chitty-op entry point"
```

---

### Task 10: ChittyRegistry registration

**Files:** Create `scripts/register.sh`, `registration.json`.

- [ ] **Step 1: Create registration payload**

`registration.json`:
```json
{
  "name": "chitty-1p-bridge",
  "tier": 3,
  "category": "operational",
  "deployment": "systemd-on-vm",
  "vm": "chittyserv-dev",
  "domain": null,
  "health_endpoint": null,
  "health_method": "systemctl status chitty-1p-bridge-sync.timer",
  "canonical_uri": "chittycanon://core/services/chitty-1p-bridge",
  "charter_uri": "chittycanon://docs/ops/policy/chitty-1p-bridge-charter",
  "architecture_uri": "chittycanon://docs/ops/architecture/chitty-1p-bridge",
  "repo": "https://github.com/chittyos/chitty-1p-bridge",
  "version": "0.1.0",
  "phase": 1,
  "capabilities": ["op.get", "op.list_vaults", "op.list_items", "op.otp"],
  "dependencies": {
    "upstream": ["1password-connect", "chittyregistry"],
    "peer": ["chittychronicle"]
  },
  "owner": "operator@chitty.cc"
}
```

- [ ] **Step 2: Create register.sh**

`scripts/register.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-https://registry.chitty.cc}"
PAYLOAD="$(dirname "$0")/../registration.json"

if [ ! -f "$PAYLOAD" ]; then
  echo "missing $PAYLOAD" >&2
  exit 1
fi

# Resolve registry write token via op CLI (never hardcoded, never typed)
TOKEN="$(op read 'op://infrastructure/chittyregistry/write_token')"

curl -sS -X POST "$REGISTRY_URL/api/v1/services" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  --data @"$PAYLOAD" | jq .
```

- [ ] **Step 3: Make register.sh executable + dry-validate payload**

```bash
chmod +x scripts/register.sh
jq . registration.json > /dev/null
echo "payload valid"
```
Expected: `payload valid` printed.

- [ ] **Step 4: Run actual registration**

```bash
./scripts/register.sh
```
Expected: JSON response with `success: true` and the canonical URI confirmed. If the endpoint shape differs, capture the actual response and adjust the script (the registry has a v0.1 MCP-style POST at `/v0.1/servers` per its endpoint listing — check both).

- [ ] **Step 5: Verify via search**

```bash
curl -s "https://registry.chitty.cc/api/v1/search?q=1p-bridge" | jq '.results'
```
Expected: array containing the registration entry.

- [ ] **Step 6: Commit**

```bash
git add scripts/register.sh registration.json
git commit -m "chore(register): ChittyRegistry registration payload + script"
```

---

### Task 11: Compliance validation (dispatch chittyregister-compliance-sergeant)

This task is run from a Claude Code session, not from a shell.

- [ ] **Step 1: Dispatch the compliance sergeant agent**

In Claude Code, invoke:
```
Agent({
  subagent_type: "chittyregister-compliance-sergeant",
  description: "Phase 1 compliance validation",
  prompt: "Validate chitty-1p-bridge Phase 1 readiness for ChittyRegistry. Repo on chittyserv-dev at ~/projects/github.com/CHITTYOS/chitty-1p-bridge. Read CHARTER.md, CHITTY.md, CLAUDE.md, AGENTS.md, SECURITY.md, registration.json, docs/specs/2026-05-02-design.md, and docs/plans/2026-05-02-phase1-foundation.md. Verify: (1) compliance triad complete and well-formed; (2) registration payload aligns with Tier 3 Operational standards; (3) no /health endpoint claim that doesn't exist; (4) declared dependencies are real and reachable; (5) entity-type usage is canonical (bridge process is synthetic Person P, not Thing). Report under 300 words with concrete blockers and important findings only — skip nits."
})
```

- [ ] **Step 2: Address blockers and important findings**

For each blocker/important finding:
- Update affected file(s)
- Stage the change
- Commit with message `fix(compliance): <finding summary>`

- [ ] **Step 3: Re-run preflight after fixes**

```bash
npm run preflight
```
Expected: all green.

- [ ] **Step 4: Re-dispatch the agent for verification**

Same agent invocation as Step 1. Expected: zero blockers remaining.

- [ ] **Step 5: Tag v0.1.0 and (if remote exists) push**

```bash
git tag -a v0.1.0 -m "chitty-1p-bridge Phase 1 foundation: CLI + registry + compliance"
# Push only if the remote `origin` exists. Operator action required to create
# the github.com/chittyos/chitty-1p-bridge repo if it doesn't.
git remote get-url origin >/dev/null 2>&1 && git push origin HEAD --tags || \
  echo "no origin remote; skipping push (operator must create the github repo first)"
```

---

## Acceptance criteria (Phase 1)

- [ ] `npm run preflight` exits 0
- [ ] `chitty-op get infrastructure/onepassword-connect/connect_url` from chittyserv-dev prints the URL
- [ ] `chitty-op list` prints at least one vault
- [ ] `chitty-op otp <some-totp-item>` prints a 6-digit code
- [ ] `curl -s https://registry.chitty.cc/api/v1/search?q=1p-bridge | jq '.results | length'` returns >= 1
- [ ] chittyregister-compliance-sergeant agent reports zero blockers
- [ ] All commits authored on the bridge repo with TDD discipline (test → impl → pass → commit)

## Out of scope (Phase 2+)

- Sync daemon, watchlist, CF Secrets Store API client → **Phase 2**
- Bi-directional sync, write methods on the SDK wrapper → **Phase 3**
- 1P Events API VM client → **Phase 4**
- systemd unit files → **Phase 2** (installed when sync ships)
- `/etc/chitty-1p-bridge/env` file management → **Phase 2** (when daemon needs ambient config)
