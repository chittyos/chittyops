/**
 * GAM HTTP Server — Local executor for chittyagent-gam
 *
 * Runs on the VM, accepts JSON requests, executes GAMADV-XTD3 commands,
 * returns structured JSON output. Exposed via the ch1tty tunnel
 * (gam.chitty.cc -> 127.0.0.1:9098). Never bind to a public interface.
 *
 * Endpoints:
 *   GET  /health           — liveness + gam binary path + workspace accounts
 *   POST /gam              — generic passthrough {account, command, args}
 *                            (backs the ChittyMCP `gam_execute` capability)
 *   POST /gmail/metadata   — F-L10 metadata-only Gmail listing for the two
 *                            Workspace inboxes. Header fields ONLY — never
 *                            body or snippet. Consumer accounts are refused.
 *
 * F-L10 (privileged-domain metadata-only): the two Workspace inboxes carry
 * privileged legal mail. This connector MUST NOT let message bodies or
 * snippets cross the domain boundary. /gmail/metadata constructs its own
 * GAM args (caller args are ignored) and only ever requests From/Subject/Date
 * headers — there is no code path that emits a body.
 */
const { execFile } = require("child_process");
const http = require("http");
const path = require("path");

const GAM_BIN = path.join(process.env.HOME, "bin/gamadv-xtd3/gamadv-xtd3/gam");
const PORT = process.env.GAM_PORT || 9098;

// Workspace account allowlist. Logical account -> { email, select }.
// `select` is the GAM config section (gam.cfg). ws_jeanarlene is the
// configured [DEFAULT]; ws_nevershitty awaits its OAuth/service-account
// profile (see RUNBOOK-oauth.md) and will surface account_not_provisioned
// until that lands. The personal consumer inbox is intentionally absent:
// GAM cannot reach @gmail.com, and per spec Q4 it uses readonly Gmail MCP.
const WORKSPACE_ACCOUNTS = {
  ws_jeanarlene: { email: "nick@jeanarlene.com", select: "default" },
  ws_nevershitty: { email: "nick@nevershitty.com", select: "nevershitty" },
};

// Metadata-only header set. Adding "body"/"snippet"/"showbody" here would
// breach F-L10 — do not.
const METADATA_HEADERS = "From,Subject,Date";
const DEFAULT_QUERY = "in:inbox newer_than:1d";
const MAX_CAP = 250;

function runGam(account, command, args = []) {
  return new Promise((resolve, reject) => {
    const gamArgs = [];
    if (account && account !== "default") {
      gamArgs.push("select", account);
    }
    gamArgs.push(command, ...args);

    execFile(GAM_BIN, gamArgs, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: err ? err.code : 0 });
    });
  });
}

// Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // skip
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Parse GAM `print messages` CSV (cols: User,threadId,id,From,Subject,Date)
// into metadata-only items. Never surfaces body/snippet.
function parseMessageMetadata(stdout) {
  const rows = parseCsv(stdout).filter(r => r.length && r.some(c => c !== ""));
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());
  const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const iThread = idx("threadId");
  const iId = idx("id");
  const iFrom = idx("From");
  const iSubject = idx("Subject");
  const iDate = idx("Date");
  return rows.slice(1).map(r => ({
    message_id: iId >= 0 ? r[iId] : null,
    thread_id: iThread >= 0 ? r[iThread] : null,
    from: iFrom >= 0 ? r[iFrom] : null,
    subject: iSubject >= 0 ? r[iSubject] : null,
    date: iDate >= 0 ? r[iDate] : null,
  })).filter(m => m.message_id);
}

async function gmailMetadata({ account, query, max }) {
  const acct = WORKSPACE_ACCOUNTS[account];
  if (!acct) {
    const err = new Error(
      `account '${account}' is not a permitted Workspace account. ` +
      `GAM serves Workspace inboxes only (F-L10); consumer accounts use readonly Gmail MCP.`
    );
    err.statusCode = 403;
    throw err;
  }
  const q = (typeof query === "string" && query.trim()) ? query.trim() : DEFAULT_QUERY;
  const cap = Math.min(Math.max(parseInt(max, 10) || 50, 1), MAX_CAP);
  // Args are constructed here; any caller-supplied gam args are discarded so
  // there is no way to inject `showbody`/`showsize` and breach F-L10.
  const args = [
    acct.email, "print", "messages",
    "query", q,
    "headers", METADATA_HEADERS,
    "max_to_print", String(cap),
  ];
  const out = await runGam(acct.select, "user", args);
  const items = parseMessageMetadata(out.stdout);
  return {
    account,
    email: acct.email,
    query: q,
    metadata_only: true,
    count: items.length,
    items,
  };
}

const server = http.createServer(async (req, res) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  if (req.method === "OPTIONS") { res.writeHead(204, headers); res.end(); return; }

  if (req.url === "/health") {
    res.writeHead(200, headers);
    res.end(JSON.stringify({
      status: "ok",
      service: "gam-executor",
      gam: GAM_BIN,
      workspace_accounts: Object.keys(WORKSPACE_ACCOUNTS),
    }));
    return;
  }

  if (req.url === "/gam" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const { account, command, args } = JSON.parse(body);
        if (!command) { res.writeHead(400, headers); res.end(JSON.stringify({ error: "command required" })); return; }
        const result = await runGam(account, command, args || []);
        res.writeHead(200, headers);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(500, headers);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.url === "/gmail/metadata" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", async () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const result = await gmailMetadata(payload);
        res.writeHead(200, headers);
        res.end(JSON.stringify(result));
      } catch (e) {
        const code = e.statusCode || 500;
        // GAM emits "not authorized"/"Invalid Domain"/"unknown user" when a
        // profile (e.g. ws_nevershitty) isn't provisioned yet — surface as a
        // structured, recoverable state so callers degrade rather than crash.
        const msg = String(e.message || e);
        const notProvisioned = /not\s+authoriz|invalid\s+domain|domain not found|no such|unknown user|does not exist|section:[^\n]*not found/i.test(msg);
        res.writeHead(notProvisioned ? 424 : code, headers);
        res.end(JSON.stringify({
          error: msg,
          code: notProvisioned ? "account_not_provisioned" : (code === 403 ? "account_not_permitted" : "gam_error"),
        }));
      }
    });
    return;
  }

  res.writeHead(404, headers);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("GAM HTTP server listening on 127.0.0.1:" + PORT);
});
