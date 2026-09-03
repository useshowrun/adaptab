import type { AdapterManifest } from "../../packages/adapter-sdk/src/types";

export const raisingFiManifest: AdapterManifest = {
  id: "raising-fi.public.funding",
  version: "1.1.0",
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
        "List up to 40 recent public startup funding records from Raising.fi with every currently available public funding field, including amount, round, location, investors, website, description, and hiring signals when present.",
      routeFamily: "public",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 40,
            default: 10,
            description: "Maximum records to return from Raising.fi's current public dataset.",
          },
        },
        additionalProperties: false,
      },
    },
  ],
};
