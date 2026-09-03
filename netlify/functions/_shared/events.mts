import { getStore } from "@netlify/blobs";
import { HttpError } from "./http.mts";

const attempts = new Map<string, { count: number; startedAt: number }>();

export function checkBestEffortRateLimit(request: Request, limit = 12) {
  const key = request.headers.get("x-nf-client-connection-ip") ?? "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now - current.startedAt > 60 * 60 * 1000) {
    attempts.set(key, { count: 1, startedAt: now });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new HttpError(429, "rate_limited", "Too many event submissions. Try again later.");
}

export async function appendEvent(kind: "requests" | "telemetry", payload: Record<string, unknown>) {
  const context = process.env.CONTEXT || "local";
  const store = getStore({ name: `adaptab-${context}-${kind}`, consistency: "strong" });
  const id = crypto.randomUUID();
  const recordedAt = new Date().toISOString();
  await store.setJSON(`${recordedAt.slice(0, 10)}/${id}`, { id, recordedAt, ...payload });
  return { id, recordedAt };
}
