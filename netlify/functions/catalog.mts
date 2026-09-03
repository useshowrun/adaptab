import type { Config } from "@netlify/functions";
import { listPublicAdapters } from "../../packages/registry/src/catalog";
import { json } from "./_shared/http.mts";

export default async (request: Request) => {
  if (request.method !== "GET") return json({ error: "method_not_allowed", message: "Use GET." }, 405);
  return json({ adapters: listPublicAdapters() }, 200, { "cache-control": "public, max-age=60, s-maxage=300" });
};

export const config: Config = { path: "/api/catalog" };
