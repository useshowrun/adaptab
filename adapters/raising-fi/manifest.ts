import type { AdapterManifest } from "../../packages/adapter-sdk/src/types";

export const raisingFiManifest: AdapterManifest = {
  id: "raising-fi.public.funding",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "Raising.fi public funding",
  origins: ["https://raising.fi", "https://www.raising.fi"],
  pathPatterns: ["/*"],
  intentPatterns: [
    "funding",
    "funded",
    "fundraise",
    "fundraising",
    "investment",
    "raised",
    "recent rounds",
    "startup rounds",
  ],
  networkAllowlist: ["/api/funding"],
  tools: [
    {
      name: "adaptab_raising_fi_list_recent_funding",
      description:
        "List a small number of recent public startup funding records from Raising.fi. Returns only company name, raise date, and industry.",
      routeFamily: "public",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            default: 3,
            description: "Maximum records to return.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
};
