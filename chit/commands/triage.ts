/**
 * `chit triage` subcommand
 * Terminal interface to the daily-comms-triage queue.
 *
 * Backing API: mcp.chitty.cc/daily_updates.* tools (via ChittyMCP gateway).
 * Auth: re-uses existing `chit` CLI's stored ChittyID token.
 */

import { Command } from "commander";
import { mcpCall } from "../lib/mcp-client";
import { renderTable, renderDiff, confirmInteractive } from "../lib/render";
import { formatDate } from "../lib/date";

interface ScoredAction {
  id: string;
  category: string;
  priority: number;
  entity: string | null;
  property: string | null;
  case: string | null;
  sensitivity: string;
  confidence: number;
  tier_used: string;
  recommended_action: string;
  recommended_text: string;
  due: string | null;
  rationale: string;
  routing: string;
  auto_archived: boolean;
  policy_flags_triggered: string[];
  status: string;
}

export function registerTriageCommand(program: Command) {
  const triage = program
    .command("triage")
    .description("Daily comms triage queue — list, accept, reject, snooze, restore");

  triage
    .command("list")
    .description("List today's triage queue")
    .option("--filter <expr>", "filter: e.g. 'category=Legal' or 'priority>=8' or 'tier_used=manual'")
    .option("--limit <n>", "max items", "50")
    .action(async (opts) => {
      const items = await mcpCall<ScoredAction[]>("daily_updates.list", {
        filter: opts.filter ?? null,
        limit: parseInt(opts.limit, 10),
      });
      if (items.length === 0) {
        console.log("✓ Inbox zero. Nothing in queue.");
        return;
      }
      renderTable(items, [
        { header: "ID", get: (a) => a.id.split(":").slice(-1)[0].slice(0, 12) },
        { header: "Cat", get: (a) => a.category.padEnd(10) },
        { header: "Pri", get: (a) => String(a.priority).padStart(2) },
        { header: "Entity", get: (a) => a.entity ?? "-" },
        { header: "Action", get: (a) => a.recommended_action.padEnd(8) },
        { header: "Due", get: (a) => a.due ? formatDate(a.due) : "-" },
        { header: "Conf", get: (a) => `${(a.confidence * 100).toFixed(0)}%` },
        { header: "Tier", get: (a) => a.tier_used },
        { header: "Subject", get: (a) => a.rationale.slice(0, 40) + (a.rationale.length > 40 ? "…" : "") },
      ]);
      console.log(`\n  ${items.length} item(s). Use 'chit triage diff <id>' to preview drafts.`);
    });

  triage
    .command("accept <id>")
    .description("Accept the recommended action")
    .option("--note <text>", "optional note")
    .action(async (id, opts) => {
      const res = await mcpCall<{ status: string }>("daily_updates.accept", { id, note: opts.note });
      console.log(`✓ accepted: ${id} → ${res.status}`);
    });

  triage
    .command("reject <id>")
    .description("Reject the recommended action")
    .option("--reason <text>", "optional reason (informs classifier improvement)")
    .action(async (id, opts) => {
      const res = await mcpCall<{ status: string }>("daily_updates.reject", { id, reason: opts.reason });
      console.log(`✗ rejected: ${id} → ${res.status}`);
    });

  triage
    .command("snooze <id> <until>")
    .description("Snooze until a date/time (e.g. 'tomorrow 9am')")
    .action(async (id, until) => {
      const res = await mcpCall<{ status: string; until: string }>("daily_updates.snooze", { id, until });
      console.log(`💤 snoozed ${id} until ${res.until}`);
    });

  triage
    .command("restore <id>")
    .description("Restore an auto-archived item")
    .action(async (id) => {
      const res = await mcpCall<{ status: string }>("daily_updates.restore", { id });
      console.log(`↺ restored: ${id} → ${res.status}`);
    });

  triage
    .command("diff <id>")
    .description("Show recommended_text as diff against thread context (for Reply drafts)")
    .action(async (id) => {
      const item = await mcpCall<ScoredAction & { thread_context?: string }>("daily_updates.get", { id });
      if (item.recommended_action !== "Reply") {
        console.log(`(no diff — recommended action is ${item.recommended_action})`);
        console.log(`Recommended: ${item.recommended_text || "(none)"}`);
        return;
      }
      renderDiff(item.thread_context ?? "", item.recommended_text);
      console.log(`\n[a]ccept · [e]dit · [r]eject · [s]nooze · [q]uit?`);
      // ... interactive input loop omitted for brevity
    });

  triage
    .command("bulk-accept")
    .description("Bulk-accept items matching a filter (with sample-of-3 confirmation)")
    .requiredOption("--filter <expr>", "filter: e.g. 'category=Vendor AND confidence>0.90'")
    .option("--yes", "skip confirmation")
    .action(async (opts) => {
      const preview = await mcpCall<ScoredAction[]>("daily_updates.list", { filter: opts.filter, limit: 3 });
      if (!opts.yes) {
        console.log("Sample of items that would be accepted:\n");
        for (const item of preview) {
          console.log(`  - [${item.category}/${item.priority}] ${item.rationale.slice(0, 80)}`);
        }
        const ok = await confirmInteractive("Bulk-accept all matching this filter?");
        if (!ok) { console.log("Aborted."); return; }
      }
      const res = await mcpCall<{ count: number }>("daily_updates.bulk_accept", {
        filter: opts.filter,
        confirm_sample: preview,
      });
      console.log(`✓ bulk-accepted ${res.count} item(s)`);
    });

  triage
    .command("budget")
    .description("Show comptroller status for this routine")
    .action(async () => {
      const res = await mcpCall<{
        daily_used_usd: number;
        daily_cap_usd: number;
        monthly_used_usd: number;
        monthly_cap_usd: number;
        tier_breakdown: Record<string, number>;
        anomalies: { msg: string }[];
      }>("comptroller.budget_status", { service: "daily-comms-triage" });

      console.log(`Budget — daily-comms-triage\n`);
      console.log(`  Today:  $${res.daily_used_usd.toFixed(4)} / $${res.daily_cap_usd.toFixed(2)}`);
      console.log(`  Month:  $${res.monthly_used_usd.toFixed(2)} / $${res.monthly_cap_usd.toFixed(2)}`);
      console.log(`\n  Tier breakdown today:`);
      for (const [tier, cost] of Object.entries(res.tier_breakdown)) {
        console.log(`    ${tier.padEnd(15)} $${cost.toFixed(4)}`);
      }
      if (res.anomalies.length > 0) {
        console.log(`\n  ⚠ Anomalies:`);
        for (const a of res.anomalies) console.log(`    - ${a.msg}`);
      }
    });
}
