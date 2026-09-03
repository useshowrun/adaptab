import type { Config } from "@netlify/functions";
import { resolveAdapter } from "../../packages/registry/src/catalog";
import type { ClientKind } from "../../packages/adapter-sdk/src/types";
import { assertKeys, handleError, HttpError, json, parseJsonBody, requireString } from "./_shared/http.mts";

export default async (request: Request) => {
  try {
    const body = await parseJsonBody(request);
    assertKeys(body, ["url", "intent", "client"]);
    const url = requireString(body, "url", { min: 8, max: 2048 })!;
    const intent = requireString(body, "intent", { min: 1, max: 300 })!;
    const client = requireString(body, "client", { min: 2, max: 50 }) as ClientKind;
    if (!["chatgpt-integrated-browser", "cdp", "other"].includes(client)) {
      throw new HttpError(400, "invalid_input", "client is not supported.");
    }
    return json(resolveAdapter({ url, intent, client }));
  } catch (error) {
    return handleError(error);
  }
};

export const config: Config = { path: "/api/resolve" };
