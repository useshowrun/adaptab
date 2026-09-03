import { getUser, verifyRequestOrigin } from "@netlify/identity";
import type { Config } from "@netlify/functions";
import { resolveAvailableAdapters } from "../../packages/registry/src/available";
import type { ClientKind } from "../../packages/adapter-sdk/src/types";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";
import { BlobPrivateToolRepository } from "./_shared/private-tools.mts";
import type { PrivateToolRepository } from "../../packages/private-tools/src/index";

type Dependencies = {
  currentUser: () => Promise<{ id: string } | null>;
  repository: PrivateToolRepository;
  verifyOrigin: (request: Request) => void;
};

function protectOrigin(request: Request) {
  try { verifyRequestOrigin(request); }
  catch { throw new HttpError(403, "origin_rejected", "Authenticated resolution must come from the AdapTab origin."); }
}

export function createResolveHandler(dependencies: Dependencies) {
  return async (request: Request) => {
  try {
    const body = await parseJsonBody(request);
    assertKeys(body, ["url", "intent", "client"]);
    const url = requireString(body, "url", { min: 8, max: 2048 })!;
    const intent = requireString(body, "intent", { min: 1, max: 300 })!;
    const client = requireString(body, "client", { min: 2, max: 50 }) as ClientKind;
    if (!["chatgpt-integrated-browser", "cdp", "other"].includes(client)) {
      throw new HttpError(400, "invalid_input", "client is not supported.");
    }
    const user = await dependencies.currentUser();
    if (user) dependencies.verifyOrigin(request);
    const privateRecords = user ? await dependencies.repository.list(user.id) : [];
    return json(resolveAvailableAdapters({ url, intent, client }, privateRecords, Boolean(user)), 200, {
      "cache-control": user ? "private, no-store" : "public, max-age=60",
    });
  } catch (error) {
    return handleError(error);
  }
  };
}

export default createResolveHandler({ currentUser: getUser, repository: new BlobPrivateToolRepository(), verifyOrigin: protectOrigin });

export const config: Config = { path: "/api/resolve" };
