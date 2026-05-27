/**
 * agent.chitty.cc — /triage route
 * Surface for the daily-comms-triage queue inside the multi-model chat UI.
 *
 * Reuses existing scaffold:
 *   - `useChatContext()` — session, user, model selection
 *   - `<AppShell>` — sidebar + header + content
 *   - `<DiffView>` — already exists for code/text diff rendering
 *   - `mcpClient` — calls mcp.chitty.cc tools
 *
 * Privileged items: metadata-only + "Open in Legalink" link (F-L6).
 * Mobile: single-column · accept/reject as full-width buttons · sticky filter chips.
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useChatContext } from "@/lib/chat-context";
import { mcpClient } from "@/lib/mcp-client";
import { AppShell } from "@/components/AppShell";
import { DiffView } from "@/components/DiffView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Check, X, Clock, RotateCcw, Sparkles, Lock } from "lucide-react";

interface ScoredAction {
  id: string;
  accounts: string[];
  cross_inbox_count: number;
  category: "Legal" | "Financial" | "Property" | "Vendor" | "Infra" | "Personal-Admin" | "Personal-Social" | "Regulatory" | "Other";
  priority: number;
  entity: string | null;
  property: string | null;
  case: string | null;
  sensitivity: "privileged" | "pii" | "hoa_evidentiary" | "public";
  confidence: number;
  tier_used: string;
  injection_suspected: boolean;
  recommended_action: "Reply" | "Decide" | "Pay" | "File" | "Schedule" | "FYI" | "Archive";
  recommended_text: string;
  due: string | null;
  rationale: string;
  routing: "business" | "legalink";
  policy_flags_triggered: string[];
  cost_constrained: boolean;
  auto_archived: boolean;
  status: string;
  thread_context?: string;
}

type FilterChip = "all" | "high_priority" | "legal" | "financial" | "pilot_unresolved" | "auto_archived";

const FILTER_CHIPS: { id: FilterChip; label: string; filter: string | null }[] = [
  { id: "all", label: "All", filter: null },
  { id: "high_priority", label: "High Priority", filter: "priority>=8" },
  { id: "legal", label: "Legal", filter: "category=Legal" },
  { id: "financial", label: "Financial", filter: "category=Financial" },
  { id: "pilot_unresolved", label: "Pilot Unresolved", filter: "tier_used=manual" },
  { id: "auto_archived", label: "Auto-archived", filter: "auto_archived=true" },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  mid: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
};

function priorityBand(p: number): "high" | "mid" | "low" {
  if (p >= 8) return "high";
  if (p >= 5) return "mid";
  return "low";
}

const CATEGORY_GLYPH: Record<string, string> = {
  Legal: "⚖",
  Financial: "$",
  Property: "🏠",
  Vendor: "📦",
  Infra: "⚙",
  "Personal-Admin": "🗂",
  "Personal-Social": "👤",
  Regulatory: "🏛",
  Other: "•",
};

export default function TriageRoute() {
  const { user } = useChatContext();
  const [items, setItems] = useState<ScoredAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterChip>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [budget, setBudget] = useState<{ daily_used: number; daily_cap: number; mtd_used: number; mtd_cap: number } | null>(null);

  const activeFilter = useMemo(() => FILTER_CHIPS.find((c) => c.id === filter)!, [filter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await mcpClient.call<ScoredAction[]>("daily_updates.list", {
        filter: activeFilter.filter,
        limit: 100,
      });
      setItems(data ?? []);
    } catch (err) {
      console.error("triage list failed", err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  const refreshBudget = useCallback(async () => {
    try {
      const data = await mcpClient.call<any>("comptroller.budget_status", { service: "daily-comms-triage" });
      setBudget({
        daily_used: data.daily_used_usd,
        daily_cap: data.daily_cap_usd,
        mtd_used: data.monthly_used_usd,
        mtd_cap: data.monthly_cap_usd,
      });
    } catch (err) {
      console.warn("comptroller budget unavailable; continuing", err);
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshBudget();
  }, [refresh, refreshBudget]);

  const handleAccept = async (item: ScoredAction) => {
    setActionInFlight(item.id);
    try {
      await mcpClient.call("daily_updates.accept", { id: item.id });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      console.error("accept failed", err);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleReject = async (item: ScoredAction) => {
    setActionInFlight(item.id);
    try {
      const reason = window.prompt("Reason (optional, helps classifier improve):") ?? undefined;
      await mcpClient.call("daily_updates.reject", { id: item.id, reason });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      console.error("reject failed", err);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSnooze = async (item: ScoredAction) => {
    const until = window.prompt("Snooze until (e.g. 'tomorrow 9am'):");
    if (!until) return;
    setActionInFlight(item.id);
    try {
      await mcpClient.call("daily_updates.snooze", { id: item.id, until });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      console.error("snooze failed", err);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleRestore = async (item: ScoredAction) => {
    setActionInFlight(item.id);
    try {
      await mcpClient.call("daily_updates.restore", { id: item.id });
      await refresh();
    } catch (err) {
      console.error("restore failed", err);
    } finally {
      setActionInFlight(null);
    }
  };

  const handleExpand = async (item: ScoredAction) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    // Lazy-load full record with thread_context for diff view (Reply only)
    if (item.recommended_action === "Reply" && !item.thread_context) {
      try {
        const full = await mcpClient.call<ScoredAction>("daily_updates.get", {
          id: item.id,
          include_thread_context: true,
        });
        setItems((prev) => prev.map((i) => (i.id === item.id ? full : i)));
      } catch (err) {
        console.warn("could not load thread context", err);
      }
    }
    setExpandedId(item.id);
  };

  return (
    <AppShell title="Daily Triage" user={user}>
      {/* Budget bar */}
      {budget && (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          <span>Today: ${budget.daily_used.toFixed(4)} / ${budget.daily_cap.toFixed(2)}</span>
          <span>·</span>
          <span>Month: ${budget.mtd_used.toFixed(2)} / ${budget.mtd_cap.toFixed(2)}</span>
          <span className="ml-auto">
            <Sparkles className="inline h-3 w-3" /> Pilot mode (T2/T3 disabled)
          </span>
        </div>
      )}

      {/* Filter chips */}
      <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        {FILTER_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => setFilter(chip.id)}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === chip.id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <ScrollArea className="h-[calc(100vh-7rem)]">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-4 sm:px-6">
          {loading && (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          )}

          {!loading && items.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-zinc-500">
                <Check className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
                <p className="text-sm">Inbox zero. Nothing in this filter.</p>
              </CardContent>
            </Card>
          )}

          {!loading &&
            items.map((item) => {
              const isPrivileged = item.sensitivity === "privileged";
              const band = priorityBand(item.priority);
              const isExpanded = expandedId === item.id;
              const isPilot = item.tier_used === "manual" || item.policy_flags_triggered.includes("PILOT_MODE_UNRESOLVED");

              return (
                <Card key={item.id} className={`overflow-hidden ${isPrivileged ? "border-amber-300 dark:border-amber-700" : ""}`}>
                  <CardHeader className="pb-2">
                    <button onClick={() => handleExpand(item)} className="flex w-full items-start gap-3 text-left">
                      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-mono text-sm ${PRIORITY_COLORS[band]}`}>
                        {item.priority}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-base">{CATEGORY_GLYPH[item.category]}</span>
                          <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                          {item.entity && <Badge variant="secondary" className="text-[10px]">{item.entity}</Badge>}
                          {item.case && <Badge variant="secondary" className="text-[10px]">{item.case}</Badge>}
                          {item.cross_inbox_count > 1 && (
                            <Badge className="text-[10px]" variant="default">×{item.cross_inbox_count}</Badge>
                          )}
                          {isPrivileged && (
                            <Badge className="text-[10px] bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                              <Lock className="mr-1 h-2.5 w-2.5" /> Privileged
                            </Badge>
                          )}
                          {isPilot && (
                            <Badge className="text-[10px] bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                              Pilot unresolved
                            </Badge>
                          )}
                          {item.auto_archived && (
                            <Badge className="text-[10px] bg-zinc-200 text-zinc-700">Auto-archived</Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.rationale}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.recommended_action}</span>
                          {item.due && (
                            <span>
                              <Clock className="mr-1 inline h-3 w-3" />
                              due {formatDistanceToNow(new Date(item.due), { addSuffix: true })}
                            </span>
                          )}
                          <span>{(item.confidence * 100).toFixed(0)}% conf · {item.tier_used}</span>
                        </div>
                      </div>
                    </button>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                      {isPrivileged ? (
                        // F-L6: metadata-only for privileged items
                        <div className="space-y-2">
                          <p className="text-sm text-zinc-700 dark:text-zinc-300">
                            Privileged item · metadata only. Full content stays in Legalink.
                          </p>
                          <a
                            href={`https://legalink.chitty.cc/triage/${item.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
                          >
                            Open in Legalink <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ) : item.recommended_action === "Reply" ? (
                        <DiffView
                          original={item.thread_context ?? ""}
                          modified={item.recommended_text}
                          maxLines={20}
                          mobileMaxLines={8}
                        />
                      ) : item.recommended_text ? (
                        <pre className="whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          {item.recommended_text}
                        </pre>
                      ) : (
                        <p className="text-sm italic text-zinc-500">No draft — recommendation is action-only.</p>
                      )}

                      {item.policy_flags_triggered.length > 0 && (
                        <div className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                          ⚠ Policy gates: {item.policy_flags_triggered.join(", ")}
                        </div>
                      )}

                      {/* Action row */}
                      <div className="mt-3 flex flex-wrap gap-2 sm:flex-nowrap">
                        {item.auto_archived ? (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={actionInFlight === item.id}
                            onClick={() => handleRestore(item)}
                            className="flex-1"
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              disabled={actionInFlight === item.id || item.policy_flags_triggered.length > 0}
                              onClick={() => handleAccept(item)}
                              className="flex-1"
                            >
                              <Check className="mr-1.5 h-3.5 w-3.5" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={actionInFlight === item.id}
                              onClick={() => handleSnooze(item)}
                              className="flex-1"
                            >
                              <Clock className="mr-1.5 h-3.5 w-3.5" /> Snooze
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={actionInFlight === item.id}
                              onClick={() => handleReject(item)}
                              className="flex-1"
                            >
                              <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
        </div>
      </ScrollArea>
    </AppShell>
  );
}
