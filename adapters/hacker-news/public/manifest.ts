import type { AdapterManifest } from "../../../packages/adapter-sdk/src/types";

export const hackerNewsPublicManifest: AdapterManifest = {
  id: "hacker-news.public.front-page",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "Hacker News current front page",
  origins: ["https://news.ycombinator.com"],
  pathPatterns: ["/*"],
  intentPatterns: [
    "hacker news",
    "hn stories",
    "front page",
    "top stories",
    "current stories",
    "news stories",
  ],
  networkAllowlist: [],
  executionPolicy: {
    tabStrategy: "reuse_resolved_top_level_tab",
    additionalTabsRequired: false,
    resourceUrls: "not_applicable",
    profileResolution: "not_applicable",
    requestConcurrency: "not_applicable",
  },
  agentGuidance: "Reuse the resolved Hacker News top-level tab. Read the current document through the adapter; it needs no network request, extra tab, or story-page navigation.",
  limits: [{
    id: "front-page-output-count",
    scope: "input",
    toolName: "adaptab_hacker_news_front_page",
    inputProperty: "limit",
    value: 10,
    reason: "reliability",
    source: "This reviewed DOM reader is fixture-tested with a ten-story normalized output budget.",
    configurable: true,
    description: "The caller may select up to ten stories from the currently open front page.",
  }],
  tools: [
    {
      name: "adaptab_hacker_news_front_page",
      description:
        "Read current public Hacker News front-page stories from the open page through a third-party AdapTab adapter. Makes no network request and returns at most ten stories.",
      routeFamily: "public-front-page",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            default: 5,
          },
        },
        additionalProperties: false,
      },
    },
  ],
};
