import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import { getBundle, sha256 } from "../../packages/registry/src/catalog";
import { createPrivateBundlePayload, type PrivateToolRepository } from "../../packages/private-tools/src/index";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";
import { BlobPrivateToolRepository } from "./_shared/private-tools.mts";

type Dependencies = {
  currentUser: () => Promise<{ id: string } | null>;
  repository: PrivateToolRepository;
  verifyOrigin: (request: Request) => void;
};

function protectOrigin(request: Request) {
  try { verifyRequestOrigin(request); }
  catch { throw new HttpError(403, "origin_rejected", "Private bundle retrieval must come from the AdapTab origin."); }
}

export function createBundleHandler(dependencies: Dependencies) {
  return async (request: Request) => {
  try {
    const body = await parseJsonBody(request, 2048);
    assertKeys(body, ["adapterId", "version", "delivery"]);
    const adapterId = requireString(body, "adapterId", { min: 3, max: 100 })!;
    const version = requireString(body, "version", { min: 1, max: 30 })!;
    const delivery = requireString(body, "delivery", { min: 1, max: 20 })!;
    if (delivery !== "inline") throw new HttpError(400, "unsupported_delivery", "Only inline delivery is available in the MVP.");
    if (adapterId.startsWith("private.")) {
      dependencies.verifyOrigin(request);
      const user = await dependencies.currentUser();
      if (!user) throw new HttpError(401, "authentication_required", "Sign in to retrieve this private bundle.");
      const toolId = adapterId.slice("private.".length);
      if (!/^[a-f0-9-]{36}$/i.test(toolId)) throw new HttpError(400, "invalid_input", "Private adapterId is invalid.");
      const privateRecord = await dependencies.repository.get(user.id, toolId);
      if (!privateRecord || privateRecord.version !== version) throw new HttpError(404, "bundle_not_found", "No owner-authorized private bundle matches that adapter version.");
      return json(createPrivateBundlePayload(privateRecord, delivery), 200, { "cache-control": "private, no-store" });
    }
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
      executionPolicy: record.manifest.executionPolicy,
      agentGuidance: record.manifest.agentGuidance,
      limits: record.manifest.limits,
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
}

export default createBundleHandler({ currentUser: getUser, repository: new BlobPrivateToolRepository(), verifyOrigin: protectOrigin });

export const config: Config = { path: "/api/bundle" };
