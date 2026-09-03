import type { AdapterManifest } from "../../../packages/adapter-sdk/src/types";

export const linkedinCoreManifest: AdapterManifest = {
  id: "linkedin.core.company-search",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "LinkedIn core company search",
  origins: ["https://www.linkedin.com"],
  pathPatterns: [
    "/feed",
    "/feed/*",
    "/search",
    "/search/*",
    "/company/*",
    "/mynetwork/*",
    "/in/*",
  ],
  intentPatterns: [
    "company",
    "companies",
    "organization",
    "organisations",
    "organizations",
    "business search",
    "search",
  ],
  networkAllowlist: ["/voyager/api/graphql"],
  tools: [
    {
      name: "adaptab_linkedin_search_companies",
      description:
        "Search LinkedIn companies through a third-party AdapTab adapter using the live signed-in page session. Returns a bounded list and never returns credentials.",
      routeFamily: "core",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "Company name or keywords to search.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            default: 3,
            description: "Maximum companies to return.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  ],
};
