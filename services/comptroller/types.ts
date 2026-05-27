/**
 * Comptroller type definitions. See spec §8.
 */

export type AuthorityLevel = "L1" | "L2" | "L3";

export interface Anomaly {
  ts: string;
  service: string;
  tier: string;
  observed_cost_usd: number;
  expected_cost_usd: number;
  zscore: number;
  severity: "info" | "warn" | "crit";
}

export interface DegradeSignal {
  service: string;
  reason: "soft_limit" | "hard_limit" | "anomaly";
  recommended_tier: string;
  cost_constrained: true;
  effective_until: string;
}

export interface PauseSignal {
  service: string;
  reason: "hard_limit_breach" | "anomaly_crit";
  pause_exemption_blocked?: string[];
  sms_confirm_required: boolean;
  effective_until: string;
}

export interface BudgetStatus {
  service: string;
  spent_day_usd: number;
  spent_month_usd: number;
  soft_remaining_usd: number;
  hard_remaining_usd: number;
  baseline_learning: boolean;
  authority: AuthorityLevel;
}
