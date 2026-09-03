import type { AdapterManifest } from "../../../packages/adapter-sdk/src/types";

export const linkedinSearchOutreachManifest: AdapterManifest = {
  id: "linkedin.messaging.search-outreach",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "LinkedIn guarded search outreach",
  origins: ["https://www.linkedin.com"],
  pathPatterns: ["/search/results/people", "/search/results/people/*"],
  intentPatterns: [
    "message search results",
    "message the search results",
    "send messages to search results",
    "message people in this search",
    "message these profiles",
    "outreach to search results",
    "outreach to these profiles",
  ],
  networkAllowlist: [
    "/voyager/api/voyagerIdentityDashProfiles",
    "/voyager/api/me",
    "/voyager/api/voyagerMessagingDashMessengerMessages",
  ],
  tools: [
    {
      name: "adaptab_linkedin_prepare_search_messages",
      description:
        "Preview one exact message for up to three visible LinkedIn People search results through a third-party AdapTab adapter. Resolves every recipient but does not send.",
      routeFamily: "search-results-people",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            minLength: 1,
            maxLength: 1000,
            description: "The exact message to preview for every selected visible recipient.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 3,
            default: 3,
            description: "Maximum visible search-result recipients to preview. Hard-capped at three.",
          },
        },
        required: ["message"],
        additionalProperties: false,
      },
    },
    {
      name: "adaptab_linkedin_send_search_messages",
      description:
        "Send a previously previewed LinkedIn search-result batch through a third-party AdapTab adapter. Requires the batch-specific confirmation code, attempts each recipient at most once, and stops after an ambiguous failure.",
      routeFamily: "search-results-people",
      readOnly: false,
      requiresConfirmation: true,
      inputSchema: {
        type: "object",
        properties: {
          batchId: { type: "string", description: "The exact batch ID returned by the preview tool." },
          confirm: {
            type: "string",
            pattern: "^SEND_[1-3]_MESSAGES$",
            description: "The exact batch-specific confirmation code returned by the preview tool.",
          },
        },
        required: ["batchId", "confirm"],
        additionalProperties: false,
      },
    },
  ],
};
