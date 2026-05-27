/**
 * daily-comms-triage-realtime — webhook variant
 * PILOT-DISABLED. Fires only on priority >= 8 inbound webhook events.
 * Shares classification path with the cron variant via internal fetch to
 * daily-comms-triage's dispatch endpoint.
 */

import type { IngestItem } from "./types";
import { sha256 } from "./crypto";

interface Env {
  KV_LOCKS: KVNamespace;
  DISPATCH_URL: string;
  HEARTBEAT_URL: string;
  PILOT_DISABLED: string; // "true" until exit criteria met
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (env.PILOT_DISABLED === "true") {
      return new Response(JSON.stringify({ status: "pilot_disabled" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const body = (await req.json()) as Partial<IngestItem>;
    if (!body.source || !body.source_id) {
      return new Response("Missing source/source_id", { status: 400 });
    }

    const idemKey = await sha256(`${body.source}:${body.source_id}`);
    const existing = await env.KV_LOCKS.get(idemKey);
    if (existing) {
      return new Response(JSON.stringify({ status: "duplicate", lock: existing }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    await env.KV_LOCKS.put(idemKey, new Date().toISOString(), { expirationTtl: 86400 });

    const dispatchResp = await fetch(env.DISPATCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ realtime: true, item: body }),
    });

    void fetch(env.HEARTBEAT_URL, { method: "POST" }).catch(() => {});

    return new Response(
      JSON.stringify({ status: "dispatched", upstream: dispatchResp.status }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  },
};
