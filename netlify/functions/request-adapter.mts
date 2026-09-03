import type { Config } from "@netlify/functions";
import { appendEvent, checkBestEffortRateLimit } from "./_shared/events.mts";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";

export default async (request: Request) => {
  try {
    checkBestEffortRateLimit(request);
    const body = await parseJsonBody(request);
    assertKeys(body, ["url", "desiredAction", "pageFamily", "notes"]);
    const rawUrl = requireString(body, "url", { min: 8, max: 2048 })!;
    const desiredAction = requireString(body, "desiredAction", { min: 3, max: 300 })!;
    const pageFamily = requireString(body, "pageFamily", { max: 100, optional: true });
    const notes = requireString(body, "notes", { max: 500, optional: true });
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { throw new HttpError(400, "invalid_url", "url must be an absolute HTTP or HTTPS URL."); }
    if (!["http:", "https:"].includes(parsed.protocol)) throw new HttpError(400, "invalid_url", "url must use HTTP or HTTPS.");
    const event = await appendEvent("requests", {
      hostname: parsed.hostname.toLowerCase(),
      desiredAction,
      ...(pageFamily ? { pageFamily } : {}),
      ...(notes ? { notes } : {}),
    });
    return json({ ok: true, requestId: event.id, recordedAt: event.recordedAt, storedHostname: parsed.hostname.toLowerCase() }, 202);
  } catch (error) {
    return handleError(error);
  }
};

export const config: Config = { path: "/api/request-adapter" };
