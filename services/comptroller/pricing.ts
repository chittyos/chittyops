/**
 * ChittyComptroller — external-provider PRICING TABLE
 * ====================================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Cloudflare AI Gateway computes a real dollar `cost` for Workers-AI calls, but
 * returns `cost: 0` for EXTERNAL/BYOK providers (anthropic, openai, google-ai-studio,
 * routed via the chittyclaw gateway). For those rows CF only logs token counts
 * (tokens_in / tokens_out / usage_metadata.input_cached_tokens). To attribute real
 * dollars to external spend, the comptroller computes cost from tokens × public
 * list price here.
 *
 * AUTHORITATIVE: cost_usd remains the single source of truth in cost_ledger. There
 * is NO provenance column on chittyops.cost_ledger (writer is append-only INSERT,
 * cannot DDL), so provenance is derived, not stored: any row with
 * `provider <> 'workers-ai'` carries a comptroller-COMPUTED cost; workers-ai rows
 * carry CF's REPORTED cost. See computeExternalCostUsd() callers in worker.ts.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO UPDATE PRICES  (do this whenever a provider changes list pricing)
 * ─────────────────────────────────────────────────────────────────────────────
 * All numbers below are PUBLIC LIST prices in USD per 1,000,000 tokens. Each entry
 * cites the source it was taken from. To update:
 *   1. Pull the current published price from the provider's pricing page (URLs below).
 *   2. Edit the matching entry; bump `verified` to today's date (YYYY-MM-DD).
 *   3. If a model is missing, add it — never invent a price. An unpriced external
 *      model with tokens logs a "[pricing] unpriced model" warning and is recorded
 *      at cost_usd=0 (see worker.ts), so the gap is visible and fixable.
 *
 * SOURCES (verified 2026-06-12):
 *   - Anthropic:  https://platform.claude.com/docs/en/about-claude/pricing
 *                 (also claude.com/pricing#api). Base input / cache-read / output.
 *                 NOTE: Opus 4.7+ use a new tokenizer (~up to 35% more tokens for
 *                 the same text) — the per-token PRICE is unchanged; only token
 *                 COUNTS differ, which the gateway already reports per call.
 *   - Google AI Studio: https://ai.google.dev/gemini-api/docs/pricing
 *   - OpenAI:     https://platform.openai.com/docs/pricing  (see OPENAI note below)
 *
 * OPENAI NOTE (2026-06-12): OpenAI's live pricing page now lists only the current
 * gpt-5.x family; it no longer publishes gpt-4o / gpt-4.1 list prices, and
 * `gpt-chat-latest` is a moving alias with no canonical per-model list price. Per
 * the no-invented-numbers rule, OpenAI legacy models are intentionally OMITTED
 * rather than filled from memory. This is currently harmless: every OpenAI row in
 * cost_ledger to date is a FAILED call (HTTP 401/400, 0 tokens), so it would price
 * to $0 regardless. Add gpt-* entries from the published page the moment a
 * SUCCESSFUL OpenAI row (tokens > 0) appears.
 */

export interface ModelPrice {
  /** USD per 1M input (prompt) tokens — the non-cached portion. */
  inputPerM: number;
  /** USD per 1M output (completion) tokens. */
  outputPerM: number;
  /**
   * USD per 1M cached-input tokens (prompt-cache READ rate). If a provider has no
   * distinct cached rate, omit it — cached tokens then bill at the full input rate.
   */
  cachedInputPerM?: number;
  /** Where this number came from, for auditability. */
  source: string;
  /** Last date these numbers were checked against the source (YYYY-MM-DD). */
  verified: string;
}

/**
 * Canonical model → price map. KEYS are NORMALIZED model strings (see
 * normalizeModel()): lowercased, provider/route prefixes stripped, trailing
 * Anthropic date snapshots (…-YYYYMMDD) stripped. Match logic in priceForModel()
 * tries the exact normalized key first, then a small set of family fallbacks so a
 * new dated snapshot (e.g. claude-sonnet-4-6-20260115) still resolves.
 */
export const PRICING_TABLE: Record<string, ModelPrice> = {
  // ── Anthropic (claude.com/pricing#api · platform.claude.com/docs/.../pricing) ──
  // Opus 4.x current family — $5 / $0.50 cached / $25
  "claude-opus-4-8": { inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 25, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-opus-4-7": { inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 25, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-opus-4-6": { inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 25, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-opus-4-5": { inputPerM: 5, cachedInputPerM: 0.5, outputPerM: 25, source: "anthropic-pricing", verified: "2026-06-12" },
  // Opus 4.1 / 4 (deprecated) — $15 / $1.50 cached / $75
  "claude-opus-4-1": { inputPerM: 15, cachedInputPerM: 1.5, outputPerM: 75, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-opus-4-0": { inputPerM: 15, cachedInputPerM: 1.5, outputPerM: 75, source: "anthropic-pricing", verified: "2026-06-12" },
  // Sonnet 4.x — $3 / $0.30 cached / $15  (4.6, 4.5, 4 all share this)
  "claude-sonnet-4-6": { inputPerM: 3, cachedInputPerM: 0.3, outputPerM: 15, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-sonnet-4-5": { inputPerM: 3, cachedInputPerM: 0.3, outputPerM: 15, source: "anthropic-pricing", verified: "2026-06-12" },
  "claude-sonnet-4-0": { inputPerM: 3, cachedInputPerM: 0.3, outputPerM: 15, source: "anthropic-pricing", verified: "2026-06-12" },
  // Haiku 4.5 — $1 / $0.10 cached / $5
  "claude-haiku-4-5": { inputPerM: 1, cachedInputPerM: 0.1, outputPerM: 5, source: "anthropic-pricing", verified: "2026-06-12" },
  // Claude 3.5 Haiku (retired except Bedrock/Vertex) — $0.80 / $0.08 cached / $4
  "claude-3-5-haiku": { inputPerM: 0.8, cachedInputPerM: 0.08, outputPerM: 4, source: "anthropic-pricing", verified: "2026-06-12" },

  // ── Google AI Studio (ai.google.dev/gemini-api/docs/pricing) ──
  // Gemini 2.5 Flash — $0.30 / $0.03 cached / $2.50
  "gemini-2.5-flash": { inputPerM: 0.3, cachedInputPerM: 0.03, outputPerM: 2.5, source: "google-ai-pricing", verified: "2026-06-12" },
  // Gemini 2.5 Pro — tiered by prompt size; ≤200k tier used (the common case).
  // >200k tokens is $2.50 in / $15 out / $0.25 cached — NOT modeled here; revisit
  // if large-context Gemini Pro traffic appears.
  "gemini-2.5-pro": { inputPerM: 1.25, cachedInputPerM: 0.125, outputPerM: 10, source: "google-ai-pricing(<=200k tier)", verified: "2026-06-12" },
  // Gemini 2.0 Flash (deprecated, shutdown 2026-06-01) — $0.10 / $0.025 cached / $0.40
  "gemini-2.0-flash": { inputPerM: 0.1, cachedInputPerM: 0.025, outputPerM: 0.4, source: "google-ai-pricing", verified: "2026-06-12" },

  // ── OpenAI ──
  // Intentionally omitted — see OPENAI NOTE in the header. Add gpt-4o / gpt-4.1 /
  // gpt-5.x from the published page when a successful (tokens>0) OpenAI row lands.
};

/**
 * Workers-AI fallback sanity prices (USD per 1M tokens). Workers-AI rows already
 * carry CF-reported cost and are NOT recomputed in ingestion — this map is only a
 * reference/diagnostic for the few Workers-AI models actually seen, so a future
 * "does CF's number look sane?" check has a baseline. NOT used to overwrite cost.
 * Source: Cloudflare Workers AI pricing (developers.cloudflare.com/workers-ai/platform/pricing).
 */
export const WORKERS_AI_REFERENCE: Record<string, ModelPrice> = {
  // Llama 3.3 70B fp8-fast — Cloudflare neuron-based; approximate $/1M from observed
  // CF cost (0.168790 / 559197 in ≈ $0.30/M blended). Reference only.
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { inputPerM: 0.293, outputPerM: 2.253, source: "cloudflare-workers-ai (observed blended)", verified: "2026-06-12" },
};

/**
 * Normalize a gateway-reported model string to a PRICING_TABLE key:
 *   - lowercase
 *   - strip a leading provider/route prefix the gateway sometimes prepends
 *     ("anthropic/…", "openai/…", "google-ai-studio/…", "dynamic/…")
 *   - strip a trailing Anthropic date snapshot ("-20250929", "-20241022")
 *     so claude-sonnet-4-5-20250929 → claude-sonnet-4-5
 *   - collapse a 3-part Claude "claude-3-5-haiku-…" date suffix to "claude-3-5-haiku"
 *
 * @canon: prices keyed on real resolved model names; route aliases like
 * "dynamic/three-wise-men" never carry tokens on a successful call (they resolve
 * to a concrete model in the gateway log), so they fall through to unpriced.
 */
export function normalizeModel(model: string | undefined | null): string {
  if (!model) return "";
  let m = model.toLowerCase().trim();
  // Strip a single leading provider/route segment if present.
  const slash = m.indexOf("/");
  if (slash >= 0 && !m.startsWith("@cf/")) {
    m = m.slice(slash + 1);
  }
  // Strip a trailing 8-digit date snapshot (Anthropic style): ...-20250929
  m = m.replace(/-\d{8}$/, "");
  return m;
}

/**
 * Resolve a price for a (possibly external) model string. Returns null when the
 * model is not in the table — callers MUST treat null as "unpriced": log a warning
 * and record cost_usd=0; never fabricate a price.
 */
export function priceForModel(model: string | undefined | null): ModelPrice | null {
  const key = normalizeModel(model);
  if (!key) return null;
  if (PRICING_TABLE[key]) return PRICING_TABLE[key];

  // Family fallbacks for dated/snapshot variants not collapsed by normalizeModel:
  //   claude-3-5-haiku-anything → claude-3-5-haiku
  if (key.startsWith("claude-3-5-haiku")) return PRICING_TABLE["claude-3-5-haiku"] ?? null;
  //   gemini-2.5-flash-xxx → gemini-2.5-flash (Google sometimes suffixes)
  for (const base of ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]) {
    if (key.startsWith(base)) return PRICING_TABLE[base] ?? null;
  }
  return null;
}

/**
 * Compute USD cost for an external-provider call from token counts and the pricing
 * table. Returns { costUsd, priced } — `priced=false` means the model was unpriced
 * (costUsd will be 0 and the caller should emit an "unpriced model" warning).
 *
 * Cached tokens are a SUBSET of tokens_in (the gateway reports tokens_in as TOTAL
 * input, with input_cached_tokens a subset), so we SPLIT — never double-charge:
 *   cost = (tokens_in - cached)/1e6 * input
 *        + cached/1e6 * cachedInput (falls back to input rate if no cached rate)
 *        + tokens_out/1e6 * output
 */
export function computeExternalCostUsd(args: {
  model: string | undefined | null;
  tokensIn: number;
  tokensOut: number;
  cachedTokensIn: number;
}): { costUsd: number; priced: boolean; normalizedModel: string } {
  const normalizedModel = normalizeModel(args.model);
  const price = priceForModel(args.model);
  if (!price) {
    return { costUsd: 0, priced: false, normalizedModel };
  }
  const tokensIn = Math.max(0, args.tokensIn | 0);
  const tokensOut = Math.max(0, args.tokensOut | 0);
  // Clamp cached so it can never exceed total input (defensive against bad logs).
  const cached = Math.min(Math.max(0, args.cachedTokensIn | 0), tokensIn);
  const uncachedIn = tokensIn - cached;
  const cachedRate = price.cachedInputPerM ?? price.inputPerM;

  const costUsd =
    (uncachedIn / 1e6) * price.inputPerM +
    (cached / 1e6) * cachedRate +
    (tokensOut / 1e6) * price.outputPerM;

  return { costUsd, priced: true, normalizedModel };
}
