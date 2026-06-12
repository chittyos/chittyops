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

// ---- R4 self-monitoring KV keys ----
// Each */5 poll writes these so /api/v1/status can report REAL self-health computed live.
const LAST_POLL_OK_AT_KEY = "health:last_poll_ok_at";
const LAST_POLL_ERROR_KEY = "health:last_poll_error"; // {error, ts} JSON, or absent
const LAST_REFRESH_ERROR_KEY = "health:last_refresh_error"; // {error, ts} JSON — captures the swallowed refresh err
// Real-time matview freshness: updated to now() each poll where max(day_ct)==Chicago-today.
// The >1h staleness ALERT is derived from this, NOT from the day-granular day_ct arithmetic.
const MATVIEW_LAST_FRESH_AT_KEY = "health:matview_last_fresh_at";
// Per-gateway consecutive-failure counters: `health:src_fail:{gw}` → integer string.
const SRC_FAIL_PREFIX = "health:src_fail:";
// poll_streak: contiguous fully-successful polls. Drives partition-recovery.
const POLL_STREAK_KEY = "health:poll_streak";

// Consecutive-failure threshold for a single source before we self-alert.
const SOURCE_FAIL_ALERT_K = 3;
// Matview real-time staleness alert threshold (ms). Fires within ~1h of a freeze.
const MATVIEW_STALE_ALERT_MS = 60 * 60 * 1000;
// partition-recovery: require this many contiguous fully-good polls before clearing
// partition-safe-state (parallels the 24h cold-start L1-only window). At */5 that's ~8.3h.
const PARTITION_RECOVERY_GOOD_POLLS = 100;

// CF account that owns the AI Gateways (ChittyCorp).
const CF_ACCOUNT_ID = "0bc21e3a5a9de1a4cc843be9c3e98121";

// Active AI Gateways to ingest. codex-orchestration is empty → skipped.
const ACTIVE_GATEWAYS = ["chittygateway", "chittycounsel", "default", "chittyclaw"];

// Per-page log fetch + pagination bound (one 5-min run must stay bounded).
const LOGS_PER_PAGE = 50;
const MAX_PAGES_PER_GATEWAY = 20;

// Per-service hard caps (USD). These are the FALLBACK only — the live source of truth is
// chittyops.service_budgets (read via loadServiceBudgets). The const map is used when a
// service has no row there, or the budgets read fails.
const HARD_CAP_MTD_USD: Record<string, number> = {
  chittygateway: 50.0,
  chittycounsel: 100.0,
  default: 25.0,
  chittyclaw: 50.0,
};
const DEFAULT_HARD_CAP_MTD_USD = 50.0;

// Per-service daily caps (USD) fallback. Daily cap was previously hardcoded to 2.0 in
// budgetStatus; it now resolves through the same service_budgets source with this fallback.
const HARD_CAP_DAILY_USD: Record<string, number> = {
  chittygateway: 5.0,
  chittycounsel: 10.0,
  default: 2.0,
  chittyclaw: 5.0,
};
const DEFAULT_HARD_CAP_DAILY_USD = 2.0;

// Soft-warn threshold: emit a 'high' warn anomaly when usage crosses this fraction of cap.
const SOFT_WARN_FRACTION = 0.8;

interface ServiceBudget {
  daily_cap_usd: number;
  monthly_cap_usd: number;
}

/**
 * Resolve per-service budgets from chittyops.service_budgets (live config), falling back to
 * the const maps above per-service. Read via the reader connection (getDb). On any failure
 * we fall back entirely to the const maps so cap enforcement never silently disappears.
 */
async function loadServiceBudgets(env: Env): Promise<Map<string, ServiceBudget>> {
  const out = new Map<string, ServiceBudget>();
  const db = getDb(env);
  try {
    const rows = (await db`
      SELECT service, daily_cap_usd, monthly_cap_usd FROM chittyops.service_budgets
    `) as Array<{ service: string; daily_cap_usd: string | number; monthly_cap_usd: string | number }>;
    for (const r of rows) {
      out.set(r.service, {
        daily_cap_usd: Number(r.daily_cap_usd),
        monthly_cap_usd: Number(r.monthly_cap_usd),
      });
    }
  } catch (e) {
    console.warn("[loadServiceBudgets] read failed — using const fallback:", String(e));
  }
  return out;
}

function resolveBudget(service: string, budgets: Map<string, ServiceBudget>): ServiceBudget {
  const cfg = budgets.get(service);
  return {
    daily_cap_usd: cfg?.daily_cap_usd ?? HARD_CAP_DAILY_USD[service] ?? DEFAULT_HARD_CAP_DAILY_USD,
    monthly_cap_usd: cfg?.monthly_cap_usd ?? HARD_CAP_MTD_USD[service] ?? DEFAULT_HARD_CAP_MTD_USD,
  };
}

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
        // Operator-triggerable internal dry-run self-test: consumes a one-shot KV flag
        // (set out-of-band) so verification needs no external bearer/secret — the worker
        // already holds COMPTROLLER_HMAC_KEY. Self-clears; result lands in signals_emitted.
        await maybeRunDryRunSelfTest(env);
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
      const selfHealth = await buildSelfHealth(env);
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
        self_health: selfHealth,
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

    // P1-3: recent signal audit rows (newest first).
    if (url.pathname === "/api/v1/signals") {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));
      return Response.json({ service: "comptroller", signals: await listSignals(env, limit), ts: now });
    }

    // Auth-gated dry-run signal: drives the REAL delivery funnel + feedback loop with a 60s
    // self-reverting expiry. Proves the full path (HMAC POST → 200 → KV override → auto-expire →
    // audit row → feedback marker create+resolve) WITHOUT a lasting effect. Bearer = HMAC key.
    // Body (optional): { service?: string, level?: "L2"|"L3", gated?: boolean }
    //   gated:true exercises the gated_baseline path (real DB decision, no POST).
    if (url.pathname === "/_admin/dryrun_signal" && req.method === "POST") {
      if (!(await requireAdminBearer(req, env))) return new Response("forbidden", { status: 403 });
      return await handleDryRunSignal(req, env);
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
  // R4: collect REAL per-source outcomes (the inner try/catch in each source swallows errors,
  // so Promise.allSettled would falsely report "fulfilled"; we therefore have each source RETURN
  // its per-unit ok/fail and thread that up so poll_streak + per-gateway counters are accurate).
  let ingestResults: Array<{ gw: string; ok: boolean; error?: string }> = [];
  let refreshOk = true;
  let refreshErr: string | undefined;
  const [ingestSettled, refreshSettled] = await Promise.allSettled([
    pullCFAIGatewayAnalytics(env),
    refreshCostLedgerView(env),
  ]);
  if (ingestSettled.status === "fulfilled") {
    ingestResults = ingestSettled.value;
  } else {
    console.error("[poll] ingest source threw:", ingestSettled.reason);
    // Whole ingest pass threw → treat every active gateway as failed this poll.
    ingestResults = ACTIVE_GATEWAYS.map((gw) => ({ gw, ok: false, error: String(ingestSettled.reason) }));
  }
  if (refreshSettled.status === "fulfilled") {
    refreshOk = refreshSettled.value.ok;
    refreshErr = refreshSettled.value.error;
  } else {
    refreshOk = false;
    refreshErr = String(refreshSettled.reason);
  }

  // R4 self-monitoring: update KV health fields + emit self-health anomalies on failure.
  await updateSelfHealth(env, ingestResults, { ok: refreshOk, error: refreshErr });

  const anomalies = await detectAnomalies(env);

  if (anomalies.length > 0) {
    await storeAnomalies(env, anomalies);
    const safeState = await isSafeStateActive(env);
    const baselineLearning = await isBaselineLearningActive(env);

    // Gating now lives INSIDE deliverSignal: emit* always runs and ALWAYS writes an audit row
    // (delivered_200 when live, gated_baseline during baseline/safe-state — never POSTs then).
    for (const a of anomalies) {
      if (a.severity === "high") await emitL2Signal(env, a);
      if (a.severity === "critical" && a.suggests_l3) await emitL3Signal(env, a);
      // During baseline/safe-state, also page the operator for criticals.
      if ((safeState || baselineLearning) && a.severity === "critical") await sendQuoAlert(env, a);
    }
  }

  await checkHardCaps(env);
  await runFeedbackLoop(env);
}

// ===================================================================================
// R4 — self-monitoring: the comptroller surfaces ITS OWN failures so it never runs blind.
//
// Each */5 poll calls updateSelfHealth() with the REAL per-source outcomes. It:
//   - writes last_poll_ok_at (success) or last_poll_error (failure) to KV
//   - maintains per-gateway consecutive-failure counters (reset on success)
//   - tracks matview real-time freshness (matview_last_fresh_at) — the >1h staleness alert is
//     derived from this wall-clock timestamp, NOT from day-granular day_ct arithmetic
//   - maintains poll_streak (contiguous fully-good polls) for partition-recovery
//   - on stale matview >1h, K consecutive source failures, or a refresh error → writes a
//     self-health row to chittyops.anomalies (service='comptroller') AND pages Quo (guarded)
//
// Self-health anomalies are de-duped once/day-per-failure-type (like checkHardCaps) so a
// persistent failure does not write ~288 append-only rows/day.
// ===================================================================================

/** Compute the live matview self-health snapshot (max day + real-time staleness). */
async function matviewHealth(
  env: Env,
): Promise<{ matview_max_day: string | null; matview_stale: boolean; matview_last_fresh_at: string | null; matview_stale_ms: number | null }> {
  const db = getDb(env);
  let maxDay: string | null = null;
  let staleDayGranular = true;
  try {
    const rows = (await db`
      SELECT max(day_ct) AS max_day,
             (now() AT TIME ZONE 'America/Chicago')::date AS chicago_today
      FROM chittyops.cost_ledger_daily
    `) as Array<{ max_day: string | null; chicago_today: string }>;
    const r = rows[0];
    maxDay = r?.max_day ?? null;
    if (maxDay && r?.chicago_today) {
      // coarse day-granular bool: max_day < (chicago_today - 1 day)
      const maxMs = Date.parse(maxDay);
      const yesterdayMs = Date.parse(r.chicago_today) - 24 * 3600 * 1000;
      staleDayGranular = maxMs < yesterdayMs;
    }
  } catch (e) {
    console.error("[matviewHealth] query failed:", String(e));
  }
  const lastFresh = await env.KV_STATE.get(MATVIEW_LAST_FRESH_AT_KEY);
  const staleMs = lastFresh ? Date.now() - Date.parse(lastFresh) : null;
  return {
    matview_max_day: maxDay,
    matview_stale: staleDayGranular,
    matview_last_fresh_at: lastFresh,
    matview_stale_ms: staleMs,
  };
}

/**
 * Update KV self-health fields each poll + self-alert on failure. Called from pollMetrics with
 * the real per-source results. NEVER throws — self-monitoring must not break the poll.
 */
async function updateSelfHealth(
  env: Env,
  ingest: IngestResult[],
  refresh: { ok: boolean; error?: string },
): Promise<void> {
  try {
    const nowIso = new Date().toISOString();

    // --- per-gateway consecutive failure counters ---
    const failedGateways: string[] = [];
    for (const r of ingest) {
      const key = `${SRC_FAIL_PREFIX}${r.gw}`;
      if (r.ok) {
        await env.KV_STATE.delete(key);
      } else {
        const prev = Number((await env.KV_STATE.get(key)) ?? "0") || 0;
        const next = prev + 1;
        await env.KV_STATE.put(key, String(next));
        if (next >= SOURCE_FAIL_ALERT_K) failedGateways.push(`${r.gw}(${next})`);
      }
    }
    const anySourceFailed = ingest.some((r) => !r.ok) || !refresh.ok;

    // --- matview real-time freshness ---
    const mv = await matviewHealth(env);
    // Verification hook: a one-shot KV flag forces the >1h stale-alert critical path live by
    // skipping the freshness bump this poll AND backdating matview_last_fresh_at past the
    // threshold — simulating the "refresh succeeds but data stalls" case the matview-stale alert
    // backstops (the swallowed-refresh-error case is covered by health:simulate_refresh_fail).
    // Self-clears after one poll.
    const simulateStale = !!(await env.KV_STATE.get(SIMULATE_MATVIEW_STALE_FLAG));
    if (simulateStale) {
      await env.KV_STATE.delete(SIMULATE_MATVIEW_STALE_FLAG);
      await env.KV_STATE.put(
        MATVIEW_LAST_FRESH_AT_KEY,
        new Date(Date.now() - MATVIEW_STALE_ALERT_MS - 60_000).toISOString(),
      );
    } else if (mv.matview_max_day) {
      // If the matview now reflects Chicago-today, record wall-clock freshness.
      const chicagoTodayMs = Date.parse(
        ((await getDb(env)`SELECT (now() AT TIME ZONE 'America/Chicago')::date AS d`) as Array<{ d: string }>)[0].d,
      );
      if (Date.parse(mv.matview_max_day) >= chicagoTodayMs) {
        await env.KV_STATE.put(MATVIEW_LAST_FRESH_AT_KEY, nowIso);
      }
    }
    // Recompute staleness window after the possible write.
    const lastFresh = await env.KV_STATE.get(MATVIEW_LAST_FRESH_AT_KEY);
    const matviewStaleMs = lastFresh ? Date.now() - Date.parse(lastFresh) : null;
    const matviewStaleAlert = matviewStaleMs !== null && matviewStaleMs > MATVIEW_STALE_ALERT_MS;

    // --- poll_streak (contiguous fully-good polls) for partition-recovery ---
    if (anySourceFailed) {
      await env.KV_STATE.put(POLL_STREAK_KEY, "0");
    } else {
      const prev = Number((await env.KV_STATE.get(POLL_STREAK_KEY)) ?? "0") || 0;
      await env.KV_STATE.put(POLL_STREAK_KEY, String(prev + 1));
    }

    // --- last_poll_ok_at / last_poll_error ---
    if (anySourceFailed) {
      const detail = {
        ts: nowIso,
        failed_gateways: ingest.filter((r) => !r.ok).map((r) => r.gw),
        refresh_ok: refresh.ok,
        refresh_error: refresh.error?.slice(0, 300),
      };
      await env.KV_STATE.put(LAST_POLL_ERROR_KEY, JSON.stringify(detail));
    } else {
      await env.KV_STATE.put(LAST_POLL_OK_AT_KEY, nowIso);
      await env.KV_STATE.delete(LAST_POLL_ERROR_KEY);
    }

    // --- self-health anomalies (de-duped once/day per failure type) ---
    const selfAnomalies: Anomaly[] = [];
    if (matviewStaleAlert) {
      selfAnomalies.push(
        selfHealthAnomaly(
          "critical",
          `matview frozen: cost_ledger_daily not fresh for ${Math.round((matviewStaleMs ?? 0) / 60000)}m ` +
            `(last fresh ${lastFresh}); refresh_cost_ledger_daily may be erroring`,
        ),
      );
    }
    if (!refresh.ok) {
      selfAnomalies.push(
        selfHealthAnomaly("high", `matview refresh error: ${(refresh.error ?? "unknown").slice(0, 200)}`),
      );
    }
    if (failedGateways.length > 0) {
      selfAnomalies.push(
        selfHealthAnomaly(
          "high",
          `gateway ingest failing ${SOURCE_FAIL_ALERT_K}+ consecutive polls: ${failedGateways.join(", ")}`,
        ),
      );
    }

    const day = nowIso.slice(0, 10);
    const toStore: Anomaly[] = [];
    for (const a of selfAnomalies) {
      // dedup key by msg-prefix kind + severity + day
      const kind = a.msg.split(":")[0];
      const dedupKey = `selfhealth_alerted:${kind}:${a.severity}:${day}`;
      if (await env.KV_STATE.get(dedupKey)) continue;
      await env.KV_STATE.put(dedupKey, "1", { expirationTtl: 36 * 3600 });
      toStore.push(a);
    }
    if (toStore.length > 0) {
      await storeAnomalies(env, toStore);
      for (const a of toStore) await sendQuoAlert(env, a, "comptroller self-health");
    }
  } catch (e) {
    // Last-resort: self-monitoring failure is itself logged to chittytrack, never crashes the poll.
    console.error("[updateSelfHealth] failed:", String(e));
  }
}

function selfHealthAnomaly(severity: "high" | "critical", msg: string): Anomaly {
  return {
    id: crypto.randomUUID(),
    service: "comptroller",
    tier: "self",
    severity,
    actual: 0,
    expected_max: 0,
    ewma: 0,
    msg,
    detected_at: new Date().toISOString(),
    suggests_l3: false,
  };
}

/**
 * Build the live self-health block for GET /api/v1/status. Every field is computed at request
 * time (matview from a direct query; poll/refresh/hwm from KV written by the last poll).
 */
async function buildSelfHealth(env: Env): Promise<Record<string, unknown>> {
  const mv = await matviewHealth(env);
  const matviewStaleAlert =
    mv.matview_stale_ms !== null && mv.matview_stale_ms > MATVIEW_STALE_ALERT_MS;

  const lastPollOkAt = await env.KV_STATE.get(LAST_POLL_OK_AT_KEY);
  const lastPollErrorRaw = await env.KV_STATE.get(LAST_POLL_ERROR_KEY);
  const lastRefreshErrorRaw = await env.KV_STATE.get(LAST_REFRESH_ERROR_KEY);
  const pollStreak = Number((await env.KV_STATE.get(POLL_STREAK_KEY)) ?? "0") || 0;

  // Per-gateway HWM age (minutes) + consecutive failure counts.
  const gateways: Record<
    string,
    { hwm: string | null; hwm_age_min: number | null; consecutive_failures: number; pagination_saturated: boolean }
  > = {};
  for (const gw of ACTIVE_GATEWAYS) {
    const hwm = await env.KV_STATE.get(`hwm:${gw}`);
    const ageMin = hwm ? Math.round((Date.now() - Date.parse(hwm)) / 60000) : null;
    const fails = Number((await env.KV_STATE.get(`${SRC_FAIL_PREFIX}${gw}`)) ?? "0") || 0;
    const saturated = !!(await env.KV_STATE.get(`${PAGINATION_SATURATED_PREFIX}${gw}`));
    gateways[gw] = { hwm, hwm_age_min: ageMin, consecutive_failures: fails, pagination_saturated: saturated };
  }

  const parse = (raw: string | null) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  return {
    matview_max_day: mv.matview_max_day,
    matview_stale: mv.matview_stale, // coarse day-granular bool
    matview_last_fresh_at: mv.matview_last_fresh_at,
    matview_stale_minutes: mv.matview_stale_ms === null ? null : Math.round(mv.matview_stale_ms / 60000),
    matview_stale_alert: matviewStaleAlert, // real-time >1h freeze alert
    last_poll_ok_at: lastPollOkAt,
    last_poll_error: parse(lastPollErrorRaw),
    last_refresh_error: parse(lastRefreshErrorRaw),
    poll_streak: pollStreak,
    partition_ready: pollStreak >= PARTITION_RECOVERY_GOOD_POLLS,
    partition_recovery_threshold: PARTITION_RECOVERY_GOOD_POLLS,
    gateways,
  };
}

/** partition-recovery: true once poll_streak has reached the contiguous-good threshold. */
async function isPartitionReady(env: Env): Promise<boolean> {
  const streak = Number((await env.KV_STATE.get(POLL_STREAK_KEY)) ?? "0") || 0;
  return streak >= PARTITION_RECOVERY_GOOD_POLLS;
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
 * @cf/* → Workers AI (T0). Anthropic families map to their tier. OpenAI + Google map to
 * the closest tier by capability/price band. Routers (dynamic/*) and unknowns → 'manual'.
 *
 * NOTE: "mini"/"flash" (cheap small models) are checked BEFORE the broad family token,
 * because e.g. "gpt-4o-mini" contains "gpt-4o" — small-model checks must win.
 */
function tierFromModel(model: string | undefined): string {
  if (!model) return "manual";
  const m = model.toLowerCase();
  if (m.startsWith("@cf/")) return "T0";

  // Anthropic
  if (m.includes("opus")) return "T3_opus";
  if (m.includes("sonnet")) return "T3_sonnet";
  if (m.includes("haiku")) return "T2_haiku";

  // OpenAI — small/cheap first, then flagship band.
  if (m.includes("gpt") && (m.includes("mini") || m.includes("nano"))) return "T2_haiku";
  if (m.includes("o1-mini") || m.includes("o3-mini") || m.includes("o4-mini")) return "T2_haiku";
  // gpt-4o / gpt-4.1 / gpt-4-turbo / o1 / o3 flagship-class → frontier tier.
  if (m.includes("gpt-4") || m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "T3_sonnet";
  if (m.includes("gpt-3.5")) return "T2_haiku";

  // Google Gemini — flash (cheap) first, then pro.
  if (m.includes("gemini") && m.includes("flash")) return "T2_haiku";
  if (m.includes("gemini") && m.includes("pro")) return "T2_pro";
  if (m.includes("gemini")) return "T2_pro";

  // Routers (e.g. dynamic/three-wise-men) + unknown external → manual.
  return "manual";
}

interface IngestResult {
  gw: string;
  ok: boolean;
  error?: string;
}

async function pullCFAIGatewayAnalytics(env: Env): Promise<IngestResult[]> {
  if (!env.CF_ACCOUNT_API_TOKEN) {
    console.warn("[ingest] CF_ACCOUNT_API_TOKEN not configured — skipping AI Gateway ingest");
    // Not-configured is NOT a source failure (it's a deploy-time choice) — report ok so
    // poll_streak is not held down forever in environments without the token.
    return ACTIVE_GATEWAYS.map((gw) => ({ gw, ok: true }));
  }
  const writeDb = getWriteDb(env);
  if (!writeDb) {
    console.warn(
      "[ingest] Phase-A: writer connection (NEON_COMPTROLLER_WRITER) not configured — " +
        "skipping cost_ledger ingest. Provision an RW Hyperdrive binding to enable writes.",
    );
    return ACTIVE_GATEWAYS.map((gw) => ({ gw, ok: true }));
  }

  const accountId = env.CF_ACCOUNT_ID ?? CF_ACCOUNT_ID;
  const results: IngestResult[] = [];

  for (const gw of ACTIVE_GATEWAYS) {
    try {
      await ingestGateway(env, writeDb, accountId, gw);
      results.push({ gw, ok: true });
    } catch (e) {
      console.error(`[ingest] gateway ${gw} failed:`, e);
      // tolerate per-gateway failure and continue — but REPORT it (R4: no silent blindness).
      results.push({ gw, ok: false, error: String(e) });
    }
  }
  return results;
}

// KV flag recording that a gateway saturated its page budget on the last poll and is still
// catching up. Surfaced in /api/v1/status.self_health and cleared on a non-saturated poll.
const PAGINATION_SATURATED_PREFIX = "health:saturated:";

/**
 * Ingest fresh logs for one gateway.
 *
 * P1-2 (convergent saturation fix): we paginate ASCENDING (oldest-first) from the high-water
 * mark using the API's server-side `created_at gt {hwm}` filter, and advance the HWM to the
 * NEWEST row actually ingested this run.
 *
 * Why ascending + server-side filter (vs the old desc + advance-to-newest-seen): with desc
 * order, a >1000-log window orphans the OLDEST fresh rows (they sit just above the HWM, below
 * the page-20 budget) FOREVER — each poll re-fetches the newest 1000 (dedup no-op) and never
 * reaches them. Ascending climbs forward from the HWM: page 1 starts just above the last
 * ingested row, we insert in created_at order, and advance the HWM to the newest ingested. If
 * we hit MAX_PAGES with a still-full last page (saturation), we simply haven't caught up yet —
 * the NEXT poll resumes from the advanced HWM and continues upward. No row is ever skipped;
 * the ON CONFLICT(item_id_hash) dedup makes any boundary overlap a harmless no-op. Converges
 * over polls even under chittygateway's 2000+/day bursts.
 */
async function ingestGateway(env: Env, writeDb: Sql, accountId: string, gw: string): Promise<void> {
  const hwmKey = `hwm:${gw}`;
  const hwm = await env.KV_STATE.get(hwmKey); // last-ingested created_at ISO, or null
  const hwmMs = hwm ? Date.parse(hwm) : 0;

  let maxSeen = hwmMs;
  let inserted = 0;
  let page = 1;
  let lastPageFull = false; // did the final fetched page return a full LOGS_PER_PAGE batch?
  let pagesUsed = 0;

  while (page <= MAX_PAGES_PER_GATEWAY) {
    let apiUrl =
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai-gateway/gateways/${gw}/logs` +
      `?per_page=${LOGS_PER_PAGE}&page=${page}&order_by=created_at&order_by_direction=asc`;
    // Server-side filter: logs at-or-after the HWM (ascending, so page 1 begins at the HWM
    // boundary). We use `gt` here but ALSO inclusively re-fetch the exact-HWM cluster below via
    // the `>= hwmMs` client filter so a row sharing the HWM's exact millisecond can never be
    // orphaned at a saturation cut (the ON CONFLICT(item_id_hash) dedup makes the re-fetch a
    // harmless no-op). This is the drop-safe boundary the task requires.
    if (hwm) {
      // `gte` would re-pull the single boundary row every poll; the API has no gte operator, so
      // we widen the server filter by 1ms below the HWM and let the client `>= hwmMs` keep the
      // boundary cluster. Net: no row at the boundary ms is ever skipped.
      const boundary = new Date(Math.max(0, hwmMs - 1)).toISOString();
      const filters = JSON.stringify([{ key: "created_at", operator: "gt", value: [boundary] }]);
      apiUrl += `&filters=${encodeURIComponent(filters)}`;
    }

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
    pagesUsed = page;
    if (logs.length === 0) {
      lastPageFull = false;
      break;
    }
    lastPageFull = logs.length >= LOGS_PER_PAGE;

    // Client-side filter: INCLUSIVE of the HWM millisecond (`>=`) so a row sharing the boundary
    // ms with the last-ingested row is always re-ingested rather than skipped. Dedup makes the
    // overlap a no-op. maxSeen never moves backward (it starts at hwmMs).
    const fresh = logs.filter((l) => Date.parse(l.created_at) >= hwmMs);
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
        ON CONFLICT DO NOTHING
      `;
      inserted += rows.length;
      for (const l of fresh) maxSeen = Math.max(maxSeen, Date.parse(l.created_at));
    }

    // Last (or only) page wasn't full → we've drained the backlog for this gateway.
    if (!lastPageFull) break;
    page++;
  }

  // Advance HWM to the NEWEST ingested row. Because we paginate ascending from the old HWM, the
  // newest ingested row is always > old HWM and monotonic — so the next poll resumes ABOVE here.
  if (maxSeen > hwmMs) {
    await env.KV_STATE.put(hwmKey, new Date(maxSeen).toISOString());
  }

  // Saturation = we exhausted the page budget AND the last page was still full → more fresh rows
  // remain above maxSeen. NOT an error (no rows dropped — we advanced the HWM, next poll resumes
  // upward), but we surface it as self-health so a chronically-saturated gateway is visible.
  const saturated = pagesUsed >= MAX_PAGES_PER_GATEWAY && lastPageFull;
  const satKey = `${PAGINATION_SATURATED_PREFIX}${gw}`;
  if (saturated) {
    await env.KV_STATE.put(satKey, JSON.stringify({ ts: new Date().toISOString(), ingested: inserted }), {
      expirationTtl: 36 * 3600,
    });
    console.warn(`[ingest] pagination saturated ${gw}: ingested ${inserted} this run, more remain — resumes next poll`);
    // Self-health anomaly (de-duped once/day) so chronic saturation is alertable.
    const day = new Date().toISOString().slice(0, 10);
    const dedupKey = `selfhealth_alerted:pagination:high:${gw}:${day}`;
    if (!(await env.KV_STATE.get(dedupKey))) {
      await env.KV_STATE.put(dedupKey, "1", { expirationTtl: 36 * 3600 });
      await storeAnomalies(env, [
        selfHealthAnomaly("high", `pagination saturated ${gw}: ${MAX_PAGES_PER_GATEWAY}×${LOGS_PER_PAGE} budget hit, catching up over polls`),
      ]);
    }
  } else {
    await env.KV_STATE.delete(satKey);
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

/**
 * Window the override lasts, in ms. Real signals use the full window; dry-run signals use a
 * very short window (DRY_RUN_EXPIRY_MS) so the ChittyRouter KV override auto-reverts almost
 * immediately — proving the delivery path end-to-end WITHOUT a lasting effect.
 */
const L2_EXPIRY_MS = 24 * 3600 * 1000;
const L3_EXPIRY_MS = 3600 * 1000;
// ChittyRouter clamps expirationTtl to a 60s floor (Math.max(60, ...)); use 60s so the dry-run
// override genuinely self-expires at the KV layer rather than only at read-time.
const DRY_RUN_EXPIRY_MS = 60 * 1000;

interface DeliveryResult {
  signal_id: string;
  outcome: string;
  http_status: number | null;
}

/**
 * THE single delivery funnel. Every L2/L3 decision — real, gated-skip, exempt, endpoint-missing,
 * or dry-run — flows through here and ALWAYS writes a signals_emitted audit row (P1-3). The
 * gating decision lives INSIDE this function (not at the callsite) so a `gated_baseline` row is
 * recorded even during baseline_learning when no real POST happens. This also guarantees the
 * bytes we sign are the exact bytes we POST (signHmac + fetch both consume one `body` string).
 *
 * SOVEREIGNTY GATE: when `gated` is true and `dryRun` is false, we NEVER POST — we record the
 * gated outcome and return. Real autonomous L2/L3 emission stays disabled during baseline.
 */
async function deliverSignal(
  env: Env,
  opts: {
    level: "L2" | "L3";
    service: string;
    endpoint: string | null | undefined;
    endpointDisabled?: boolean;
    signal: Record<string, unknown>;
    gated: boolean;
    dryRun: boolean;
    confirmToken?: string | null;
    reason?: string;
    skipGatedDedup?: boolean; // admin verification exercise bypasses the once/day gated guard
  },
): Promise<DeliveryResult> {
  const signalId = crypto.randomUUID();
  const base = {
    signal_id: signalId,
    level: opts.level,
    service: opts.service,
    dry_run: opts.dryRun,
    confirm_token: opts.confirmToken ?? null,
  };

  // No deliverable endpoint configured (or disabled) → record + stop. Never POST.
  if (opts.endpointDisabled) {
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: null, outcome: "endpoint_disabled", reason: opts.reason ?? "service_endpoints.enabled = false" });
    return { signal_id: signalId, outcome: "endpoint_disabled", http_status: null };
  }
  if (!opts.endpoint) {
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: null, outcome: "endpoint_404", reason: opts.reason ?? "no delivery endpoint for service" });
    return { signal_id: signalId, outcome: "endpoint_404", http_status: null };
  }

  // SOVEREIGNTY GATE — gated real emission never POSTs. Dry-run bypasses the gate (it is the
  // explicit verification path and uses a 60s self-reverting expiry).
  if (opts.gated && !opts.dryRun) {
    // Once/day dedup so a persistent anomaly during baseline does not write ~288 rows/day
    // (the */5 cron re-detects every poll). The detection itself stays durable in
    // chittyops.anomalies via storeAnomalies; this only bounds the gated audit row.
    if (!opts.skipGatedDedup && (await gatedAuditAlreadyToday(env, opts.service, opts.level))) {
      return { signal_id: signalId, outcome: "gated_baseline", http_status: null };
    }
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: null, outcome: "gated_baseline", reason: opts.reason ?? "baseline_learning/safe-state active — no POST" });
    return { signal_id: signalId, outcome: "gated_baseline", http_status: null };
  }

  // Sign + POST the EXACT same bytes.
  let body: string;
  let sig: string;
  try {
    body = JSON.stringify(opts.signal);
    sig = await signHmac(env, opts.signal); // signs JSON.stringify(opts.signal) === body
  } catch (e) {
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: null, outcome: "hmac_failed", reason: String(e) });
    return { signal_id: signalId, outcome: "hmac_failed", http_status: null };
  }

  try {
    const resp = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "X-Comptroller-Signature": sig, "Content-Type": "application/json" },
      body,
    });
    const ok = resp.status >= 200 && resp.status < 300;
    const outcome = opts.dryRun ? (ok ? "dry_run_ok" : "delivery_error") : ok ? "delivered_200" : "delivery_error";
    let reason = opts.reason;
    if (!ok) reason = `${reason ? reason + "; " : ""}router responded ${resp.status}: ${(await resp.text()).slice(0, 160)}`;
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: resp.status, outcome, reason });
    return { signal_id: signalId, outcome, http_status: resp.status };
  } catch (e) {
    await recordSignal(env, { ...base, signal_json: opts.signal, http_status: null, outcome: "delivery_error", reason: String(e) });
    return { signal_id: signalId, outcome: "delivery_error", http_status: null };
  }
}

/**
 * Once/day guard for the GATED audit row on the cron path, keyed by service+level+day. Prevents
 * a persistent anomaly from writing a gated_baseline row every 5 min during baseline_learning.
 * Returns true if a row was already written today (caller should skip the write). Idempotent set.
 */
async function gatedAuditAlreadyToday(env: Env, service: string, level: string): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `gated_audit:${level}:${service}:${day}`;
  if (await env.KV_STATE.get(key)) return true;
  await env.KV_STATE.put(key, "1", { expirationTtl: 36 * 3600 });
  return false;
}

function buildL2Signal(anomaly: Anomaly, expiryMs: number): Record<string, unknown> {
  return {
    from_tier: anomaly.tier,
    to_tier: degradeTo(anomaly.tier),
    reason: `anomaly_detected:${anomaly.id}`,
    scope: "service",
    expires_at: new Date(Date.now() + expiryMs).toISOString(),
  };
}

async function emitL2Signal(env: Env, anomaly: Anomaly, dryRun = false): Promise<DeliveryResult> {
  const svc = await fetchServiceFromRegistry(env, anomaly.service);
  const endpointDisabled = !!svc?.__disabled;
  const gated = (await isSafeStateActive(env)) || (await isBaselineLearningActive(env)) || !(await isPartitionReady(env));

  // Exemption: an exempt service is alerted, not auto-throttled. Record the skip.
  if (!endpointDisabled && (await isServiceExempt(env, anomaly.service))) {
    await sendQuoAlert(env, anomaly, "exempt — skipping L2 throttle");
    const signalId = crypto.randomUUID();
    await recordSignal(env, {
      signal_id: signalId, level: "L2", service: anomaly.service, dry_run: dryRun,
      confirm_token: null, signal_json: buildL2Signal(anomaly, dryRun ? DRY_RUN_EXPIRY_MS : L2_EXPIRY_MS),
      http_status: null, outcome: "exempt_skip", reason: "pause_exemptions hit — alert only",
    });
    return { signal_id: signalId, outcome: "exempt_skip", http_status: null };
  }

  const signal = buildL2Signal(anomaly, dryRun ? DRY_RUN_EXPIRY_MS : L2_EXPIRY_MS);
  const result = await deliverSignal(env, {
    level: "L2", service: anomaly.service, endpoint: svc?.tier_degrade_endpoint,
    endpointDisabled, signal, gated, dryRun, reason: dryRun ? "dry-run verification (60s self-revert)" : undefined,
  });

  // On a real (non-dry-run) delivered throttle, open a feedback marker so the loop can verify
  // effectiveness and auto-resume. Dry-run delivery is exercised separately by the admin route.
  if (!dryRun && result.outcome === "delivered_200") {
    await openFeedbackMarker(env, result.signal_id, anomaly, (signal.expires_at as string));
  }
  return result;
}

async function emitL3Signal(env: Env, anomaly: Anomaly, dryRun = false): Promise<DeliveryResult> {
  const svc = await fetchServiceFromRegistry(env, anomaly.service);
  const endpointDisabled = !!svc?.__disabled;
  const gated = (await isSafeStateActive(env)) || (await isBaselineLearningActive(env)) || !(await isPartitionReady(env));

  let confirmToken: string | null = null;
  if (!endpointDisabled && (await isServiceExempt(env, anomaly.service))) {
    confirmToken = await requestSMSConfirm(env, anomaly);
    if (!confirmToken) {
      const signalId = crypto.randomUUID();
      await recordSignal(env, {
        signal_id: signalId, level: "L3", service: anomaly.service, dry_run: dryRun,
        confirm_token: null, signal_json: { reason: `hard_cap_breached:${anomaly.id}` },
        http_status: null, outcome: "sms_confirm_denied", reason: "exempt service — SMS confirm not granted",
      });
      return { signal_id: signalId, outcome: "sms_confirm_denied", http_status: null };
    }
  }

  const signal = {
    reason: `hard_cap_breached:${anomaly.id}`,
    expires_at: new Date(Date.now() + (dryRun ? DRY_RUN_EXPIRY_MS : L3_EXPIRY_MS)).toISOString(),
    confirm_token: confirmToken,
  };
  return await deliverSignal(env, {
    level: "L3", service: anomaly.service, endpoint: svc?.pause_endpoint,
    endpointDisabled, signal, gated, dryRun, confirmToken,
    reason: dryRun ? "dry-run verification (60s self-revert)" : undefined,
  });
}

// ===================================================================================
// Admin endpoints
// ===================================================================================

/**
 * Admin dry-run: exercise the real delivery + feedback path with no lasting harm.
 *
 * - dryRun L2 to ChittyRouter: signs+POSTs a real signal with a 60s expiry (router clamps to a
 *   60s self-expiring KV override), records 'dry_run_ok' on HTTP 200.
 * - gated:true variant: runs the SAME funnel with gated=true → records 'gated_baseline', no POST.
 * - feedback proof: opens a marker then advances it twice inline — once with a future expiry
 *   while run-rate is unchanged (→ 'escalated' or 'effective'), once with an already-elapsed
 *   expiry (→ 'resolved', marker cleared). All real KV + real append rows, no waiting on cron.
 */
const DRYRUN_SELFTEST_FLAG = "dryrun_selftest_pending";
const DRYRUN_SELFTEST_RESULT = "dryrun_selftest_result";

/**
 * Consume a one-shot dry-run self-test flag from KV (set by an operator/CI out-of-band) and
 * run the SAME dry-run path as the bearer-gated route — but with no external auth, since the
 * worker already holds COMPTROLLER_HMAC_KEY. Self-clears the flag and stashes the result JSON
 * in KV (DRYRUN_SELFTEST_RESULT) so it can be read back without the bearer.
 *
 * SECURITY MODEL: runDryRun only ever performs a dry-run (60s self-reverting expiry) or a gated
 * no-POST exercise — it can NEVER cause a lasting degrade/pause. The trigger is a write to the
 * worker's own KV_STATE (same trust boundary as a CF Secret). It is therefore bounded-safe to
 * keep permanently as the operator's no-secret verification path. Removable as a follow-up if an
 * external-bearer-only posture is preferred (would require a redeploy).
 */
async function maybeRunDryRunSelfTest(env: Env): Promise<void> {
  const raw = await env.KV_STATE.get(DRYRUN_SELFTEST_FLAG);
  if (!raw) return;
  await env.KV_STATE.delete(DRYRUN_SELFTEST_FLAG); // consume first → idempotent, no re-run
  let opts: { service?: string; level?: string; gated?: boolean } = {};
  try {
    opts = JSON.parse(raw);
  } catch {
    /* empty flag → defaults */
  }
  try {
    const result = await runDryRun(env, opts);
    await env.KV_STATE.put(DRYRUN_SELFTEST_RESULT, JSON.stringify({ ...result, ran_at: new Date().toISOString() }), {
      expirationTtl: 3600,
    });
  } catch (e) {
    await env.KV_STATE.put(DRYRUN_SELFTEST_RESULT, JSON.stringify({ status: "error", error: String(e) }), {
      expirationTtl: 3600,
    });
  }
}

async function handleDryRunSignal(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { service?: string; level?: string; gated?: boolean };
  return Response.json(await runDryRun(env, body));
}

/** Shared dry-run/gated exercise used by both the bearer route and the KV self-test. */
async function runDryRun(
  env: Env,
  body: { service?: string; level?: string; gated?: boolean },
): Promise<Record<string, unknown>> {
  const service = body.service ?? "chittyrouter";
  const level = body.level === "L3" ? "L3" : "L2";

  const anomaly: Anomaly = {
    id: `dryrun-${Date.now()}`,
    service,
    tier: "T3_sonnet",
    severity: level === "L3" ? "critical" : "high",
    actual: 0,
    expected_max: 0,
    ewma: 0,
    msg: "dry-run verification signal",
    detected_at: new Date().toISOString(),
    suggests_l3: level === "L3",
  };

  // 1) Real delivery (dry-run) OR gated path, per request.
  const delivery =
    body.gated === true
      ? await deliverSignal(env, {
          level,
          service,
          endpoint: (await fetchServiceFromRegistry(env, service))?.tier_degrade_endpoint,
          signal: buildL2Signal(anomaly, DRY_RUN_EXPIRY_MS),
          gated: true,
          dryRun: false,
          skipGatedDedup: true,
          reason: "admin gated-path exercise — verifies no-POST audit row",
        })
      : level === "L3"
        ? await emitL3Signal(env, anomaly, true)
        : await emitL2Signal(env, anomaly, true);

  // 2) Feedback marker proof (skip for the gated-only exercise — no delivery happened).
  let feedback: Record<string, unknown> | null = null;
  if (body.gated !== true && delivery.outcome === "dry_run_ok") {
    // (a) open marker, advance once inside the window (run-rate unchanged → escalated/effective)
    await openFeedbackMarker(env, delivery.signal_id, anomaly, new Date(Date.now() + 30_000).toISOString());
    const mkKey = `${FEEDBACK_MARKER_PREFIX}${service}`;
    const mk1 = JSON.parse((await env.KV_STATE.get(mkKey)) ?? "null") as FeedbackMarker | null;
    const t1 = mk1 ? await advanceFeedback(env, mk1) : null;
    // (b) force the resolve transition: advance with an already-elapsed expiry → 'resolved'.
    const mk2 = JSON.parse((await env.KV_STATE.get(mkKey)) ?? "null") as FeedbackMarker | null;
    let t2: string | null = null;
    if (mk2) {
      mk2.expires_at = new Date(Date.now() - 1000).toISOString();
      t2 = await advanceFeedback(env, mk2);
    }
    const cleared = (await env.KV_STATE.get(mkKey)) === null;
    feedback = {
      marker_signal_id: delivery.signal_id,
      transition_in_window: t1,
      transition_after_expiry: t2,
      marker_cleared: cleared,
    };
  }

  return {
    status: "ok",
    mode: body.gated === true ? "gated" : "dry_run",
    level,
    service,
    delivery,
    feedback,
    note: "no lasting effect — override (if any) self-reverts in <=60s",
    ts: new Date().toISOString(),
  };
}

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

// One-shot KV flag (set out-of-band via the worker's own KV — same trust boundary as a CF
// Secret, no external bearer) that forces the NEXT refresh to throw a synthetic error. This is
// the no-mock verification hook for R4 self-monitoring: it exercises the REAL error-capture +
// self-health-anomaly + poll_streak-reset path through the live cron without ever depending on
// the real matview actually breaking. Self-clears after one poll (idempotent).
const SIMULATE_REFRESH_FAIL_FLAG = "health:simulate_refresh_fail";
// Companion one-shot flag that forces the matview >1h stale-alert (critical) path live. Consumed
// in updateSelfHealth. Same trust boundary (worker's own KV); self-clears after one poll.
const SIMULATE_MATVIEW_STALE_FLAG = "health:simulate_matview_stale";

async function refreshCostLedgerView(env: Env): Promise<{ ok: boolean; error?: string }> {
  // Prefer the writer connection (has the privilege); fall back to reader (EXECUTE granted).
  const db = getWriteDb(env) ?? getDb(env);
  try {
    // Verification hook: consume a one-shot simulate-fail flag and throw a synthetic refresh error.
    if (await env.KV_STATE.get(SIMULATE_REFRESH_FAIL_FLAG)) {
      await env.KV_STATE.delete(SIMULATE_REFRESH_FAIL_FLAG); // consume first → never re-fires
      throw new Error("SIMULATED refresh failure (health:simulate_refresh_fail flag) — R4 self-monitoring verification");
    }
    await db`SELECT chittyops.refresh_cost_ledger_daily()`;
    // Clear any prior captured refresh error on success.
    await env.KV_STATE.delete(LAST_REFRESH_ERROR_KEY);
    return { ok: true };
  } catch (e) {
    const error = String(e);
    // R4: CAPTURE the error that was previously only console.warn'd and swallowed. This is the
    // exact failure that froze the matview 4 days undetected — it must now be visible in /status
    // and drive a self-health anomaly.
    console.warn("[refreshCostLedgerView] refresh FAILED — capturing to KV:", error);
    await env.KV_STATE.put(
      LAST_REFRESH_ERROR_KEY,
      JSON.stringify({ error: error.slice(0, 500), ts: new Date().toISOString() }),
    );
    return { ok: false, error };
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

/**
 * Resolve a consuming service's L2/L3 delivery endpoints.
 *
 * P0-3: the chittyregistry GET /api/v1/service/:id 404s, which made emitL2Signal/emitL3Signal
 * always early-return. We now read the chittyops.service_endpoints config table FIRST (reader
 * SELECT) and only fall back to the registry. A row with enabled=false is treated as "no
 * delivery target" (returns null), so an operator can disable delivery for a service via config
 * without code changes. The shape returned matches the old registry shape
 * ({ tier_degrade_endpoint, pause_endpoint, resume_endpoint }) so callers are untouched.
 */
async function fetchServiceFromRegistry(env: Env, serviceId: string): Promise<any> {
  // 1) config table (authoritative)
  try {
    const db = getDb(env);
    const rows = (await db`
      SELECT service, tier_degrade_endpoint, pause_endpoint, resume_endpoint, enabled
      FROM chittyops.service_endpoints
      WHERE service = ${serviceId}
      LIMIT 1
    `) as any[];
    if (rows.length > 0) {
      const r = rows[0];
      if (r.enabled === false) return { __disabled: true };
      return {
        tier_degrade_endpoint: r.tier_degrade_endpoint,
        pause_endpoint: r.pause_endpoint,
        resume_endpoint: r.resume_endpoint,
      };
    }
  } catch (e) {
    console.warn("[fetchServiceFromRegistry] service_endpoints read failed, trying registry:", String(e));
  }
  // 2) registry fallback
  try {
    const resp = await fetch(`${env.REGISTRY_URL}/api/v1/service/${serviceId}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
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
  const budgets = await loadServiceBudgets(env);
  const { daily_cap_usd: dailyCap, monthly_cap_usd: monthlyCap } = resolveBudget(serviceId, budgets);
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

/**
 * Real hard-cap enforcement (P0-2). For every service, compute MTD + daily spend and compare
 * against the resolved caps (service_budgets config, const fallback). On breach we:
 *   - WRITE a real anomaly row (severity 'critical' for a hard breach, 'high' for the 80%
 *     soft-warn) via the existing storeAnomalies path — so breaches are DETECTED, visible in
 *     /anomalies, and auditable even before L2/L3 delivery is wired (R3).
 *   - Attempt the L2/L3 signal + Quo alert (gated by safe-state / baseline-learning, exactly
 *     like detectAnomalies). These may no-op/404 until R3 — that's expected and logged.
 *
 * Per-service+dimension+severity alert de-dup: once/day via KV, so a persistent breach does
 * not write ~288 rows/day.
 */
async function checkHardCaps(env: Env): Promise<void> {
  const db = getDb(env);
  let rows: Array<{ service: string; mtd: number; daily: number }> = [];
  try {
    rows = (await db`
      SELECT service,
        coalesce(sum(cost_usd) FILTER (
          WHERE ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')),0)::float8 AS mtd,
        coalesce(sum(cost_usd) FILTER (
          WHERE ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')),0)::float8 AS daily
      FROM chittyops.cost_ledger
      WHERE ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')
      GROUP BY service
    `) as any;
  } catch (e) {
    console.error("[checkHardCaps] query failed:", e);
    return;
  }

  const budgets = await loadServiceBudgets(env);
  const safeState = await isSafeStateActive(env);
  const baselineLearning = await isBaselineLearningActive(env);
  const today = new Date().toISOString().slice(0, 10);
  const breaches: Anomaly[] = [];

  for (const r of rows) {
    const { daily_cap_usd, monthly_cap_usd } = resolveBudget(r.service, budgets);
    const dims: Array<{ dim: "mtd" | "daily"; used: number; cap: number }> = [
      { dim: "mtd", used: Number(r.mtd), cap: monthly_cap_usd },
      { dim: "daily", used: Number(r.daily), cap: daily_cap_usd },
    ];
    for (const { dim, used, cap } of dims) {
      if (cap <= 0) continue;
      let severity: "critical" | "high" | null = null;
      if (used >= cap) severity = "critical";
      else if (used >= cap * SOFT_WARN_FRACTION) severity = "high";
      if (!severity) continue;

      // once/day per service+dim+severity
      const dedupKey = `hardcap_alerted:${r.service}:${dim}:${severity}:${today}`;
      if (await env.KV_STATE.get(dedupKey)) continue;
      await env.KV_STATE.put(dedupKey, "1", { expirationTtl: 36 * 3600 });

      const label = dim === "mtd" ? "MTD" : "daily";
      const a: Anomaly = {
        id: crypto.randomUUID(),
        service: r.service,
        tier: "all", // service-level breach spans all tiers (anomalies.tier has no CHECK)
        severity,
        actual: used,
        expected_max: cap,
        ewma: cap,
        msg: `hard cap ${severity === "critical" ? "breach" : "warn"}: $${used.toFixed(2)}/$${cap.toFixed(2)} ${label}`,
        detected_at: new Date().toISOString(),
        suggests_l3: severity === "critical",
      };
      breaches.push(a);
      console.warn(`[checkHardCaps] ${a.msg} (${r.service})`);
    }
  }

  if (breaches.length === 0) return;

  // Record breaches regardless of gating (detection is always durable + auditable).
  await storeAnomalies(env, breaches);

  // Attempt delivery via the funnel (which self-gates + always audits). During baseline/
  // safe-state a critical also pages the operator; the funnel records gated_baseline + no POST.
  for (const a of breaches) {
    if (a.severity === "high") await emitL2Signal(env, a);
    if (a.severity === "critical" && a.suggests_l3) await emitL3Signal(env, a);
    if ((safeState || baselineLearning) && a.severity === "critical") {
      await sendQuoAlert(env, a, "baseline/safe-state — alert only, no L2/L3");
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

// ===================================================================================
// Signal audit trail (P1-3) — APPEND-ONLY writer + reader
// ===================================================================================

interface SignalRow {
  signal_id: string;
  level: string;
  service: string;
  signal_json?: unknown;
  http_status: number | null;
  dry_run: boolean;
  confirm_token: string | null;
  outcome: string;
  reason?: string | null;
}

/**
 * Append one row to chittyops.signals_emitted. Writer role is INSERT+SELECT only, so this is
 * the ONLY mutation primitive — every state transition is a NEW row sharing signal_id. Always
 * also emits the structured chittytrack line so observability survives a writer outage.
 */
async function recordSignal(env: Env, row: SignalRow): Promise<void> {
  console.log(JSON.stringify({ kind: "signal_emitted", ts: new Date().toISOString(), ...row }));
  const writeDb = getWriteDb(env);
  if (!writeDb) {
    console.warn("[recordSignal] writer not configured — audit row NOT persisted:", row.outcome, row.service);
    return;
  }
  try {
    await writeDb`
      INSERT INTO chittyops.signals_emitted
        (signal_id, level, service, signal_json, http_status, dry_run, confirm_token, outcome, reason)
      VALUES (
        ${row.signal_id}, ${row.level}, ${row.service},
        ${row.signal_json === undefined ? null : writeDb.json(row.signal_json as any)},
        ${row.http_status}, ${row.dry_run}, ${row.confirm_token},
        ${row.outcome}, ${row.reason ?? null}
      )
    `;
  } catch (e) {
    console.error("[recordSignal] INSERT failed:", String(e));
  }
}

/** GET /api/v1/signals — recent N rows, newest first (reader SELECT). */
async function listSignals(env: Env, limit = 50): Promise<any[]> {
  const db = getDb(env);
  try {
    // NOTE: confirm_token is intentionally NOT selected — this endpoint is unauthenticated and
    // confirm_token can hold a live L3 SMS-confirm token once real emission is enabled. Presence
    // is surfaced as a boolean instead.
    const rows = (await db`
      SELECT id, signal_id, seq, ts, level, service, signal_json, http_status, dry_run,
             (confirm_token IS NOT NULL) AS has_confirm_token, outcome, reason
      FROM chittyops.signals_emitted
      ORDER BY seq DESC
      LIMIT ${limit}
    `) as any[];
    return rows.map((r) => ({
      id: r.id,
      signal_id: r.signal_id,
      seq: Number(r.seq),
      ts: r.ts,
      level: r.level,
      service: r.service,
      signal_json: r.signal_json,
      http_status: r.http_status === null ? null : Number(r.http_status),
      dry_run: r.dry_run,
      has_confirm_token: r.has_confirm_token,
      outcome: r.outcome,
      reason: r.reason,
    }));
  } catch (e) {
    console.error("[listSignals] query failed:", e);
    return [];
  }
}

// ===================================================================================
// Feedback loop (P1-4) — the "controls cost by itself" closed loop.
//
// After a real throttle is delivered we open a KV marker holding the pre-signal run-rate and
// the override expiry. On subsequent polls runFeedbackLoop recomputes the service run-rate and
// appends a transition row (NEVER updates — append-only):
//   - run-rate fell sufficiently       → 'effective'
//   - still hot + override not expired  → 'escalated' (re-alert; L2→L3 would be the next step)
//   - override window expired           → 'resolved' (auto-resume; marker cleared)
// Bounded + idempotent: at most one transition per marker per terminal state via a KV phase tag.
// ===================================================================================

const FEEDBACK_MARKER_PREFIX = "feedback:";
const EFFECTIVE_DROP_FRACTION = 0.5; // run-rate must fall to <=50% of pre-signal to be "effective"

interface FeedbackMarker {
  signal_id: string;
  service: string;
  level: string;
  pre_rate: number; // run-rate (USD/day proxy) at emission time
  expires_at: string; // override window end (ISO)
  opened_at: string;
  phase: "pending" | "effective" | "escalated"; // terminal 'resolved' clears the marker
}

/** Compute a short-window run-rate proxy (last-hour spend, USD) for a service. */
async function serviceRunRate(env: Env, service: string): Promise<number> {
  const db = getDb(env);
  try {
    const rows = (await db`
      SELECT coalesce(sum(cost_usd),0)::float8 AS rate
      FROM chittyops.cost_ledger
      WHERE service = ${service} AND ts >= now() - interval '1 hour'
    `) as any[];
    return Number(rows[0]?.rate ?? 0);
  } catch (e) {
    console.error("[serviceRunRate] query failed:", e);
    return 0;
  }
}

async function openFeedbackMarker(env: Env, signalId: string, anomaly: Anomaly, expiresAt: string): Promise<void> {
  const preRate = await serviceRunRate(env, anomaly.service);
  const marker: FeedbackMarker = {
    signal_id: signalId,
    service: anomaly.service,
    level: "L2",
    pre_rate: preRate,
    expires_at: expiresAt,
    opened_at: new Date().toISOString(),
    phase: "pending",
  };
  // TTL: keep the marker slightly past the override window so 'resolved' can fire post-expiry.
  const ttl = Math.max(120, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000) + 600);
  await env.KV_STATE.put(`${FEEDBACK_MARKER_PREFIX}${anomaly.service}`, JSON.stringify(marker), { expirationTtl: ttl });
}

/**
 * Drive one feedback transition for a single marker. Returns the new outcome (or null if no
 * transition). Pure of the cron cadence — also callable inline from the dry-run route so the
 * marker create→resolve lifecycle can be proven in one request without waiting for the cron.
 */
async function advanceFeedback(env: Env, marker: FeedbackMarker): Promise<string | null> {
  const key = `${FEEDBACK_MARKER_PREFIX}${marker.service}`;
  const now = Date.now();
  const expired = now >= Date.parse(marker.expires_at);

  if (expired) {
    // Override window elapsed → auto-resume: spend back under control, clear the marker.
    await recordSignal(env, {
      signal_id: marker.signal_id, level: marker.level, service: marker.service,
      http_status: null, dry_run: false, confirm_token: null, outcome: "resolved",
      reason: "override window expired — auto-resume; run-rate normalised",
    });
    await env.KV_STATE.delete(key);
    return "resolved";
  }

  const curRate = await serviceRunRate(env, marker.service);
  const fellEnough = marker.pre_rate > 0 && curRate <= marker.pre_rate * EFFECTIVE_DROP_FRACTION;

  if (fellEnough && marker.phase === "pending") {
    await recordSignal(env, {
      signal_id: marker.signal_id, level: marker.level, service: marker.service,
      http_status: null, dry_run: false, confirm_token: null, outcome: "effective",
      reason: `run-rate fell ${marker.pre_rate.toFixed(4)}→${curRate.toFixed(4)} USD/hr after throttle`,
    });
    marker.phase = "effective";
    const ttl = Math.max(120, Math.ceil((Date.parse(marker.expires_at) - now) / 1000) + 600);
    await env.KV_STATE.put(key, JSON.stringify(marker), { expirationTtl: ttl });
    return "effective";
  }

  if (!fellEnough && marker.phase === "pending") {
    // Still hot inside the window → escalate/re-alert (idempotent: only once).
    await recordSignal(env, {
      signal_id: marker.signal_id, level: marker.level, service: marker.service,
      http_status: null, dry_run: false, confirm_token: null, outcome: "escalated",
      reason: `run-rate still ${curRate.toFixed(4)} USD/hr (pre ${marker.pre_rate.toFixed(4)}) — escalate L2→L3`,
    });
    marker.phase = "escalated";
    const ttl = Math.max(120, Math.ceil((Date.parse(marker.expires_at) - now) / 1000) + 600);
    await env.KV_STATE.put(key, JSON.stringify(marker), { expirationTtl: ttl });
    return "escalated";
  }
  return null;
}

/** Scan all open feedback markers (one per service) and advance each by one transition. */
async function runFeedbackLoop(env: Env): Promise<void> {
  let cursor: string | undefined;
  do {
    const list = await env.KV_STATE.list({ prefix: FEEDBACK_MARKER_PREFIX, cursor });
    for (const k of list.keys) {
      const raw = await env.KV_STATE.get(k.name);
      if (!raw) continue;
      try {
        await advanceFeedback(env, JSON.parse(raw) as FeedbackMarker);
      } catch (e) {
        console.error("[runFeedbackLoop] marker advance failed:", k.name, String(e));
      }
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);
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
