#!/usr/bin/env node
/**
 * ABSENT IS NOT OFF — deploy gate.
 *
 * Ratified standard: CHITTYOS/chittyentity PR #650 (commit f5485a8, merged 8d490b6),
 * operator decision 2026-08-16.
 *
 * A wrangler config that declares `observability` with `enabled: true` but NO
 * `head_sampling_rate` key is not "unset" — the omitted key inherits a platform
 * default that captures. That is how the fleet accrued ~$65/month of log ingest
 * while every config still read as conformant to a grep.
 *
 * This gate enforces PRESENCE, not a numeric threshold:
 *
 *     enabled: true   =>   head_sampling_rate MUST be explicitly present
 *
 * It deliberately does NOT assert a particular rate. The fleet standard is
 * enabled:false / rate:0, but a service that has a ratified reason to enable
 * observability is only required to state its rate out loud. Encoding a
 * threshold here would be inventing policy nobody chose.
 *
 * Checked at every level where `enabled` appears: the top-level `observability`
 * object and any nested `logs` / `traces` block. Both shapes occur in the fleet
 * (flat: chittyagent-auth; nested-logs: chittyagent-quo). A gate that understood
 * only the flat shape would pass the nested ones vacuously.
 *
 * Usage:  node check-observability-rate.mjs [dir-or-file ...]     (default: cwd)
 * Exit:   0 = pass, 1 = violations found, 2 = could not parse a config.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const CONFIG_NAMES = new Set(['wrangler.json', 'wrangler.jsonc', 'wrangler.toml']);
const SKIP_DIRS = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', '.next']);

/**
 * Strip JSONC comments and trailing commas.
 *
 * String-aware: a `//` or `/*` inside a JSON string literal is content, not a
 * comment, and escaped quotes must not end the string early. Trailing commas are
 * legal JSONC and appear in real configs in this fleet — a naive
 * strip-comments-then-JSON.parse rejects 13 of chittyentity's 50 configs. The
 * checker would be wrong, not the configs.
 */
function stripJsonc(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '"') {
      out += c;
      i++;
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Trailing commas before } or ] — legal JSONC, illegal JSON.
  return out.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Walk any parsed config object and collect every observability-bearing scope.
 * Returns [{ path, enabled, hasRate }].
 *
 * `observability` can appear at the top level and under each `env.<name>`, so
 * rather than hardcoding those locations we recurse and act on any key literally
 * named `observability`.
 */
function collectScopes(node, path, acc) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return acc;
  for (const [key, val] of Object.entries(node)) {
    if (key === 'observability' && val && typeof val === 'object' && !Array.isArray(val)) {
      addScope(val, `${path}.observability`, acc);
    } else {
      collectScopes(val, `${path}.${key}`, acc);
    }
  }
  return acc;
}

function addScope(obs, path, acc) {
  if (Object.prototype.hasOwnProperty.call(obs, 'enabled')) {
    acc.push({
      path,
      enabled: obs.enabled === true,
      hasRate: Object.prototype.hasOwnProperty.call(obs, 'head_sampling_rate'),
    });
  }
  // Nested logs / traces blocks carry the same contract.
  for (const sub of ['logs', 'traces']) {
    const v = obs[sub];
    if (v && typeof v === 'object' && !Array.isArray(v)) addScope(v, `${path}.${sub}`, acc);
  }
}

/**
 * TOML: scan [observability], [observability.logs], [observability.traces] and
 * [env.X.observability...] tables for `enabled` / `head_sampling_rate` keys.
 * Deliberately narrow — we only need those two keys inside observability tables.
 */
function collectScopesToml(src) {
  const acc = [];
  const lines = src.split(/\r?\n/);
  let current = null;
  const flush = () => {
    if (current && current.enabled !== undefined) {
      acc.push({
        path: `.${current.name}`,
        enabled: current.enabled === true,
        hasRate: current.hasRate,
      });
    }
    current = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/(^|\s)#.*$/, '').trim();
    const table = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (table) {
      flush();
      const name = table[1].trim();
      if (/(^|\.)observability(\.(logs|traces))?$/.test(name)) {
        current = { name, enabled: undefined, hasRate: false };
      }
      continue;
    }
    if (!current) continue;
    const kv = /^([A-Za-z_][\w-]*)\s*=\s*(.+)$/.exec(line);
    if (!kv) continue;
    if (kv[1] === 'enabled') current.enabled = kv[2].trim() === 'true';
    if (kv[1] === 'head_sampling_rate') current.hasRate = true;
  }
  flush();
  return acc;
}

function findConfigs(target, acc = []) {
  let st;
  try {
    st = statSync(target);
  } catch {
    return acc;
  }
  if (st.isFile()) {
    if (CONFIG_NAMES.has(basename(target))) acc.push(target);
    return acc;
  }
  if (!st.isDirectory()) return acc;
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    findConfigs(join(target, entry), acc);
  }
  return acc;
}

const targets = process.argv.slice(2);
const roots = targets.length ? targets : [process.cwd()];
const files = [...new Set(roots.flatMap((r) => findConfigs(r)))].sort();

const violations = [];
const unparseable = [];
let scopesChecked = 0;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(process.cwd(), file) || file;
  let scopes;
  if (file.endsWith('.toml')) {
    scopes = collectScopesToml(src);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(stripJsonc(src));
    } catch (err) {
      unparseable.push(`${rel}: ${err.message}`);
      continue;
    }
    scopes = collectScopes(parsed, '', []);
  }
  for (const s of scopes) {
    scopesChecked++;
    if (s.enabled && !s.hasRate) {
      violations.push(`${rel}${s.path} — observability enabled:true with no head_sampling_rate key`);
    }
  }
}

console.log(
  `ABSENT IS NOT OFF gate: ${files.length} wrangler config(s), ${scopesChecked} observability scope(s) checked.`,
);

if (unparseable.length) {
  console.error('\nCould not parse:');
  for (const u of unparseable) console.error(`  ${u}`);
  process.exit(2);
}

if (violations.length) {
  console.error(
    `\nFAIL — ${violations.length} scope(s) enable observability without stating a sampling rate:\n`,
  );
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nAn omitted head_sampling_rate inherits a capturing platform default.\n' +
      'Add the key explicitly. Fleet standard is enabled:false / head_sampling_rate:0\n' +
      '(chittyentity PR #650, operator decision 2026-08-16).',
  );
  process.exit(1);
}

console.log('PASS — every enabled observability scope states an explicit head_sampling_rate.');
