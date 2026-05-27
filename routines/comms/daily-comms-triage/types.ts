/**
 * Type definitions for daily-comms-triage worker.
 * Shapes mirror Source-of-Truth §5.1 / §5.2 / §5.3 of
 * spec/daily-updates-orchestration-v0.5.md
 */

export type Source =
  | "gmail"
  | "quo"
  | "imessage"
  | "mercury"
  | "notion"
  | "m365"
  | "chittymac"
  | "cloudflare"
  | "linear"
  | "cashapp"
  | "docusign"
  | "rmail";

export type Account =
  | "ws_nevershitty"
  | "ws_jeanarlene"
  | "personal_gmail"
  | "n/a";

export type Sensitivity = "unknown" | "privileged" | "pii" | "hoa_evidentiary" | "public";

export type Routing = "business" | "legalink";

export type Category =
  | "Legal"
  | "Financial"
  | "Property"
  | "Vendor"
  | "Infra"
  | "Personal-Admin"
  | "Personal-Social"
  | "Regulatory"
  | "Other";

export type RecommendedAction = "Reply" | "Decide" | "Pay" | "File" | "Schedule" | "FYI" | "Archive";

export type Tier = "T0" | "T1_studio" | "T1_flash" | "T2_haiku" | "T3_sonnet" | "manual";

export interface IngestItem {
  source: Source;
  account: Account;
  source_id: string;
  received_at: string;
  subject: string;
  preview: string;
  raw_ref: string;
  sensitivity_hint: Sensitivity;
  pre_evaluated_sensitivity?: Sensitivity;
  entity_prior: "ChittyCorp" | "JAVL" | "Personal" | null;
  hints: {
    from?: string;
    subject?: string;
    thread_id?: string;
    message_id?: string;
  };
}

export interface ScoredAction {
  id: string;
  ingest_item_ref: string;
  accounts: Account[];
  cross_inbox_count: number;
  category: Category;
  priority: number;
  priority_modifier?: string;
  entity: "ARIBIA" | "JAVL" | "IT_CAN_BE" | "ChittyCorp" | "Personal" | null;
  property: "city_studio" | "cozy_castle" | "lakeside_loft" | "villa_vista" | null;
  case: string | null;
  sensitivity: Sensitivity;
  confidence: number;
  tier_used: Tier;
  injection_suspected: boolean;
  recommended_action: RecommendedAction;
  recommended_text?: string;
  due: string | null;
  rationale: string;
  routing: Routing;
  policy_flags_triggered: string[];
  cost_constrained: boolean;
  auto_archived: boolean;
}

export interface RoutineManifest {
  id: string;
  version: string;
  trigger: { cron?: string; webhook?: string };
  pause_exemption?: string[];
}

export interface CostLedgerEntry {
  ts: string;
  service: string;
  tier: Tier;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  hashed_item_id: string;
}
