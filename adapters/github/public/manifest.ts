import type { AdapterManifest } from "../../../packages/adapter-sdk/src/types";

export const githubPublicManifest: AdapterManifest = {
  id: "github.public.user-research",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "GitHub public user research",
  origins: ["https://github.com"],
  pathPatterns: ["/*"],
  intentPatterns: [
    "github user",
    "github profile",
    "developer profile",
    "repositories",
    "repository",
    "repos",
    "open source",
    "stars",
  ],
  networkAllowlist: [
    "https://api.github.com/search/users",
    "https://api.github.com/users/*",
  ],
  tools: [
    {
      name: "adaptab_github_search_users",
      description:
        "Search public GitHub users through a third-party AdapTab adapter. Returns a small identity shortlist without exposing browser credentials.",
      routeFamily: "public-user-research",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            minLength: 1,
            maxLength: 80,
            description: "A public name, login, or other GitHub user search term.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            default: 3,
            description: "Maximum users to return.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "adaptab_github_get_user",
      description:
        "Get a bounded public GitHub user profile through a third-party AdapTab adapter.",
      routeFamily: "public-user-research",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          login: {
            type: "string",
            minLength: 1,
            maxLength: 39,
            description: "Exact GitHub login.",
          },
        },
        required: ["login"],
        additionalProperties: false,
      },
    },
    {
      name: "adaptab_github_list_top_repositories",
      description:
        "List a GitHub user's top public owner repositories by stars through a third-party AdapTab adapter. Forks are excluded and output is bounded.",
      routeFamily: "public-user-research",
      readOnly: true,
      requiresConfirmation: false,
      inputSchema: {
        type: "object",
        properties: {
          login: {
            type: "string",
            minLength: 1,
            maxLength: 39,
            description: "Exact GitHub login.",
          },
          minimumStars: {
            type: "integer",
            minimum: 0,
            maximum: 10000000,
            default: 0,
            description: "Exclude repositories below this star count.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            default: 5,
            description: "Maximum repositories to return.",
          },
        },
        required: ["login"],
        additionalProperties: false,
      },
    },
  ],
};
