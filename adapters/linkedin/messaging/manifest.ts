import type { AdapterManifest } from "../../../packages/adapter-sdk/src/types";

export const linkedinMessagingManifest: AdapterManifest = {
  id: "linkedin.messaging.send-message",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "LinkedIn prepared messaging",
  origins: ["https://www.linkedin.com"],
  pathPatterns: [
    "/feed",
    "/feed/*",
    "/search",
    "/search/*",
    "/company/*",
    "/mynetwork/*",
    "/in/*",
    "/messaging",
    "/messaging/*",
  ],
  intentPatterns: [
    "send a message",
    "send message",
    "message ",
    "direct message",
    "dm ",
    "write to",
    "contact ",
  ],
  networkAllowlist: [
    "/voyager/api/voyagerIdentityDashProfiles",
    "/voyager/api/me",
    "/voyager/api/voyagerMessagingDashMessengerMessages",
  ],
  executionPolicy: {
    tabStrategy: "reuse_resolved_top_level_tab",
    additionalTabsRequired: false,
    resourceUrls: "tool_inputs",
    profileResolution: "same_origin_network_requests",
    requestConcurrency: "sequential",
  },
  agentGuidance: "Reuse one already-open signed-in LinkedIn top-level tab. Recipient profile URLs are tool inputs, not pages to open. Do not create or navigate to a tab for each recipient; resolve and send through known same-origin requests from the same document.",
  limits: [],
  tools: [
    {
      name: "adaptab_linkedin_prepare_message",
      description:
        "Resolve and preview one LinkedIn recipient and exact message through a third-party AdapTab adapter. This creates only a short-lived local draft and does not send.",
      routeFamily: "messaging",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          profileUrl: {
            type: "string",
            maxLength: 300,
            description: "A LinkedIn /in/ profile URL for the intended recipient.",
          },
          message: {
            type: "string",
            minLength: 1,
            maxLength: 1000,
            description: "The exact message to preview. It is not sent by this tool.",
          },
        },
        required: ["profileUrl", "message"],
        additionalProperties: false,
      },
    },
    {
      name: "adaptab_linkedin_send_prepared_message",
      description:
        "Send exactly one previously prepared LinkedIn message through a third-party AdapTab adapter. This has an external side effect, requires confirm=SEND, marks the draft attempted before the request, and never retries an ambiguous outcome.",
      routeFamily: "messaging",
      readOnly: false,
      requiresConfirmation: true,
      inputSchema: {
        type: "object",
        properties: {
          draftId: { type: "string", description: "The exact draft ID returned by the prepare tool." },
          confirm: { type: "string", const: "SEND", description: "Must be exactly SEND." },
        },
        required: ["draftId", "confirm"],
        additionalProperties: false,
      },
    },
  ],
};
