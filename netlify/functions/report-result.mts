import type { Config } from "@netlify/functions";
import { appendEvent, checkBestEffortRateLimit } from "./_shared/events.mts";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";

const allowed = {
  outcome: ["success", "failure", "cancelled"],
  latencyBucket: ["lt_1s", "1_3s", "3_10s", "gt_10s", "unknown"],
  client: ["chatgpt-integrated-browser", "cdp", "other"],
  lifecycleReason: ["initial", "spa_navigation", "document_navigation", "manual_reinject", "unknown"],
} as const;

export default async (request: Request) => {
  try {
    checkBestEffortRateLimit(request, 30);
    const body = await parseJsonBody(request);
    assertKeys(body, ["consent", "adapterId", "version", "toolName", "outcome", "errorCode", "latencyBucket", "client", "lifecycleReason"]);
    if (body.consent !== true) throw new HttpError(400, "consent_required", "Telemetry is recorded only when consent is true.");
    const payload = {
      adapterId: requireString(body, "adapterId", { min: 3, max: 100 })!,
      version: requireString(body, "version", { min: 1, max: 30 })!,
      toolName: requireString(body, "toolName", { min: 3, max: 100 })!,
      outcome: requireString(body, "outcome", { min: 3, max: 20 })!,
      errorCode: requireString(body, "errorCode", { max: 80, optional: true }),
      latencyBucket: requireString(body, "latencyBucket", { min: 3, max: 20 })!,
      client: requireString(body, "client", { min: 2, max: 50 })!,
      lifecycleReason: requireString(body, "lifecycleReason", { min: 3, max: 30 })!,
    };
    for (const key of Object.keys(allowed) as Array<keyof typeof allowed>) {
      if (!(allowed[key] as readonly string[]).includes(payload[key]!)) {
        throw new HttpError(400, "invalid_input", `${key} is not an allowed value.`);
      }
    }
    const event = await appendEvent("telemetry", payload);
    return json({ ok: true, eventId: event.id, recordedAt: event.recordedAt }, 202);
  } catch (error) {
    return handleError(error);
  }
};

export const config: Config = { path: "/api/report-result" };
