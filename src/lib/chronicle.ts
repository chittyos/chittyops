const SENSITIVE_KEY_PATTERN = /password|token|secret|key|credential|otp/i;
const CHRONICLE_URL =
  process.env.CHITTY_CHRONICLE_URL ?? "https://chronicle.chitty.cc/v1/events";

export interface ChronicleEvent {
  service: string;
  event: string;
  actor: string;
  data: Record<string, unknown>;
}

export function redactSensitive(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] =
      SENSITIVE_KEY_PATTERN.test(k) && typeof v === "string"
        ? "[REDACTED]"
        : v;
  }
  return out;
}

export async function logEvent(event: ChronicleEvent): Promise<void> {
  const payload = {
    service: event.service,
    event: event.event,
    actor: event.actor,
    timestamp: new Date().toISOString(),
    data: redactSensitive(event.data),
  };
  try {
    await fetch(CHRONICLE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // chronicle is best-effort; never crash the caller
  }
}
