import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import { buildPrivateToolBundle, getPrivateToolManifest, type PrivateToolRepository } from "../../packages/private-tools/src/index";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";
import { BlobPrivateToolRepository } from "./_shared/private-tools.mts";

type Dependencies = {
  currentUser: () => Promise<{ id: string } | null>;
  repository: PrivateToolRepository;
  verifyOrigin: (request: Request) => void;
};

function protectOrigin(request: Request) {
  try { verifyRequestOrigin(request); }
  catch { throw new HttpError(403, "origin_rejected", "This private-bundle request must come from the AdapTab origin."); }
}

export function createPrivateBundleHandler(dependencies: Dependencies) {
  return async (request: Request) => {
    try {
      const user = await dependencies.currentUser();
      if (!user) throw new HttpError(401, "authentication_required", "Sign in to retrieve this private bundle.");
      dependencies.verifyOrigin(request);
      const body = await parseJsonBody(request, 1024);
      assertKeys(body, ["toolId", "delivery"]);
      const toolId = requireString(body, "toolId", { min: 36, max: 36 })!;
      const delivery = requireString(body, "delivery", { min: 1, max: 20 })!;
      if (!/^[a-f0-9-]{36}$/i.test(toolId)) throw new HttpError(400, "invalid_input", "toolId is invalid.");
      if (delivery !== "inline") throw new HttpError(400, "unsupported_delivery", "Only inline delivery is available.");
      const record = await dependencies.repository.get(user.id, toolId);
      if (!record) throw new HttpError(404, "private_tool_not_found", "This private tool is unavailable to the signed-in user.");
      if (record.kind === "encrypted-custom") {
        const manifest = getPrivateToolManifest(record);
        return json({
          adapterId: manifest.id,
          version: manifest.version,
          delivery,
          encrypted: true,
          encryptedSource: record.encryptedSource,
          integrity: { algorithm: "sha256", value: record.sourceHash },
          expectedOrigins: manifest.origins,
          expectedPaths: manifest.pathPatterns,
          tools: manifest.tools,
          activation: { method: "client-decrypt-then-cdp-runtime-evaluate", cdp: { method: "Runtime.evaluate", expressionFrom: "decryptedSource", params: { awaitPromise: true, returnByValue: true } } },
          lifecycle: { scope: "current_document", documentNavigation: "reinjection_required", newTab: "separate_injection_required" },
        }, 200, { "cache-control": "private, no-store" });
      }
      const bundle = buildPrivateToolBundle(record);
      return json({
        adapterId: bundle.manifest.id,
        version: bundle.manifest.version,
        delivery,
        source: bundle.source,
        integrity: bundle.integrity,
        expectedOrigins: bundle.manifest.origins,
        expectedPaths: bundle.manifest.pathPatterns,
        tools: bundle.manifest.tools,
        activation: { method: "cdp-runtime-evaluate", cdp: { method: "Runtime.evaluate", expressionFrom: "source", params: { awaitPromise: true, returnByValue: true } } },
        lifecycle: { scope: "current_document", documentNavigation: "reinjection_required", newTab: "separate_injection_required" },
      }, 200, { "cache-control": "private, no-store" });
    } catch (error) { return handleError(error); }
  };
}

export default createPrivateBundleHandler({ currentUser: getUser, repository: new BlobPrivateToolRepository(), verifyOrigin: protectOrigin });
export const config: Config = { path: "/api/private-bundle" };
