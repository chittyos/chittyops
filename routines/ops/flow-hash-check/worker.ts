/**
 * flow-hash-check — drift detection for Workspace Studio flows.
 * Compares live Studio flow export hash against repo-committed JSON;
 * raises a Notion alert on drift. Read-only.
 */

import { sha256 } from "./crypto";

interface Env {
  GAM_TUNNEL_URL: string;
  REPO_FLOW_HASH_WS1: string;  // hash of studio-flows/aribia-daily-inbox-triage.json @ws1
  REPO_FLOW_HASH_WS2: string;  // same for ws2
  NOTION_API_KEY: string;
  NOTION_ALERT_PAGE_ID: string;
  HEARTBEAT_URL: string;
}

async function fetchLiveFlow(env: Env, tenant: "ws1" | "ws2"): Promise<string> {
  const resp = await fetch(`${env.GAM_TUNNEL_URL}/studio/flow/${tenant}/export`, {
    headers: { accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`gam tunnel ${tenant}: ${resp.status}`);
  const json = await resp.text();
  return sha256(json);
}

async function alertDrift(env: Env, tenant: string, observed: string, expected: string) {
  await fetch(`https://api.notion.com/v1/blocks/${env.NOTION_ALERT_PAGE_ID}/children`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${env.NOTION_API_KEY}`,
      "notion-version": "2022-06-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      children: [{
        object: "block",
        type: "callout",
        callout: {
          rich_text: [{
            type: "text",
            text: { content: `Studio flow drift on ${tenant}: expected ${expected}, observed ${observed}` },
          }],
          icon: { emoji: "⚠️" },
        },
      }],
    }),
  });
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(fetch(env.HEARTBEAT_URL, { method: "POST" }).catch(() => {}));

    for (const [tenant, expected] of [
      ["ws1", env.REPO_FLOW_HASH_WS1],
      ["ws2", env.REPO_FLOW_HASH_WS2],
    ] as const) {
      try {
        const observed = await fetchLiveFlow(env, tenant);
        if (observed !== expected) {
          await alertDrift(env, tenant, observed, expected);
        }
      } catch (err) {
        console.error(`flow-hash-check ${tenant}`, err);
      }
    }
  },
};
