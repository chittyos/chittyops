/**
 * daily-comms-triage worker
 * Cron-triggered routine: ingest → dispatch (P+ E N) → tiered classify → orchestrate → Attest
 *
 * Pentad: Perceive+ → Evaluate → Navigate → Transact → Attest
 * Pilot mode: T2/T3 disabled; escalations flag as `pilot_unresolved`
 */

import type {
  IngestItem,
  ScoredAction,
  RoutineManifest,
  CostLedgerEntry,
} from "./types";
import { sha256 } from "./crypto";

interface Env {
  // Bindings
  NEON: Hyperdrive;
  KV_LOCKS: KVNamespace;
  R2_RAW: R2Bucket;
  AI_GATEWAY_URL: string;
  DISCOVERY_HEARTBEAT_URL: string;
  COMPTROLLER_BUDGET_URL: string;
  // chittyagent-gam connector (gam.chitty.cc tunnel -> VM executor 127.0.0.1:9098).
  // Serves the two Workspace inboxes metadata-only (F-L10). Set in [vars]; the
  // API key (secret) gates the tunnel.
  CHITTYGAM_URL: string;
  // Secrets (1Password / ChittyConnect-injected)
  CHITTYGAM_API_KEY: string;
  // Personal consumer inbox: readonly Gmail REST (spec Q4). OAuth access token
  // provisioned/refreshed via ChittyConnect; absent until granted (source degrades).
  GMAIL_PERSONAL_TOKEN: string;
  QUO_API_KEY: string;
  MERCURY_API_KEY: string;
  CHITTY_DNA_SIGNING_KEY: string;
  CHITTYDISPATCH_URL: string;
  AUTOASSIST_URL: string;
  ORCHESTRATOR_URL: string;
  // Manifest
  MANIFEST: RoutineManifest;
}

const LOCK_KEY = "lock:daily-comms-triage";
const LOCK_TTL_S = 5400;

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    // Acquire distributed lock — skip if held (F-R5)
    const acquired = await acquireLock(env.KV_LOCKS, LOCK_KEY, LOCK_TTL_S);
    if (!acquired) {
      console.warn(`[${runId}] lock held; skipping run`);
      return;
    }

    try {
      // 1. Pre-flight: check Comptroller budget signal
      const budgetStatus = await fetchBudgetStatus(env);
      if (budgetStatus.halt) {
        console.error(`[${runId}] Comptroller hard-halt active; skipping`);
        await heartbeat(env, runId, "halted_by_comptroller");
        return;
      }

      // 2. Ingest from all sources (parallel)
      const ingestItems = await ingestAllSources(env, runId);
      console.log(`[${runId}] ingested ${ingestItems.length} items`);

      // 3. Dispatch P+ (pre-evaluate sensitivity, metadata-only)
      const preEvaluated = await batchDispatchP(env, ingestItems, runId);

      // 4. Dispatch E + N (policy + navigate binding)
      const evaluated = await batchDispatchEN(env, preEvaluated, runId);

      // 5. Dedupe + cache lookup
      const deduped = await dedupeAndCache(env, evaluated, runId);

      // 6. Tiered classify (T0 → T1; T2/T3 may be disabled by PILOT_MODE)
      const scored: ScoredAction[] = [];
      for (const item of deduped) {
        const action = await tieredClassify(env, item, runId);
        scored.push(action);
      }

      // 7. Auto-archive gate
      const { archived, retained } = applyAutoArchiveGate(scored);
      console.log(`[${runId}] auto-archived ${archived.length}, retained ${retained.length}`);

      // 8. Orchestrator routing (specialist agents per category)
      const enriched = await batchOrchestratorRoute(env, retained, runId);

      // 9. Attest — write canonical + receipts
      await attestBatch(env, enriched, archived, runId);

      // 10. Heartbeat
      await heartbeat(env, runId, "success");
      const elapsed = Date.now() - startedAt;
      console.log(`[${runId}] complete in ${elapsed}ms`);
    } catch (err) {
      console.error(`[${runId}] error:`, err);
      await heartbeat(env, runId, "error", String(err));
      throw err;
    } finally {
      await releaseLock(env.KV_LOCKS, LOCK_KEY);
    }
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const now = new Date().toISOString();

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "daily-comms-triage", version: "1.0.0", ts: now });
    }

    if (url.pathname === "/api/v1/status") {
      const locked = await env.KV_LOCKS.get(LOCK_KEY);
      return Response.json({
        status: "ok",
        service: "daily-comms-triage",
        version: "1.0.0",
        mode: "active",
        run_locked: locked !== null,
        manifest_version: env.MANIFEST?.version,
        ts: now,
      });
    }

    if (url.pathname === "/api/v1/metrics") {
      return Response.json({ status: "ok", service: "daily-comms-triage", note: "metrics endpoint scaffold", ts: now });
    }

    return new Response("daily-comms-triage", { status: 200 });
  },
};

// --- Lock management ---
async function acquireLock(kv: KVNamespace, key: string, ttl: number): Promise<boolean> {
  const existing = await kv.get(key);
  if (existing) return false;
  await kv.put(key, Date.now().toString(), { expirationTtl: ttl });
  return true;
}

async function releaseLock(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// --- Ingest ---
async function ingestAllSources(env: Env, runId: string): Promise<IngestItem[]> {
  const sources = [
    ingestWorkspaceGmail(env, "ws_nevershitty"),
    ingestWorkspaceGmail(env, "ws_jeanarlene"),
    ingestPersonalGmail(env),
    ingestQuo(env),
    ingestIMessage(env),
    ingestMercury(env),
    ingestCalendar(env),
    ingestNotion(env),
    ingestM365(env),
    ingestCloudflareAlerts(env),
    ingestLinear(env),
    ingestCashApp(env),
    ingestDocusign(env),
    ingestRMail(env),
  ];
  // Settle all; never let one source failure block others (per-source circuit breaker — F-R3)
  const results = await Promise.allSettled(sources);
  const items: IngestItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") items.push(...r.value);
    else console.warn(`[${runId}] source failed:`, r.reason);
  }
  return items;
}

// --- Gmail ingestors ---
// Two paths, per spec Q4 (hybrid): the two Workspace inboxes flow through the
// chittyagent-gam connector (GAM/GAMADV-XTD3), metadata-only per F-L10 — message
// bodies/snippets never cross the domain boundary. The personal consumer inbox
// (which GAM cannot reach) uses readonly Gmail REST. Both degrade to [] when a
// source is unprovisioned, so one missing credential never blocks the run (F-R3).

// Workspace Gmail (ws_nevershitty, ws_jeanarlene) — metadata-only via connector.
// The connector returns headers only (from/subject/date); `preview` is left empty
// because privileged-domain snippets must not leave the boundary (F-L10). In-domain
// Studio-flow triage can later enrich `pre_evaluated_sensitivity` on these items.
async function ingestWorkspaceGmail(env: Env, account: "ws_nevershitty" | "ws_jeanarlene"): Promise<IngestItem[]> {
  const resp = await fetch(`${env.CHITTYGAM_URL}/gmail/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CHITTYGAM_API_KEY}` },
    body: JSON.stringify({ account, query: "in:inbox newer_than:1d", max: 200 }),
  });
  if (!resp.ok) {
    // 424 = account_not_provisioned (e.g. ws_nevershitty before OAuth lands),
    // 403 = account_not_permitted, 5xx = executor/tunnel down. Degrade (F-R3).
    const detail = await resp.text().catch(() => "");
    console.warn(`[gam ${account}] non-ok ${resp.status}: ${detail.slice(0, 200)}`);
    return [];
  }
  const data = await resp.json() as { items?: Array<Record<string, string>> };
  return (data.items ?? []).map(m => {
    // A single malformed Date header must not reject the whole map (which would
    // drop the entire inbox for the run); fall back to epoch on unparseable dates.
    const d = m.date ? new Date(m.date) : null;
    const received_at = d && !isNaN(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
    return {
    source: "gmail",
    account,
    source_id: m.message_id,
    received_at,
    subject: m.subject ?? "",
    preview: "", // F-L10: no snippet for privileged Workspace domains
    raw_ref: `gam://${account}/${m.message_id}`,
    sensitivity_hint: "unknown",
    entity_prior: account === "ws_nevershitty" ? "ChittyCorp" : "JAVL",
    hints: { from: m.from, subject: m.subject, thread_id: m.thread_id, message_id: m.message_id },
    };
  });
}

// Personal consumer Gmail (nichobianchi@gmail.com) — readonly Gmail REST, metadata
// format. Not a privileged domain, so the snippet preview is retained. Requires an
// OAuth access token (ChittyConnect-provisioned); degrades to [] until granted.
async function ingestPersonalGmail(env: Env): Promise<IngestItem[]> {
  if (!env.GMAIL_PERSONAL_TOKEN) {
    console.warn("[gmail personal] no token provisioned; skipping (F-R3)");
    return [];
  }
  const auth = { Authorization: `Bearer ${env.GMAIL_PERSONAL_TOKEN}` };
  const listResp = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=" +
      encodeURIComponent("in:inbox newer_than:1d") + "&maxResults=100",
    { headers: auth },
  );
  if (!listResp.ok) {
    console.warn(`[gmail personal] list non-ok: ${listResp.status}`);
    return [];
  }
  const { messages = [] } = await listResp.json() as { messages?: Array<{ id: string }> };
  const items = await Promise.all(messages.map(async (m): Promise<IngestItem | null> => {
    const r = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}` +
        "?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date",
      { headers: auth },
    );
    if (!r.ok) return null;
    const msg = await r.json() as {
      threadId?: string; internalDate?: string; snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const h: Record<string, string> = {};
    for (const x of msg.payload?.headers ?? []) h[x.name.toLowerCase()] = x.value;
    return {
      source: "gmail",
      account: "personal_gmail",
      source_id: m.id,
      received_at: new Date(parseInt(msg.internalDate ?? "0", 10)).toISOString(),
      subject: h.subject ?? "",
      preview: msg.snippet ?? "",
      raw_ref: `gmail://personal_gmail/${m.id}`,
      sensitivity_hint: "unknown",
      entity_prior: "Personal",
      hints: { from: h.from, subject: h.subject, thread_id: msg.threadId, message_id: m.id },
    };
  }));
  return items.filter((i): i is IngestItem => i !== null);
}

// Stubs for other sources — call respective MCPs
async function ingestQuo(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "quo", "messages.list", { since_hours: 24 }); }
async function ingestIMessage(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "chittymsg", "imsg_imsg_recent", { hours: 24 }); }
async function ingestMercury(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "mercury", "listTransactions", { since_hours: 24 }); }
async function ingestCalendar(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "chittymac", "calendar.events", { window_hours: 24 }); }
async function ingestNotion(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "notion", "search_comments", { since_hours: 24 }); }
async function ingestM365(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "m365", "mail.unread", {}); }
async function ingestCloudflareAlerts(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "cloudflare", "alerts.recent", {}); }
async function ingestLinear(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "linear", "issues.assigned_recent", {}); }
async function ingestCashApp(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "cashapp", "transactions.recent", {}); }
async function ingestDocusign(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "docusign", "envelopes.recent", {}); }
async function ingestRMail(env: Env): Promise<IngestItem[]> { return mcpIngest(env, "rmail", "events.recent", {}); }

async function mcpIngest(env: Env, service: string, tool: string, args: Record<string, unknown>): Promise<IngestItem[]> {
  const resp = await fetch(`https://mcp.chitty.cc/${service}/${tool}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    // Per-source circuit breaker (F-R3): degrade, don't fail
    console.warn(`[mcp ${service}.${tool}] non-ok: ${resp.status}`);
    return [];
  }
  const data = await resp.json() as any[];
  return data.map(d => normalizeMcpRow(d, service));
}

function normalizeMcpRow(d: any, service: string): IngestItem {
  return {
    source: service as any,
    account: "n/a",
    source_id: d.id ?? d.uuid,
    received_at: d.timestamp ?? d.created_at ?? new Date().toISOString(),
    subject: d.subject ?? d.title ?? "",
    preview: (d.body ?? d.text ?? "").slice(0, 500),
    raw_ref: `mcp://${service}/${d.id}`,
    sensitivity_hint: "unknown",
    entity_prior: null,
    hints: { ...d },
  };
}

// --- Dispatch P+, E, N ---
async function batchDispatchP(env: Env, items: IngestItem[], runId: string): Promise<IngestItem[]> {
  const resp = await fetch(`${env.CHITTYDISPATCH_URL}/perceive_plus`, {
    method: "POST",
    body: JSON.stringify({ items, run_id: runId }),
  });
  return await resp.json() as IngestItem[];
}

async function batchDispatchEN(env: Env, items: IngestItem[], runId: string): Promise<IngestItem[]> {
  const resp = await fetch(`${env.CHITTYDISPATCH_URL}/evaluate_navigate`, {
    method: "POST",
    body: JSON.stringify({ items, run_id: runId }),
  });
  return await resp.json() as IngestItem[];
}

// --- Dedupe + cache ---
async function dedupeAndCache(env: Env, items: IngestItem[], runId: string): Promise<IngestItem[]> {
  // Primary key: hints.message_id; fallback: hash(from, subject_normalized, date_bucket_5min)
  const seen = new Map<string, IngestItem>();
  for (const item of items) {
    const key = item.hints?.message_id ?? compositeKey(item);
    const existing = seen.get(key);
    if (existing) {
      // merge: append account into accounts[]
      (existing as any).accounts = (existing as any).accounts ?? [existing.account];
      if (!(existing as any).accounts.includes(item.account)) (existing as any).accounts.push(item.account);
    } else {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values());
}

function compositeKey(item: IngestItem): string {
  const subjectNorm = (item.subject ?? "").toLowerCase().replace(/^(re:|fwd:)\s*/g, "").trim();
  const dateBucket = Math.floor(new Date(item.received_at).getTime() / (5 * 60 * 1000));
  return `${item.hints?.from ?? ""}|${subjectNorm}|${dateBucket}`;
}

// --- Tiered classify ---
async function tieredClassify(env: Env, item: IngestItem, runId: string): Promise<ScoredAction> {
  const tStart = Date.now();
  // Tier 0: CF Workers AI for cheap pre-filters
  const t0 = await callTier(env, "T0", item, runId);
  if (t0.injection_suspected || t0.category === "noise") {
    await ledgerWrite(env, { service: "daily-comms-triage", tier: "T0", item_id_hash: await sha256(item.source_id), cost_usd: 0, ts: new Date().toISOString() });
    return finalize(item, t0);
  }

  // Tier 1: Studio output already present for Workspace; for others, call Gemini Flash
  let t1: any;
  if (item.account?.startsWith("ws_")) {
    t1 = item.hints?.studio_classification; // already in row
  } else {
    t1 = await callTier(env, "T1_personal", item, runId);
  }
  await ledgerWrite(env, { service: "daily-comms-triage", tier: "T1", item_id_hash: await sha256(item.source_id), cost_usd: 0, ts: new Date().toISOString() });

  if (t1.confidence >= 0.7 && !(t1.category === "Legal" && t1.priority >= 7)) {
    return finalize(item, t1);
  }

  // Tier 2/3 escalation — pilot-disabled
  if (env.MANIFEST.policy_flags.PILOT_MODE) {
    return { ...finalize(item, t1), tier_used: "manual", policy_flags_triggered: ["PILOT_MODE_UNRESOLVED"] };
  }

  const tier = (t1.category === "Legal" && t1.priority >= 7) ? "T3_sonnet" : "T2_haiku";
  const t23 = await callTier(env, tier, item, runId);
  return finalize(item, t23);
}

async function callTier(env: Env, tier: string, item: IngestItem, runId: string): Promise<any> {
  const url = `${env.AI_GATEWAY_URL}/tier/${tier}`;
  const resp = await fetch(url, {
    method: "POST",
    body: JSON.stringify({ item, run_id: runId }),
    signal: AbortSignal.timeout(30000),
  });
  return await resp.json();
}

function finalize(item: IngestItem, classification: any): ScoredAction {
  return {
    id: `did:chitty:action:${new Date().toISOString().slice(2, 7).replace("-", "")}-${crypto.randomUUID().slice(0, 8)}`,
    ingest_item_ref: item.source_id,
    accounts: (item as any).accounts ?? [item.account],
    cross_inbox_count: ((item as any).accounts ?? [item.account]).length,
    category: classification.category,
    priority: classification.priority + (((item as any).accounts?.length ?? 1) - 1),
    entity: classification.entity ?? item.entity_prior,
    property: classification.property ?? null,
    case: classification.case ?? null,
    sensitivity: item.pre_evaluated_sensitivity ?? classification.sensitivity ?? "public",
    confidence: classification.confidence,
    tier_used: classification.tier_used,
    injection_suspected: classification.injection_suspected ?? false,
    recommended_action: classification.recommended_action,
    recommended_text: classification.recommended_text ?? "",
    due: classification.due ?? null,
    rationale: classification.rationale ?? "",
    routing: classification.sensitivity === "privileged" ? "legalink" : "business",
    policy_flags_triggered: classification.policy_flags_triggered ?? [],
    cost_constrained: false,
    auto_archived: false,
  } as ScoredAction;
}

// --- Auto-archive gate (F-L12 privileged-domain exclusion built in) ---
function applyAutoArchiveGate(scored: ScoredAction[]): { archived: ScoredAction[]; retained: ScoredAction[] } {
  const archived: ScoredAction[] = [];
  const retained: ScoredAction[] = [];
  for (const a of scored) {
    if (
      a.confidence >= 0.95 &&
      ["Archive", "FYI"].includes(a.recommended_action) &&
      a.priority <= 3 &&
      a.sensitivity === "public" &&
      a.policy_flags_triggered.length === 0
    ) {
      archived.push({ ...a, auto_archived: true });
    } else {
      retained.push(a);
    }
  }
  return { archived, retained };
}

// --- Orchestrator routing ---
async function batchOrchestratorRoute(env: Env, items: ScoredAction[], runId: string): Promise<ScoredAction[]> {
  const resp = await fetch(`${env.ORCHESTRATOR_URL}/route_batch`, {
    method: "POST",
    body: JSON.stringify({ items, run_id: runId }),
  });
  return await resp.json() as ScoredAction[];
}

// --- Attest: canonical write + receipts ---
async function attestBatch(env: Env, enriched: ScoredAction[], archived: ScoredAction[], runId: string): Promise<void> {
  const payload = { enriched, archived, run_id: runId, signed_at: new Date().toISOString() };
  // Write to Neon, post mirror to Notion, sign ChittyDNA receipt
  await fetch("https://neon.chitty.cc/actions_v1/insert_batch", { method: "POST", body: JSON.stringify(payload) });
  await fetch("https://notion.chitty.cc/mirror/actions", { method: "POST", body: JSON.stringify(payload) });
  await fetch("https://id.chitty.cc/dna/sign", {
    method: "POST",
    body: JSON.stringify({ payload_hash: await sha256(JSON.stringify(payload)), key_id: env.CHITTY_DNA_SIGNING_KEY }),
  });
}

// --- cost_ledger (batched) ---
const ledgerBuffer: CostLedgerEntry[] = [];
async function ledgerWrite(env: Env, entry: CostLedgerEntry): Promise<void> {
  ledgerBuffer.push(entry);
  if (ledgerBuffer.length >= 100) await ledgerFlush(env);
}
async function ledgerFlush(env: Env): Promise<void> {
  if (ledgerBuffer.length === 0) return;
  const batch = ledgerBuffer.splice(0, ledgerBuffer.length);
  await fetch("https://neon.chitty.cc/cost_ledger/insert_batch", {
    method: "POST",
    body: JSON.stringify({ entries: batch }),
  });
}

// --- Heartbeat ---
async function heartbeat(env: Env, runId: string, status: string, error?: string): Promise<void> {
  await fetch(env.DISCOVERY_HEARTBEAT_URL, {
    method: "POST",
    body: JSON.stringify({ routine: "daily-comms-triage", run_id: runId, status, error, ts: new Date().toISOString() }),
  });
}

// --- Comptroller budget gate ---
async function fetchBudgetStatus(env: Env): Promise<{ halt: boolean; degrade?: string }> {
  const resp = await fetch(`${env.COMPTROLLER_BUDGET_URL}/daily-comms-triage/status`);
  if (!resp.ok) return { halt: false }; // Comptroller down → proceed (fail-open at L1)
  return await resp.json() as { halt: boolean; degrade?: string };
}
