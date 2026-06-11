/**
 * ChittyComptroller — sibling budget observer + delegated enforcer
 * URL: comptroller.chitty.cc
 *
 * L1: read-only observer · alerts · daily reports · forecasts
 * L2: tier_degrade signals to consuming services
 * L3: pause signals (with pause_exemption + SMS-confirm protections)
 *
 * Safe-state: cold-start defaults to L1-only for 24h.
 * Forecasting: EWMA + seasonality. NEVER uses LLM above T0.
 *
 * Data layer:
 *   - READ  : env.NEON_COMPTROLLER (Hyperdrive, comptroller_reader, read-only) → getDb(env)
 *   - WRITE : env.NEON_COMPTROLLER_WRITER (Hyperdrive over RW role)            → getWriteDb(env)
 *             Both Hyperdrive bindings expose a `.connectionString`; we drive them with
 *             porsager `postgres` (works on Workers over Hyperdrive's TCP socket).
 *             getWriteDb() FAILS CLOSED if the writer binding is absent (Phase-A blocker).
 */

import postgres from "postgres";
// AsyncLocalStorage is provided at runtime by the `nodejs_compat` flag. Its type comes
// from a minimal ambient declaration (node-async-hooks.d.ts) rather than all of @types/node.
import { AsyncLocalStorage } from "node:async_hooks";

// ---- Cloudflare Workers Hyperdrive binding (typed locally to avoid pulling full env types) ----
interface HyperdriveLike {
  connectionString: string;
}

interface Env {
  NEON_COMPTROLLER: HyperdriveLike; // comptroller_reader role (read-only)
  NEON_COMPTROLLER_WRITER?: HyperdriveLike; // RW role — Phase-A writer (provision separately)
  KV_STATE: KVNamespace;
  CF_AI_GATEWAY_TOKEN?: string;
  ANTHROPIC_BILLING_KEY?: string;
  GOOGLE_AI_STUDIO_KEY?: string;
  CF_ACCOUNT_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  COMPTROLLER_HMAC_KEY?: string;
  QUO_API_KEY?: string;
  NOTION_API_KEY?: string;
  NOTION_BUSINESS_REPORT_PAGE_ID?: string;
  NOTION_LEGALINK_REPORT_PAGE_ID?: string;
  REGISTRY_URL: string; // registry.chitty.cc
  HEARTBEAT_URL: string; // discovery.chitty.cc/heartbeat/comptroller
}

const COLD_START_AT_KEY = "cold_start_at";
const SAFE_STATE_KEY = "safe_state_active";
const BASELINE_LEARNING_KEY = "baseline_learning_until";
const BASELINE_LEARNING_DAYS = 14;

// CF account that owns the AI Gateways (ChittyCorp).
const CF_ACCOUNT_ID = "0bc21e3a5a9de1a4cc843be9c3e98121";

// Active AI Gateways to ingest. codex-orchestration is empty → skipped.
const ACTIVE_GATEWAYS = ["chittygateway", "chittycounsel", "default", "chittyclaw"];

// Per-page log fetch + pagination bound (one 5-min run must stay bounded).
const LOGS_PER_PAGE = 50;
const MAX_PAGES_PER_GATEWAY = 20;

// Phase-A hard caps (per-service MTD ceiling, USD). Real comparison; const map until
// per-service caps live in the registry/manifest.
const HARD_CAP_MTD_USD: Record<string, number> = {
  chittygateway: 50.0,
  chittycounsel: 100.0,
  default: 25.0,
  chittyclaw: 50.0,
};
const DEFAULT_HARD_CAP_MTD_USD = 50.0;

// ===================================================================================
// DB helpers
// ===================================================================================

type Sql = ReturnType<typeof postgres>;

/**
 * Per-invocation DB scope.
 *
 * On Cloudflare Workers, a porsager `postgres` client opens a TCP socket bound to the
 * request/invocation that created it. Reusing a module-global client across invocations
 * (cron + concurrent fetch) throws "Cannot perform I/O on behalf of a different request"
 * once a later invocation touches that socket — and is a cross-request state leak.
 *
 * We therefore create the client(s) ONCE per invocation and store them in an
 * AsyncLocalStorage scope (concurrency-safe: each scheduled() run and each fetch()
 * request gets its own clients). getDb/getWriteDb resolve from the active scope, so the
 * ~14 callsites stay untouched. withDbScope() ends the clients via ctx.waitUntil() after
 * the handler returns, so no connections leak.
 */
interface DbScope {
  read: Sql;
  write: Sql | null;
}

const dbScope = new AsyncLocalStorage<DbScope>();

function makeReadDb(env: Env): Sql {
  return postgres(env.NEON_COMPTROLLER.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
}

function makeWriteDb(env: Env): Sql | null {
  if (!env.NEON_COMPTROLLER_WRITER?.connectionString) return null;
  return postgres(env.NEON_COMPTROLLER_WRITER.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
}

/**
 * Run `fn` inside a fresh per-invocation DB scope and guarantee the clients are
 * closed afterwards. Closing is deferred to ctx.waitUntil so an in-flight query in
 * a floating promise can drain, but we never leave sockets open across invocations.
 */
async function withDbScope<T>(env: Env, ctx: ExecutionContext, fn: () => Promise<T>): Promise<T> {
  const scope: DbScope = { read: makeReadDb(env), write: makeWriteDb(env) };
  try {
    return await dbScope.run(scope, fn);
  } finally {
    ctx.waitUntil(scope.read.end({ timeout: 5 }).catch(() => {}));
    if (scope.write) ctx.waitUntil(scope.write.end({ timeout: 5 }).catch(() => {}));
  }
}

/** Read-only connection (comptroller_reader via Hyperdrive), scoped to this invocation. */
function getDb(_env: Env): Sql {
  const scope = dbScope.getStore();
  if (!scope) throw new Error("getDb() called outside a DB scope — wrap the handler in withDbScope()");
  return scope.read;
}

/**
 * Writer connection (RW role via a SEPARATE Hyperdrive binding), scoped to this invocation.
 * FAILS CLOSED: returns null when the writer binding is not provisioned. Callers MUST
 * treat null as "skip the write, log a clear reason" — never crash the poll.
 */
function getWriteDb(_env: Env): Sql | null {
  const scope = dbScope.getStore();
  if (!scope) throw new Error("getWriteDb() called outside a DB scope — wrap the handler in withDbScope()");
  return scope.write;
}

// ===================================================================================
// Worker entry
// ===================================================================================

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await withDbScope(env, ctx, async () => {
      await ensureColdStartState(env);
      const cronSpec = event.cron;
      if (cronSpec === "*/5 * * * *") {
        await pollMetrics(env);
      } else if (cronSpec === "0 7 * * *") {
        await emitDailyReport(env);
      } else if (cronSpec === "0 7 * * 1") {
        await emitWeeklyForecast(env);
      } else if (cronSpec === "0 9 1 * *") {
        await emitMonthlyCloseout(env);
      }
      await heartbeat(env);
    });
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return withDbScope(env, ctx, () => handleFetch(req, env));
  },
};

async function handleFetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const now = new Date().toISOString();

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "comptroller", version: "1.0.0", ts: now });
    }

    if (url.pathname === "/api/v1/status") {
      await ensureColdStartState(env);
      const authority = (await env.KV_STATE.get("authority_level")) ?? "L1";
      const baselineLearningUntil = await env.KV_STATE.get(BASELINE_LEARNING_KEY);
      const coldStartAt = await env.KV_STATE.get(COLD_START_AT_KEY);
      return Response.json({
        status: "ok",
        service: "comptroller",
        version: "1.0.0",
        authority,
        cold_start_at: coldStartAt,
        safe_state: await isSafeStateActive(env),
        baseline_learning: baselineLearningUntil ? Date.now() < Date.parse(baselineLearningUntil) : false,
        baseline_learning_until: baselineLearningUntil,
        writer_configured: !!env.NEON_COMPTROLLER_WRITER?.connectionString,
        ts: now,
      });
    }

    if (url.pathname === "/api/v1/metrics") {
      try {
        return Response.json(await fetchMetrics(env));
      } catch (e) {
        return Response.json({ status: "error", service: "comptroller", error: String(e), ts: now }, { status: 500 });
      }
    }

    if (url.pathname.endsWith("/status") && url.pathname.startsWith("/budget/")) {
      const service = url.pathname.split("/")[2];
      return Response.json(await budgetStatus(env, service));
    }

    if (url.pathname === "/reports/daily") {
      try {
        return Response.json(await fetchDailyReport(env));
      } catch (e) {
        return Response.json({ status: "error", error: String(e), ts: now }, { status: 500 });
      }
    }

    if (url.pathname === "/anomalies") {
      return Response.json(await listAnomalies(env));
    }

    if (url.pathname === "/_admin/authority" && req.method === "POST") {
      return await handleAuthorityChange(req, env);
    }

    if (url.pathname === "/_admin/baseline_learning/end" && req.method === "POST") {
      return await handleBaselineLearningEnd(req, env);
    }

    // Auth-gated manual poll trigger — forces a CF AI Gateway ingest + anomaly pass now
    // instead of waiting for the */5 cron. Bearer token must equal COMPTROLLER_HMAC_KEY
    // (constant-time compare). Same data path as the scheduled "*/5 * * * *" cron.
    if (url.pathname === "/_admin/poll" && req.method === "POST") {
      if (!(await requireAdminBearer(req, env))) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        await ensureColdStartState(env);
        await pollMetrics(env);
        return Response.json({ status: "ok", triggered: "pollMetrics", ts: now });
      } catch (e) {
        return Response.json({ status: "error", error: String(e), ts: now }, { status: 500 });
      }
    }

    return Response.json({ service: "comptroller", version: "1.0.0", status: "ok" });
}

/** Constant-time bearer-token check against COMPTROLLER_HMAC_KEY for admin routes. */
async function requireAdminBearer(req: Request, env: Env): Promise<boolean> {
  const key = env.COMPTROLLER_HMAC_KEY;
  if (!key) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const enc = new TextEncoder();
  const a = enc.encode(presented);
  const b = enc.encode(key);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

// ===================================================================================
// Cold-start / baseline-learning state
// ===================================================================================

async function ensureColdStartState(env: Env): Promise<void> {
  const cold = await env.KV_STATE.get(COLD_START_AT_KEY);
  if (!cold) {
    await env.KV_STATE.put(COLD_START_AT_KEY, String(Date.now()));
  }
  const baseline = await env.KV_STATE.get(BASELINE_LEARNING_KEY);
  if (!baseline) {
    const until = new Date(Date.now() + BASELINE_LEARNING_DAYS * 24 * 3600 * 1000).toISOString();
    await env.KV_STATE.put(BASELINE_LEARNING_KEY, until);
  }
}

// ===================================================================================
// Metric collection (every 5 min)
// ===================================================================================

async function pollMetrics(env: Env): Promise<void> {
  const results = await Promise.allSettled([
    pullCFAIGatewayAnalytics(env),
    refreshCostLedgerView(env),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[poll] source failed:", r.reason);
  }

  const anomalies = await detectAnomalies(env);

  if (anomalies.length > 0) {
    await storeAnomalies(env, anomalies);
    const safeState = await isSafeStateActive(env);
    const baselineLearning = await isBaselineLearningActive(env);

    if (!safeState && !baselineLearning) {
      for (const a of anomalies) {
        if (a.severity === "high") await emitL2Signal(env, a);
        if (a.severity === "critical" && a.suggests_l3) await emitL3Signal(env, a);
      }
    } else {
      for (const a of anomalies) {
        if (a.severity === "critical") await sendQuoAlert(env, a);
      }
    }
  }

  await checkHardCaps(env);
}

// ===================================================================================
// CF AI Gateway log ingestion (Phase A)
// ===================================================================================

interface CFLog {
  id: string;
  created_at: string;
  provider?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  cost?: number;
  timings?: { latency?: number };
  usage_metadata?: { input_cached_tokens?: number };
  metadata?: Record<string, unknown>;
}

/**
 * Deterministic tier from model name. MUST return a value allowed by the
 * chittyops.cost_ledger CHECK constraint `cost_ledger_tier_check`:
 *   T0 · T1_workspace · T1_personal · T2_haiku · T3_sonnet · T2_pro · T3_opus · manual
 * @cf/* → Workers AI (T0). Anthropic families map to their tier. Unknown external → 'manual'.
 */
function tierFromModel(model: string | undefined): string {
  if (!model) return "manual";
  const m = model.toLowerCase();
  if (m.startsWith("@cf/")) return "T0";
  if (m.includes("opus")) return "T3_opus";
  if (m.includes("sonnet")) return "T3_sonnet";
  if (m.includes("haiku")) return "T2_haiku";
  return "manual";
}

async function pullCFAIGatewayAnalytics(env: Env): Promise<void> {
  if (!env.CF_ACCOUNT_API_TOKEN) {
    console.warn("[ingest] CF_ACCOUNT_API_TOKEN not configured — skipping AI Gateway ingest");
    return;
  }
  const writeDb = getWriteDb(env);
  if (!writeDb) {
    console.warn(
      "[ingest] Phase-A: writer connection (NEON_COMPTROLLER_WRITER) not configured — " +
        "skipping cost_ledger ingest. Provision an RW Hyperdrive binding to enable writes.",
    );
    return;
  }

  const accountId = env.CF_ACCOUNT_ID ?? CF_ACCOUNT_ID;

  for (const gw of ACTIVE_GATEWAYS) {
    try {
      await ingestGateway(env, writeDb, accountId, gw);
    } catch (e) {
      console.error(`[ingest] gateway ${gw} failed:`, e);
      // tolerate per-gateway failure and continue
    }
  }
}

async function ingestGateway(env: Env, writeDb: Sql, accountId: string, gw: string): Promise<void> {
  const hwmKey = `hwm:${gw}`;
  const hwm = await env.KV_STATE.get(hwmKey); // last-ingested created_at ISO, or null
  const hwmMs = hwm ? Date.parse(hwm) : 0;

  let maxSeen = hwmMs;
  let inserted = 0;
  let page = 1;

  while (page <= MAX_PAGES_PER_GATEWAY) {
    const apiUrl =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways/${gw}/logs` +
      `?per_page=${LOGS_PER_PAGE}&page=${page}&order_by=created_at&order_by_direction=desc`;

    const resp = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${env.CF_ACCOUNT_API_TOKEN}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`logs fetch ${resp.status}: ${body.slice(0, 200)}`);
    }
    const json = (await resp.json()) as {
      success: boolean;
      result?: CFLog[];
      result_info?: { total_count?: number };
    };
    const logs = json.result ?? [];
    if (logs.length === 0) break;

    // Only logs strictly newer than the high-water mark.
    const fresh = logs.filter((l) => Date.parse(l.created_at) > hwmMs);
    if (fresh.length > 0) {
      const rows = fresh.map((l) => ({
        service: gw,
        tier: tierFromModel(l.model),
        provider: l.provider ?? "unknown",
        model: l.model ?? "unknown",
        tokens_in: Math.round(l.tokens_in ?? 0),
        tokens_out: Math.round(l.tokens_out ?? 0),
        cached_tokens_in: Math.round(l.usage_metadata?.input_cached_tokens ?? 0),
        cost_usd: Number(l.cost ?? 0),
        latency_ms: Math.round(l.timings?.latency ?? 0),
        item_id_hash: l.id,
        run_id: null as string | null,
        fallback_chain: null as string[] | null,
        ts: l.created_at,
        cost_constrained: false,
      }));

      await writeDb`
        INSERT INTO chittyops.cost_ledger ${writeDb(
          rows,
          "service",
          "tier",
          "provider",
          "model",
          "tokens_in",
          "tokens_out",
          "cached_tokens_in",
          "cost_usd",
          "latency_ms",
          "item_id_hash",
          "run_id",
          "fallback_chain",
          "ts",
          "cost_constrained",
        )}
      `;
      inserted += rows.length;
      for (const l of fresh) maxSeen = Math.max(maxSeen, Date.parse(l.created_at));
    }

    // Stop paginating once the page no longer contains logs newer than the hwm
    // (results are desc by created_at, so older pages can't be newer).
    const pageHasFresh = logs.some((l) => Date.parse(l.created_at) > hwmMs);
    if (!pageHasFresh || logs.length < LOGS_PER_PAGE) break;
    page++;
  }

  if (maxSeen > hwmMs) {
    await env.KV_STATE.put(hwmKey, new Date(maxSeen).toISOString());
  }
  if (inserted > 0) console.log(`[ingest] ${gw}: inserted ${inserted} cost_ledger rows`);
}

// ===================================================================================
// Anomaly detection (EWMA + 3-sigma)
// ===================================================================================

async function detectAnomalies(env: Env): Promise<Anomaly[]> {
  const db = getDb(env);
  let rows: Array<{ service: string; tier: string; day_ct: string; total_cost_usd: string | number }>;
  try {
    rows = (await db`
      SELECT service, tier, day_ct, total_cost_usd
      FROM chittyops.cost_ledger_daily
      WHERE day_ct >= now() - interval '14 days'
      ORDER BY service, tier, day_ct
    `) as any;
  } catch (e) {
    console.error("[detectAnomalies] query failed:", e);
    return [];
  }

  const byKey = groupBy(rows, (r) => `${r.service}:${r.tier}`);
  const anomalies: Anomaly[] = [];

  for (const [key, series] of byKey.entries()) {
    if (series.length < 7) continue;
    const today = series[series.length - 1];
    const history = series.slice(0, -1);

    const ewma = computeEWMA(history.map((r) => Number(r.total_cost_usd)));
    const stdev = computeStdev(history.map((r) => Number(r.total_cost_usd)));
    const todayActual = Number(today.total_cost_usd);
    const threshold = ewma + 3 * stdev;

    if (todayActual > threshold && stdev > 0) {
      const [service, tier] = key.split(":");
      anomalies.push({
        id: crypto.randomUUID(),
        service,
        tier,
        severity: todayActual > threshold * 2 ? "critical" : "high",
        actual: todayActual,
        expected_max: threshold,
        ewma,
        msg: `${service}/${tier}: $${todayActual.toFixed(4)} vs forecast $${ewma.toFixed(4)} (+${((todayActual / ewma - 1) * 100).toFixed(0)}%)`,
        detected_at: new Date().toISOString(),
        suggests_l3: todayActual > 5 * threshold,
      });
    }
  }

  return anomalies;
}

// ===================================================================================
// L2 / L3 signals
// ===================================================================================

async function emitL2Signal(env: Env, anomaly: Anomaly): Promise<void> {
  const service = await fetchServiceFromRegistry(env, anomaly.service);
  if (!service?.tier_degrade_endpoint) return;

  const isExempt = await isServiceExempt(env, anomaly.service);
  if (isExempt) {
    await sendQuoAlert(env, anomaly, "exempt — skipping L2 throttle");
    return;
  }

  const signal = {
    from_tier: anomaly.tier,
    to_tier: degradeTo(anomaly.tier),
    reason: `anomaly_detected:${anomaly.id}`,
    scope: "service",
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  };

  const resp = await fetch(service.tier_degrade_endpoint, {
    method: "POST",
    headers: { "X-Comptroller-Signature": await signHmac(env, signal), "Content-Type": "application/json" },
    body: JSON.stringify(signal),
  });
  await logSignalEmitted(env, "L2", anomaly.service, signal, resp.status);
}

async function emitL3Signal(env: Env, anomaly: Anomaly): Promise<void> {
  const service = await fetchServiceFromRegistry(env, anomaly.service);
  if (!service?.pause_endpoint) return;

  const isExempt = await isServiceExempt(env, anomaly.service);
  let confirmToken: string | null = null;
  if (isExempt) {
    confirmToken = await requestSMSConfirm(env, anomaly);
    if (!confirmToken) {
      await logSignalEmitted(env, "L3", anomaly.service, { reason: "sms_confirm_denied" }, 0);
      return;
    }
  }

  const signal = {
    reason: `hard_cap_breached:${anomaly.id}`,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    confirm_token: confirmToken,
  };

  const resp = await fetch(service.pause_endpoint, {
    method: "POST",
    headers: { "X-Comptroller-Signature": await signHmac(env, signal), "Content-Type": "application/json" },
    body: JSON.stringify(signal),
  });
  await logSignalEmitted(env, "L3", anomaly.service, signal, resp.status);
}

// ===================================================================================
// Admin endpoints
// ===================================================================================

async function handleAuthorityChange(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { level: string; sms_confirm_token: string };
  const validToken = await verifySMSConfirm(env, body.sms_confirm_token);
  if (!validToken) return new Response("sms confirm required", { status: 403 });

  await env.KV_STATE.put("authority_level", body.level);
  await env.KV_STATE.put(SAFE_STATE_KEY, "false");
  return Response.json({ status: "ok", level: body.level });
}

async function handleBaselineLearningEnd(req: Request, env: Env): Promise<Response> {
  const body = (await req.json()) as { sms_confirm_token: string };
  if (!(await verifySMSConfirm(env, body.sms_confirm_token))) {
    return new Response("sms confirm required", { status: 403 });
  }
  await env.KV_STATE.delete(BASELINE_LEARNING_KEY);
  return Response.json({ status: "baseline_learning_ended" });
}

// ===================================================================================
// Matview refresh — needs privileges; fail-soft if reader can't refresh
// ===================================================================================

async function refreshCostLedgerView(env: Env): Promise<void> {
  // Prefer the writer connection (has the privilege); fall back to reader (EXECUTE granted).
  const db = getWriteDb(env) ?? getDb(env);
  try {
    await db`SELECT chittyops.refresh_cost_ledger_daily()`;
  } catch (e) {
    console.warn("[refreshCostLedgerView] refresh skipped (insufficient privilege?):", String(e));
  }
}

// ===================================================================================
// Safe-state / exemptions / registry
// ===================================================================================

async function isSafeStateActive(env: Env): Promise<boolean> {
  const coldStartAt = await env.KV_STATE.get(COLD_START_AT_KEY);
  if (!coldStartAt) return true;
  const ageHrs = (Date.now() - Number(coldStartAt)) / (3600 * 1000);
  return ageHrs < 24;
}

async function isBaselineLearningActive(env: Env): Promise<boolean> {
  const until = await env.KV_STATE.get(BASELINE_LEARNING_KEY);
  if (!until) return false;
  return Date.now() < Date.parse(until);
}

async function isServiceExempt(env: Env, serviceId: string): Promise<boolean> {
  const db = getDb(env);
  try {
    const rows = (await db`
      SELECT 1 FROM chittyops.pause_exemptions WHERE service_id = ${serviceId} LIMIT 1
    `) as any[];
    return rows.length > 0;
  } catch (e) {
    console.error("[isServiceExempt] query failed:", e);
    return false; // fail-safe: do not block on lookup failure for L2/L3 gate caller
  }
}

async function fetchServiceFromRegistry(env: Env, serviceId: string): Promise<any> {
  const resp = await fetch(`${env.REGISTRY_URL}/api/v1/service/${serviceId}`);
  if (!resp.ok) return null;
  return await resp.json();
}

// ===================================================================================
// Budget / metrics / reports (real queries)
// ===================================================================================

async function budgetStatus(env: Env, serviceId: string): Promise<any> {
  const db = getDb(env);
  let row: any = {};
  try {
    const res = (await db`
      SELECT
        (SELECT coalesce(sum(cost_usd),0) FROM chittyops.cost_ledger
           WHERE service = ${serviceId}
             AND ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')) AS today,
        (SELECT coalesce(sum(cost_usd),0) FROM chittyops.cost_ledger
           WHERE service = ${serviceId}
             AND ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')) AS mtd
    `) as any[];
    row = res[0] ?? {};
  } catch (e) {
    console.error("[budgetStatus] query failed:", e);
  }
  const dailyCap = 2.0;
  const monthlyCap = HARD_CAP_MTD_USD[serviceId] ?? DEFAULT_HARD_CAP_MTD_USD;
  const today = Number(row?.today ?? 0);
  const mtd = Number(row?.mtd ?? 0);
  return {
    service: serviceId,
    daily_used_usd: today,
    daily_cap_usd: dailyCap,
    monthly_used_usd: mtd,
    monthly_cap_usd: monthlyCap,
    halt: today >= dailyCap || mtd >= monthlyCap,
    baseline_learning: await isBaselineLearningActive(env),
    authority: (await env.KV_STATE.get("authority_level")) ?? "L1",
  };
}

async function fetchMetrics(env: Env): Promise<any> {
  const db = getDb(env);
  const today = (await db`
    SELECT service, tier, coalesce(sum(cost_usd),0)::float8 AS cost_usd,
           coalesce(sum(tokens_in),0)::int AS tokens_in,
           coalesce(sum(tokens_out),0)::int AS tokens_out,
           count(*)::int AS calls
    FROM chittyops.cost_ledger
    WHERE ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')
    GROUP BY service, tier
    ORDER BY cost_usd DESC
  `) as any[];

  const mtd = (await db`
    SELECT service, tier, coalesce(sum(cost_usd),0)::float8 AS cost_usd,
           count(*)::int AS calls
    FROM chittyops.cost_ledger
    WHERE ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')
    GROUP BY service, tier
    ORDER BY cost_usd DESC
  `) as any[];

  const totalRow = (await db`SELECT count(*)::int AS total_count FROM chittyops.cost_ledger`) as any[];

  return {
    status: "ok",
    service: "comptroller",
    today: today.map((r) => ({
      service: r.service,
      tier: r.tier,
      cost_usd: Number(r.cost_usd),
      tokens_in: Number(r.tokens_in),
      tokens_out: Number(r.tokens_out),
      calls: Number(r.calls),
    })),
    mtd: mtd.map((r) => ({ service: r.service, tier: r.tier, cost_usd: Number(r.cost_usd), calls: Number(r.calls) })),
    total_count: Number(totalRow[0]?.total_count ?? 0),
    ts: new Date().toISOString(),
  };
}

async function fetchDailyReport(env: Env): Promise<any> {
  const db = getDb(env);
  const byService = (await db`
    SELECT service, coalesce(sum(cost_usd),0)::float8 AS cost_usd, count(*)::int AS calls
    FROM chittyops.cost_ledger
    WHERE ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')
    GROUP BY service
    ORDER BY cost_usd DESC
  `) as any[];

  const topDrivers = (await db`
    SELECT service, tier, model, coalesce(sum(cost_usd),0)::float8 AS cost_usd, count(*)::int AS calls
    FROM chittyops.cost_ledger
    WHERE ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')
    GROUP BY service, tier, model
    ORDER BY cost_usd DESC
    LIMIT 10
  `) as any[];

  const anomalyCount = (await db`
    SELECT count(*)::int AS n FROM chittyops.anomalies
    WHERE detected_at >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')
  `) as any[];

  const total = byService.reduce((s, r) => s + Number(r.cost_usd), 0);

  return {
    status: "ok",
    date: new Date().toISOString().slice(0, 10),
    total_cost_usd: total,
    by_service: byService.map((r) => ({ service: r.service, cost_usd: Number(r.cost_usd), calls: Number(r.calls) })),
    top_drivers: topDrivers.map((r) => ({
      service: r.service,
      tier: r.tier,
      model: r.model,
      cost_usd: Number(r.cost_usd),
      calls: Number(r.calls),
    })),
    anomaly_count: Number(anomalyCount[0]?.n ?? 0),
    ts: new Date().toISOString(),
  };
}

async function listAnomalies(env: Env): Promise<any[]> {
  const db = getDb(env);
  try {
    const rows = (await db`
      SELECT id, service, tier, severity, actual, expected_max, ewma, msg, suggests_l3, detected_at
      FROM chittyops.anomalies
      ORDER BY detected_at DESC
      LIMIT 100
    `) as any[];
    return rows.map((r) => ({
      id: r.id,
      service: r.service,
      tier: r.tier,
      severity: r.severity,
      actual: Number(r.actual),
      expected_max: Number(r.expected_max),
      ewma: Number(r.ewma),
      msg: r.msg,
      suggests_l3: r.suggests_l3,
      detected_at: r.detected_at,
    }));
  } catch (e) {
    console.error("[listAnomalies] query failed:", e);
    return [];
  }
}

async function storeAnomalies(env: Env, list: Anomaly[]): Promise<void> {
  if (list.length === 0) return;
  const writeDb = getWriteDb(env);
  if (!writeDb) {
    console.warn(
      "[storeAnomalies] Phase-A: writer connection (NEON_COMPTROLLER_WRITER) not configured — " +
        `skipping INSERT of ${list.length} anomalies into chittyops.anomalies.`,
    );
    return;
  }
  const rows = list.map((a) => ({
    id: a.id,
    service: a.service,
    tier: a.tier,
    severity: a.severity,
    actual: a.actual,
    expected_max: a.expected_max,
    ewma: a.ewma,
    msg: a.msg,
    suggests_l3: a.suggests_l3,
    detected_at: a.detected_at,
  }));
  try {
    await writeDb`
      INSERT INTO chittyops.anomalies ${writeDb(
        rows,
        "id",
        "service",
        "tier",
        "severity",
        "actual",
        "expected_max",
        "ewma",
        "msg",
        "suggests_l3",
        "detected_at",
      )}
    `;
    console.log(`[storeAnomalies] inserted ${rows.length} anomalies`);
  } catch (e) {
    console.error("[storeAnomalies] insert failed:", e);
  }
}

async function checkHardCaps(env: Env): Promise<void> {
  const db = getDb(env);
  let rows: any[] = [];
  try {
    rows = (await db`
      SELECT service, coalesce(sum(cost_usd),0)::float8 AS mtd
      FROM chittyops.cost_ledger
      WHERE ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')
      GROUP BY service
    `) as any[];
  } catch (e) {
    console.error("[checkHardCaps] query failed:", e);
    return;
  }
  for (const r of rows) {
    const cap = HARD_CAP_MTD_USD[r.service] ?? DEFAULT_HARD_CAP_MTD_USD;
    const mtd = Number(r.mtd);
    if (mtd >= cap) {
      console.warn(`[checkHardCaps] BREACH ${r.service}: MTD $${mtd.toFixed(2)} >= cap $${cap.toFixed(2)}`);
    }
  }
}

// ===================================================================================
// Reports — Notion (Phase B; guarded not-configured)
// ===================================================================================

function notionConfigured(env: Env, pageId?: string): boolean {
  return !!env.NOTION_API_KEY && !!pageId && pageId !== "REPLACE_AT_DEPLOY";
}

async function emitDailyReport(env: Env): Promise<void> {
  if (notionConfigured(env, env.NOTION_BUSINESS_REPORT_PAGE_ID)) {
    await writeNotionReport(env, env.NOTION_BUSINESS_REPORT_PAGE_ID!, await buildBusinessReport(env));
  } else {
    console.log("[report] Phase-B: Notion business report not configured, skipping");
  }
  if (notionConfigured(env, env.NOTION_LEGALINK_REPORT_PAGE_ID)) {
    await writeNotionReport(env, env.NOTION_LEGALINK_REPORT_PAGE_ID!, await buildLegalinkReport(env));
  } else {
    console.log("[report] Phase-B: Notion legalink report not configured, skipping");
  }
}

async function emitWeeklyForecast(env: Env): Promise<void> {
  if (!notionConfigured(env, env.NOTION_BUSINESS_REPORT_PAGE_ID)) {
    console.log("[report] Phase-B: Notion not configured, skipping weekly forecast");
    return;
  }
  await writeNotionReport(env, env.NOTION_BUSINESS_REPORT_PAGE_ID!, await buildBusinessReport(env));
}

async function emitMonthlyCloseout(env: Env): Promise<void> {
  if (!notionConfigured(env, env.NOTION_BUSINESS_REPORT_PAGE_ID)) {
    console.log("[report] Phase-B: Notion not configured, skipping monthly closeout");
    return;
  }
  await writeNotionReport(env, env.NOTION_BUSINESS_REPORT_PAGE_ID!, await buildBusinessReport(env));
}

/** Real report content from the cost ledger (used only when Notion IS configured). */
async function buildBusinessReport(env: Env): Promise<string> {
  const r = await fetchDailyReport(env);
  const lines = [
    `ChittyComptroller — Daily Cost Report (${r.date})`,
    `Total: $${Number(r.total_cost_usd).toFixed(4)}  ·  Anomalies: ${r.anomaly_count}`,
    "",
    "By service:",
    ...r.by_service.map((s: any) => `  - ${s.service}: $${Number(s.cost_usd).toFixed(4)} (${s.calls} calls)`),
  ];
  return lines.join("\n");
}

/** Legalink-detailed report: full per-service/tier/model breakdown. */
async function buildLegalinkReport(env: Env): Promise<string> {
  const r = await fetchDailyReport(env);
  const lines = [
    `ChittyComptroller — Legalink Daily Cost Detail (${r.date})`,
    `Total: $${Number(r.total_cost_usd).toFixed(4)}`,
    "",
    "Top drivers:",
    ...r.top_drivers.map(
      (d: any) => `  - ${d.service}/${d.tier} ${d.model}: $${Number(d.cost_usd).toFixed(4)} (${d.calls} calls)`,
    ),
  ];
  return lines.join("\n");
}

async function writeNotionReport(env: Env, pageId: string, body: string): Promise<void> {
  if (!notionConfigured(env, pageId)) {
    console.log("[notion] Phase-B: NOTION_API_KEY/page-id not configured, skipping write");
    return;
  }
  const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: body.slice(0, 1900) } }] },
        },
      ],
    }),
  });
  if (!resp.ok) console.error("[notion] write failed:", resp.status, await resp.text());
}

// ===================================================================================
// Quo (Phase B; guarded not-configured)
// ===================================================================================

async function sendQuoAlert(env: Env, anomaly: Anomaly, extra?: string): Promise<void> {
  if (!env.QUO_API_KEY) {
    console.log(
      `[quo] Phase-B: QUO_API_KEY not configured, skipping alert (${anomaly.msg}${extra ? " — " + extra : ""})`,
    );
    return;
  }
  const resp = await fetch("https://api.quo.chitty.cc/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.QUO_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: `[comptroller] ${anomaly.msg}${extra ? " — " + extra : ""}` }),
  });
  if (!resp.ok) console.error("[quo] alert failed:", resp.status);
}

async function requestSMSConfirm(env: Env, _anomaly: Anomaly): Promise<string | null> {
  if (!env.QUO_API_KEY) {
    console.log("[quo] Phase-B: QUO_API_KEY not configured, cannot request SMS confirm — denying (fail-closed)");
    return null;
  }
  // A real confirm is async (operator replies later). Phase-A returns null (no token yet),
  // which the L3 caller treats as "not confirmed" → no pause. This is the safe default.
  return null;
}

async function verifySMSConfirm(env: Env, token: string): Promise<boolean> {
  if (!env.QUO_API_KEY) {
    console.log("[quo] Phase-B: QUO_API_KEY not configured, cannot verify SMS confirm — denying (fail-closed)");
    return false;
  }
  if (!token) return false;
  const stored = await env.KV_STATE.get(`sms_confirm:${token}`);
  if (!stored) return false;
  // single-use
  await env.KV_STATE.delete(`sms_confirm:${token}`);
  return stored === "valid";
}

// ===================================================================================
// HMAC signing (real; fail-closed)
// ===================================================================================

async function signHmac(env: Env, payload: unknown): Promise<string> {
  if (!env.COMPTROLLER_HMAC_KEY) {
    throw new Error("COMPTROLLER_HMAC_KEY not configured — cannot sign signal (fail-closed)");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.COMPTROLLER_HMAC_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function logSignalEmitted(
  _env: Env,
  level: string,
  service: string,
  signal: unknown,
  status: number,
): Promise<void> {
  // Observability via tail consumer (chittytrack); structured console line is the record.
  console.log(JSON.stringify({ kind: "signal_emitted", level, service, status, signal, ts: new Date().toISOString() }));
}

async function heartbeat(env: Env): Promise<void> {
  try {
    await fetch(env.HEARTBEAT_URL, { method: "POST", body: JSON.stringify({ ts: new Date().toISOString() }) });
  } catch (e) {
    console.warn("[heartbeat] failed:", String(e));
  }
}

// ===================================================================================
// Math helpers (pure JS — no LLM)
// ===================================================================================

function computeEWMA(series: number[], alpha = 0.3): number {
  if (series.length === 0) return 0;
  let ewma = series[0];
  for (let i = 1; i < series.length; i++) ewma = alpha * series[i] + (1 - alpha) * ewma;
  return ewma;
}

function computeStdev(series: number[]): number {
  if (series.length < 2) return 0;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
  return Math.sqrt(variance);
}

function degradeTo(tier: string): string {
  const order = ["T3_sonnet", "T2_haiku", "T1_personal", "T1_workspace", "T0"];
  const idx = order.indexOf(tier);
  if (idx === -1) return "T0";
  return order[Math.min(idx + 1, order.length - 1)];
}

function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const key = keyFn(item);
    const existing = map.get(key) ?? [];
    existing.push(item);
    map.set(key, existing);
  }
  return map;
}

// ===================================================================================
// Types
// ===================================================================================

interface Anomaly {
  id: string;
  service: string;
  tier: string;
  severity: "low" | "medium" | "high" | "critical";
  actual: number;
  expected_max: number;
  ewma: number;
  msg: string;
  detected_at: string;
  suggests_l3: boolean;
}
