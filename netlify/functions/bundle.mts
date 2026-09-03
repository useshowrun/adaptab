import type { Config } from "@netlify/functions";
import { getBundle, sha256 } from "../../packages/registry/src/catalog";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";

export default async (request: Request) => {
  try {
    const body = await parseJsonBody(request, 2048);
    assertKeys(body, ["adapterId", "version", "delivery"]);
    const adapterId = requireString(body, "adapterId", { min: 3, max: 100 })!;
    const version = requireString(body, "version", { min: 1, max: 30 })!;
    const delivery = requireString(body, "delivery", { min: 1, max: 20 })!;
    if (delivery !== "inline") throw new HttpError(400, "unsupported_delivery", "Only inline delivery is available in the MVP.");
    const record = getBundle(adapterId, version);
    if (!record) throw new HttpError(404, "bundle_not_found", "No immutable bundle matches that adapter version.");
    const integrity = sha256(record.source);
    return json({
      adapterId,
      version,
      delivery,
      source: record.source,
      integrity: { algorithm: "sha256", value: integrity },
      expectedOrigins: record.manifest.origins,
      expectedPaths: record.manifest.pathPatterns,
      activation: {
        method: "cdp-runtime-evaluate",
        cdp: {
          method: "Runtime.evaluate",
          expressionFrom: "source",
          params: { awaitPromise: true, returnByValue: true },
        },
      },
      lifecycle: {
        scope: "current_document",
        documentNavigation: "reinjection_required",
        newTab: "separate_injection_required",
      },
    }, 200, {
      "cache-control": "public, max-age=300, s-maxage=86400, immutable",
      etag: `\"sha256-${integrity}\"`,
    });
  } catch (error) {
    return handleError(error);
  }
};

export const config: Config = { path: "/api/bundle" };
