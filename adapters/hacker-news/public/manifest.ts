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
