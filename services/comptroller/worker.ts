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
 */

interface Env {
  NEON_COMPTROLLER: Hyperdrive; // comptroller_reader role on chittyops schema
  KV_STATE: KVNamespace;
  CF_AI_GATEWAY_TOKEN: string;
  ANTHROPIC_BILLING_KEY: string;
  GOOGLE_AI_STUDIO_KEY: string;
  CF_ACCOUNT_API_TOKEN: string;
  QUO_API_KEY: string;
  NOTION_API_KEY: string;
  NOTION_BUSINESS_REPORT_PAGE_ID: string;
  NOTION_LEGALINK_REPORT_PAGE_ID: string;
  REGISTRY_URL: string; // registry.chitty.cc
  HEARTBEAT_URL: string; // discovery.chitty.cc/heartbeat/comptroller
}

const COLD_START_AT_KEY = "cold_start_at";
const SAFE_STATE_KEY = "safe_state_active";
const BASELINE_LEARNING_KEY = "baseline_learning_until";

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const cronSpec = event.cron;
    if (cronSpec === "*/5 * * * *") {
      // every 5 min — metric collection
      await pollMetrics(env);
    } else if (cronSpec === "0 7 * * *") {
      // 7 AM CT — daily report
      await emitDailyReport(env);
    } else if (cronSpec === "0 7 * * 1") {
      // Mon 7 AM CT — weekly forecast
      await emitWeeklyForecast(env);
    } else if (cronSpec === "0 9 1 * *") {
      // 1st of month, 9 AM CT — monthly closeout
      await emitMonthlyCloseout(env);
    }
    await heartbeat(env);
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // ===== Public API =====
    if (url.pathname.endsWith("/status") && url.pathname.startsWith("/budget/")) {
      const service = url.pathname.split("/")[2];
      return Response.json(await budgetStatus(env, service));
    }

    if (url.pathname === "/reports/daily") {
      return Response.json(await fetchDailyReport(env));
    }

    if (url.pathname === "/anomalies") {
      return Response.json(await listAnomalies(env));
    }

    // ===== Admin API (auth-gated) =====
    if (url.pathname === "/_admin/authority" && req.method === "POST") {
      return await handleAuthorityChange(req, env);
    }

    if (url.pathname === "/_admin/baseline_learning/end" && req.method === "POST") {
      // Operator manually ends baseline-learning early (after SMS confirm)
      return await handleBaselineLearningEnd(req, env);
    }

    return Response.json({ service: "comptroller", version: "1.0.0", status: "ok" });
  },
};

// ===== Metric collection (every 5 min) =====
async function pollMetrics(env: Env): Promise<void> {
  // Pull from each source in parallel; tolerate individual failures
  const results = await Promise.allSettled([
    pullCFAIGatewayAnalytics(env),
    pullAnthropicBilling(env),
    pullGoogleAIStudioQuota(env),
    pullCFWorkersAIMetrics(env),
    refreshCostLedgerView(env),
  ]);

  // Check for anomalies
  const anomalies = await detectAnomalies(env);

  if (anomalies.length > 0) {
    await storeAnomalies(env, anomalies);
    const safeState = await isSafeStateActive(env);
    const baselineLearning = await isBaselineLearningActive(env);

    if (!safeState && !baselineLearning) {
      // Real anomaly: maybe issue L2 signal
      for (const a of anomalies) {
        if (a.severity === "high") {
          await emitL2Signal(env, a);
        }
        if (a.severity === "critical" && a.suggests_l3) {
          await emitL3Signal(env, a); // honors pause_exemptions
        }
      }
    } else {
      // Safe-state or baseline: alert only
      for (const a of anomalies) {
        if (a.severity === "critical") await sendQuoAlert(env, a);
      }
    }
  }

  // Check hard budget caps independently of anomaly detection
  await checkHardCaps(env);
}

// ===== Anomaly detection (EWMA + 3-sigma) =====
async function detectAnomalies(env: Env): Promise<Anomaly[]> {
  // Query cost_ledger_daily for last 14 days per service+tier
  const sql = `
    SELECT service, tier, day_ct, total_cost_usd
    FROM chittyops.cost_ledger_daily
    WHERE day_ct >= now() - interval '14 days'
    ORDER BY service, tier, day_ct
  `;
  const rows = await env.NEON_COMPTROLLER.query(sql);

  // Group by service+tier, compute EWMA + stdev, compare today
  const byKey = groupBy(rows, (r: any) => `${r.service}:${r.tier}`);
  const anomalies: Anomaly[] = [];

  for (const [key, series] of byKey.entries()) {
    if (series.length < 7) continue; // not enough history
    const today = series[series.length - 1];
    const history = series.slice(0, -1);

    const ewma = computeEWMA(history.map((r: any) => Number(r.total_cost_usd)));
    const stdev = computeStdev(history.map((r: any) => Number(r.total_cost_usd)));
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
        msg: `${service}/${tier}: $${todayActual.toFixed(4)} vs forecast $${ewma.toFixed(4)} (+${((todayActual/ewma - 1) * 100).toFixed(0)}%)`,
        detected_at: new Date().toISOString(),
        suggests_l3: todayActual > 5 * threshold,
      });
    }
  }

  return anomalies;
}

// ===== L2: tier_degrade signal =====
async function emitL2Signal(env: Env, anomaly: Anomaly): Promise<void> {
  const service = await fetchServiceFromRegistry(env, anomaly.service);
  if (!service?.tier_degrade_endpoint) return;

  const isExempt = await isServiceExempt(env, anomaly.service);
  if (isExempt) {
    // Even L2 honors exemptions for `active_deadline` services
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
    headers: { "X-Comptroller-Signature": await signHmac(env, signal) },
    body: JSON.stringify(signal),
  });
  await logSignalEmitted(env, "L2", anomaly.service, signal, resp.status);
}

// ===== L3: pause signal (requires SMS confirm if exempt) =====
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
    headers: { "X-Comptroller-Signature": await signHmac(env, signal) },
    body: JSON.stringify(signal),
  });
  await logSignalEmitted(env, "L3", anomaly.service, signal, resp.status);
}

// ===== Authority change endpoint =====
async function handleAuthorityChange(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as { level: string; sms_confirm_token: string };
  const validToken = await verifySMSConfirm(env, body.sms_confirm_token);
  if (!validToken) return new Response("sms confirm required", { status: 403 });

  await env.KV_STATE.put("authority_level", body.level);
  await env.KV_STATE.put(SAFE_STATE_KEY, "false");
  return Response.json({ status: "ok", level: body.level });
}

// ===== Baseline-learning end (manual override) =====
async function handleBaselineLearningEnd(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as { sms_confirm_token: string };
  if (!await verifySMSConfirm(env, body.sms_confirm_token)) {
    return new Response("sms confirm required", { status: 403 });
  }
  await env.KV_STATE.delete(BASELINE_LEARNING_KEY);
  return Response.json({ status: "baseline_learning_ended" });
}

// ===== Helper signatures (real impls call respective APIs) =====
async function pullCFAIGatewayAnalytics(env: Env): Promise<void> { /* GET gateway.chitty.cc/_analytics */ }
async function pullAnthropicBilling(env: Env): Promise<void> { /* GET api.anthropic.com/v1/billing */ }
async function pullGoogleAIStudioQuota(env: Env): Promise<void> { /* generativelanguage.googleapis.com/v1/quota */ }
async function pullCFWorkersAIMetrics(env: Env): Promise<void> { /* CF GraphQL */ }
async function refreshCostLedgerView(env: Env): Promise<void> {
  await env.NEON_COMPTROLLER.query("SELECT chittyops.refresh_cost_ledger_daily()");
}

async function isSafeStateActive(env: Env): Promise<boolean> {
  const coldStartAt = await env.KV_STATE.get(COLD_START_AT_KEY);
  if (!coldStartAt) return true;
  const ageHrs = (Date.now() - Number(coldStartAt)) / (3600 * 1000);
  return ageHrs < 24;
}

async function isBaselineLearningActive(env: Env): Promise<boolean> {
  const until = await env.KV_STATE.get(BASELINE_LEARNING_KEY);
  if (!until) return false;
  return Date.now() < Number(until);
}

async function isServiceExempt(env: Env, serviceId: string): Promise<boolean> {
  const sql = "SELECT 1 FROM chittyops.pause_exemptions WHERE service_id = $1 LIMIT 1";
  const rows = await env.NEON_COMPTROLLER.query(sql, [serviceId]);
  return rows.length > 0;
}

async function fetchServiceFromRegistry(env: Env, serviceId: string): Promise<any> {
  const resp = await fetch(`${env.REGISTRY_URL}/api/v1/service/${serviceId}`);
  if (!resp.ok) return null;
  return await resp.json();
}

async function budgetStatus(env: Env, serviceId: string): Promise<any> {
  const sql = `
    SELECT
      (SELECT sum(cost_usd) FROM chittyops.cost_ledger WHERE service = $1 AND ts >= date_trunc('day', now() AT TIME ZONE 'America/Chicago')) AS today,
      (SELECT sum(cost_usd) FROM chittyops.cost_ledger WHERE service = $1 AND ts >= date_trunc('month', now() AT TIME ZONE 'America/Chicago')) AS mtd
  `;
  const [row] = await env.NEON_COMPTROLLER.query(sql, [serviceId]);
  // Cap config from registry/manifest
  return {
    service: serviceId,
    daily_used_usd: Number(row?.today ?? 0),
    daily_cap_usd: 2.0, // pull from manifest in real impl
    monthly_used_usd: Number(row?.mtd ?? 0),
    monthly_cap_usd: 15.0,
    halt: Number(row?.today ?? 0) >= 2.0 || Number(row?.mtd ?? 0) >= 15.0,
    tier_breakdown: {},
    anomalies: [],
  };
}

// ===== Reports =====
async function emitDailyReport(env: Env): Promise<void> {
  // Two reports: Business-aggregated + Legalink-detailed (F-L13)
  await writeNotionReport(env, env.NOTION_BUSINESS_REPORT_PAGE_ID, await buildBusinessReport(env));
  await writeNotionReport(env, env.NOTION_LEGALINK_REPORT_PAGE_ID, await buildLegalinkReport(env));
}
async function emitWeeklyForecast(env: Env): Promise<void> { /* ... */ }
async function emitMonthlyCloseout(env: Env): Promise<void> { /* ... */ }
async function buildBusinessReport(env: Env): Promise<string> { return "..."; }
async function buildLegalinkReport(env: Env): Promise<string> { return "..."; }
async function writeNotionReport(env: Env, pageId: string, body: string): Promise<void> { /* notion api */ }

async function fetchDailyReport(env: Env): Promise<any> { return {}; }
async function listAnomalies(env: Env): Promise<any[]> { return []; }
async function storeAnomalies(env: Env, list: Anomaly[]): Promise<void> { /* insert into comptroller.anomalies */ }
async function checkHardCaps(env: Env): Promise<void> { /* per-service hard cap check */ }
async function requestSMSConfirm(env: Env, anomaly: Anomaly): Promise<string | null> {
  // Send Quo SMS with confirmation link; wait briefly or return null for async
  return null;
}
async function verifySMSConfirm(env: Env, token: string): Promise<boolean> { return false; }
async function sendQuoAlert(env: Env, anomaly: Anomaly, extra?: string): Promise<void> { /* quo SMS */ }
async function signHmac(env: Env, payload: unknown): Promise<string> { return ""; }
async function logSignalEmitted(env: Env, level: string, service: string, signal: unknown, status: number): Promise<void> { /* insert */ }
async function heartbeat(env: Env): Promise<void> { await fetch(env.HEARTBEAT_URL, { method: "POST", body: JSON.stringify({ ts: new Date().toISOString() }) }); }

// ===== Math helpers (pure JS — no LLM) =====
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

// ===== Types =====
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
