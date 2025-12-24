#!/usr/bin/env bash
set -euo pipefail

# ChittyOS MCP repair and configuration script
# - Converts chittyos extension to node server with local entry
# - Bridges to chittyconnect via mcp-remote
# - Cleans manifest for MCP v2025-06-18 compatibility
# - Optionally injects token from env or settings

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info(){ echo -e "${BLUE}ℹ${NC} $*"; }
ok(){ echo -e "${GREEN}✓${NC} $*"; }
warn(){ echo -e "${YELLOW}⚠${NC} $*"; }
err(){ echo -e "${RED}✗${NC} $*"; }

MCP_URL_DEFAULT="https://connect.chitty.cc/mcp/sse"
RESTART=${RESTART:-0}
MCP_URL=${MCP_URL:-$MCP_URL_DEFAULT}
WORKER_TOKEN_INPUT=${WORKER_TOKEN:-""}

EXT_BASE="$HOME/Library/Application Support/Claude/Claude Extensions"
SET_BASE="$HOME/Library/Application Support/Claude/Claude Extensions Settings"
CHITTYOS_DIR="$EXT_BASE/chittyos"
SERVER_DIR="$CHITTYOS_DIR/server"
MANIFEST="$CHITTYOS_DIR/manifest.json"
SERVER_ENTRY="$SERVER_DIR/index.js"
SETTINGS_OS="$SET_BASE/chittyos.json"
SETTINGS_REMOTE="$SET_BASE/chitty-remote.json"

usage(){
  cat <<USAGE
Usage: RESTART=1 WORKER_TOKEN=... MCP_URL=... ./fix.sh

Environment variables:
  MCP_URL       Override remote SSE URL (default: $MCP_URL_DEFAULT)
  WORKER_TOKEN  Optional token to place in chittyos settings (fallbacks exist)
  RESTART       If 1, restart Claude at end (default: 0)
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage; exit 0
fi

if [[ ! -d "$CHITTYOS_DIR" ]]; then
  err "chittyos extension not found at: $CHITTYOS_DIR"
  exit 1
fi

mkdir -p "$SERVER_DIR"

info "Writing server entry: $SERVER_ENTRY"
cat > "$SERVER_ENTRY" <<'JS'
#!/usr/bin/env node
// Minimal node entry to bridge to chittyconnect via mcp-remote
import { spawn, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const osSettingsPath = path.join(__dirname, '..', '..', 'Claude Extensions Settings', 'chittyos.json');
const remoteSettingsPath = path.join(__dirname, '..', '..', 'Claude Extensions Settings', 'chitty-remote.json');

const defaults = {
  url: 'https://connect.chitty.cc/mcp/sse', // chittyconnect
};

function normalizeBearer(t) {
  if (!t) return '';
  return /^\s*Bearer\b/i.test(t) ? t.trim() : `Bearer ${t.trim()}`;
}

function readJsonSafe(p) {
  try { if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')); } catch {}
  return null;
}

async function tryRemoteConfigForToken() {
  const rs = readJsonSafe(remoteSettingsPath);
  if (!rs) return '';
  const remoteCfg = rs?.chittyconnect || rs?.chittyconnect_core || rs?.chittyconnect_remote || null;
  if (!remoteCfg) return '';

  // 1) explicit header
  if (remoteCfg.auth_header) return normalizeBearer(remoteCfg.auth_header);

  // 2) token_command
  if (remoteCfg.token_command) {
    try {
      const out = execSync(remoteCfg.token_command, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
      if (out) {
        try {
          const j = JSON.parse(out);
          const field = remoteCfg.token_field || 'token';
          return normalizeBearer(j?.[field] || out);
        } catch {
          return normalizeBearer(out);
        }
      }
    } catch (e) {
      console.error('[chittyos] token_command from chitty-remote failed:', e?.message || e);
    }
  }

  // 3) token_url
  if (remoteCfg.token_url) {
    try {
      const method = (remoteCfg.token_method || 'GET').toUpperCase();
      const headers = remoteCfg.token_headers && typeof remoteCfg.token_headers === 'object' ? remoteCfg.token_headers : {};
      const body = remoteCfg.token_body ? JSON.stringify(remoteCfg.token_body) : undefined;
      const resp = await fetch(remoteCfg.token_url, { method, headers: { 'content-type':'application/json', ...headers }, body });
      const text = await resp.text();
      let token = text.trim();
      try {
        const j = JSON.parse(text);
        const field = remoteCfg.token_field || 'access_token';
        token = j?.[field] || token;
      } catch {}
      if (token) return normalizeBearer(token);
    } catch (e) {
      console.error('[chittyos] token_url from chitty-remote failed:', e?.message || e);
    }
  }
  return '';
}

async function main() {
  const env = { ...process.env };
  // Build auth header using priority chain
  if (!env.MCP_AUTH_HEADER) {
    // 1) explicit WORKER_TOKEN
    const fromEnv = env.WORKER_TOKEN;
    if (fromEnv && fromEnv !== 'your-worker-token-here') env.MCP_AUTH_HEADER = normalizeBearer(fromEnv);
  }

  if (!env.MCP_AUTH_HEADER) {
    // 2) chittyos settings file
    const osSettings = readJsonSafe(osSettingsPath);
    const tokenFromSettings = osSettings?.worker_token;
    if (tokenFromSettings && tokenFromSettings !== 'your-worker-token-here') {
      env.MCP_AUTH_HEADER = normalizeBearer(tokenFromSettings);
    }
  }

  if (!env.MCP_AUTH_HEADER) {
    // 3) chitty-remote.json configuration
    try {
      const fromRemote = await tryRemoteConfigForToken();
      if (fromRemote) {
        env.MCP_AUTH_HEADER = fromRemote;
        console.error('[chittyos] token loaded via chitty-remote settings');
      }
    } catch (e) {
      console.error('[chittyos] remote settings token attempt failed:', e?.message || e);
    }
  }

  if (!env.MCP_AUTH_HEADER) {
    // 4) chittyauth CLI fallback
    try {
      const out = execSync('chittyauth token --json --service chittyconnect', { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
      if (out) {
        let token = out;
        try { const j = JSON.parse(out); token = j?.token || token; } catch {}
        env.MCP_AUTH_HEADER = normalizeBearer(token);
        console.error('[chittyos] token loaded via chittyauth for chittyconnect');
      }
    } catch (e) {
      // Silent fallback; not fatal
      console.error('[chittyos] chittyauth not available or failed:', e?.message || e);
    }
  }

  // Optional additional headers for the remote server
  const extraHeaders = {
    'X-Session-History': 'persistent',
    'X-Service-Priority': 'high',
    'X-Client-Type': 'claude-code',
    'User-Agent': 'ClaudeCode/1.0 ChittyOS',
  };
  try { env.MCP_HTTP_HEADERS_JSON = JSON.stringify(extraHeaders); } catch {}

  const url = env.MCP_REMOTE_URL || defaults.url;

  // Use npx to invoke mcp-remote without bundling dependency
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['-y', 'mcp-remote', url];
  console.error(`[chittyos] Spawning: ${npx} ${args.join(' ')}`);
  console.error(`[chittyos] Target: ${url}`);

  const child = spawn(npx, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

main();
JS
chmod +x "$SERVER_ENTRY"
ok "server/index.js written"

backup="$MANIFEST.bak.$(date +%s)"
cp "$MANIFEST" "$backup" || true
info "Backed up manifest to $backup"

info "Patching manifest to node server and removing invalid fields"
MANIFEST="$MANIFEST" MCP_URL="$MCP_URL" node - <<'NODE'
const fs = require('fs');
const path = require('path');
const manPath = process.env.MANIFEST;
const url = process.env.MCP_URL;
const raw = fs.readFileSync(manPath, 'utf8');
const man = JSON.parse(raw);

function strip(o){
  if (Array.isArray(o)) { o.forEach(strip); return; }
  if (o && typeof o === 'object') {
    delete o.mcpServers; delete o.settings; delete o.enum; delete o.items;
    for (const k of Object.keys(o)) strip(o[k]);
  }
}
strip(man);

man.server = {
  type: 'node',
  entry_point: 'server/index.js',
  mcp_config: {
    command: 'node',
    args: ['server/index.js'],
    env: { MCP_REMOTE_URL: url }
  }
};
if (man.user_config) delete man.user_config;
fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
console.log('Manifest updated -> node server, MCP_REMOTE_URL:', url);
NODE
ok "Manifest patched"

if [[ -n "$WORKER_TOKEN_INPUT" ]]; then
  info "Injecting WORKER_TOKEN into settings: $SETTINGS_OS"
  mkdir -p "$SET_BASE"
  if [[ -f "$SETTINGS_OS" ]]; then
    SETTINGS_OS="$SETTINGS_OS" WORKER_TOKEN_INPUT="$WORKER_TOKEN_INPUT" node - <<'NODE'
const fs = require('fs');
const p = process.env.SETTINGS_OS;
const tok = process.env.WORKER_TOKEN_INPUT;
let j = {};
try { j = JSON.parse(fs.readFileSync(p,'utf8')); } catch {}
j.worker_token = tok;
fs.writeFileSync(p, JSON.stringify(j, null, 2));
console.log('Updated worker_token in', p);
NODE
  else
    echo "{\n  \"worker_token\": \"$WORKER_TOKEN_INPUT\",\n  \"enabled_services\": [\n    \"chittypm\", \"chittyid\", \"chittyverify\", \"chittytrust\", \"chittyledger\"\n  ]\n}" > "$SETTINGS_OS"
    ok "Created $SETTINGS_OS with token"
  fi
else
  warn "No WORKER_TOKEN provided. Will rely on env, chitty-remote.json, or chittyauth fallback."
fi

info "Verifying URL reachability (HEAD)"
code=$(curl -sS -o /dev/null -w "%{http_code}" "$MCP_URL" --max-time 10 || true)
echo "HTTP status: $code for $MCP_URL"

if [[ "$RESTART" == "1" ]]; then
  info "Restarting Claude"
  killall Claude 2>/dev/null || true
  sleep 1
  open -a Claude || true
  ok "Claude restarted"
else
  info "Skipping restart (set RESTART=1 to enable)"
fi

ok "Done. Try enabling the chittyos extension again."
