export const githubPublicBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "github.public.user-research";
  const VERSION = "1.0.0";
  const EXPECTED_ORIGIN = "https://github.com";
  const API_ORIGIN = "https://api.github.com";
  const TOOL_NAMES = [
    "adaptab_github_search_users",
    "adaptab_github_get_user",
    "adaptab_github_list_top_repositories"
  ];
  const marker = "__adaptab__" + ADAPTER_ID.replace(/[^a-z0-9]/gi, "_");

  if (location.origin !== EXPECTED_ORIGIN) {
    throw new Error("AdapTab origin guard rejected " + location.origin + " for " + ADAPTER_ID + ".");
  }
  if (window.top !== window) {
    throw new Error("AdapTab adapters must be installed in the top-level document.");
  }
  if (typeof document.modelContext?.registerTool !== "function") {
    throw new Error("This document does not expose the WebMCP registerTool API.");
  }

  const previous = window[marker];
  if (previous?.installing === true) {
    return { ok: false, status: "installation_in_progress", adapterId: ADAPTER_ID, version: VERSION };
  }
  if (previous?.version === VERSION && previous?.installed === true) {
    return { ok: true, status: "already_installed", adapterId: ADAPTER_ID, version: VERSION, tools: TOOL_NAMES };
  }

  const assertPage = () => {
    if (location.origin !== EXPECTED_ORIGIN) {
      throw new Error("The GitHub document origin changed; resolve and install the adapter again.");
    }
  };
  const assertObject = (input, allowed) => {
    if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
      throw new Error("Input contains unsupported fields.");
    }
  };
  const parseLogin = (value) => {
    if (typeof value !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) {
      throw new Error("login must be a valid GitHub login containing at most 39 characters.");
    }
    return value;
  };
  const parseInteger = (value, fallback, minimum, maximum, name) => {
    const result = value ?? fallback;
    if (typeof result !== "number" || !Number.isInteger(result) || result < minimum || result > maximum) {
      throw new Error(name + " must be an integer from " + minimum + " through " + maximum + ".");
    }
    return result;
  };
  const text = (value, max = 240) => typeof value === "string" ? value.slice(0, max) : null;
  const githubGet = async (endpoint) => {
    assertPage();
    if (!(endpoint instanceof URL) || endpoint.origin !== API_ORIGIN || endpoint.pathname !== "/search/users" && !endpoint.pathname.startsWith("/users/")) {
      throw new Error("GitHub API allowlist rejected the request.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        headers: { accept: "application/vnd.github+json" },
        signal: controller.signal
      });
      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub public API rate limit reached. Wait for the limit to reset before retrying.");
      }
      if (response.status === 404) throw new Error("GitHub user was not found.");
      if (!response.ok) throw new Error("GitHub returned HTTP " + response.status + ".");
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("GitHub request timed out after 12 seconds.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  window[marker] = { version: VERSION, installed: false, installing: true };
  try {
    const registrations = TOOL_NAMES.map((name) => {
      if (name === "adaptab_github_search_users") {
        return document.modelContext.registerTool({
          name,
          description: "Search public GitHub users through a third-party AdapTab adapter. Returns a small identity shortlist without exposing browser credentials.",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", minLength: 1, maxLength: 80, description: "A public name, login, or other GitHub user search term." },
              limit: { type: "integer", minimum: 1, maximum: 5, default: 3, description: "Maximum users to return." }
            },
            required: ["query"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: true },
          execute: async (input = {}) => {
            assertObject(input, ["query", "limit"]);
            if (typeof input.query !== "string" || input.query.trim().length < 1 || input.query.trim().length > 80) {
              throw new Error("query must contain 1 through 80 characters.");
            }
            const limit = parseInteger(input.limit, 3, 1, 5, "limit");
            const endpoint = new URL("/search/users", API_ORIGIN);
            endpoint.searchParams.set("q", input.query.trim());
            endpoint.searchParams.set("per_page", String(limit));
            const payload = await githubGet(endpoint);
            const users = Array.isArray(payload?.items) ? payload.items.slice(0, limit).map((user) => ({
              login: text(user?.login, 39),
              type: text(user?.type, 30),
              profileUrl: text(user?.html_url, 200)
            })) : [];
            return { ok: true, source: "GitHub public API via a third-party AdapTab adapter", query: input.query.trim(), totalCount: Number(payload?.total_count ?? 0), count: users.length, users };
          }
        });
      }
      if (name === "adaptab_github_get_user") {
        return document.modelContext.registerTool({
          name,
          description: "Get a bounded public GitHub user profile through a third-party AdapTab adapter.",
          inputSchema: {
            type: "object",
            properties: { login: { type: "string", minLength: 1, maxLength: 39, description: "Exact GitHub login." } },
            required: ["login"],
            additionalProperties: false
          },
          annotations: { readOnlyHint: true },
          execute: async (input = {}) => {
            assertObject(input, ["login"]);
            const login = parseLogin(input.login);
            const payload = await githubGet(new URL("/users/" + encodeURIComponent(login), API_ORIGIN));
            return {
              ok: true,
              source: "GitHub public API via a third-party AdapTab adapter",
              user: {
                login: text(payload?.login, 39),
                name: text(payload?.name, 120),
                bio: text(payload?.bio, 300),
                company: text(payload?.company, 120),
                location: text(payload?.location, 120),
                publicRepositories: Number(payload?.public_repos ?? 0),
                followers: Number(payload?.followers ?? 0),
                profileUrl: text(payload?.html_url, 200)
              }
            };
          }
        });
      }
      return document.modelContext.registerTool({
        name,
        description: "List a GitHub user's top public owner repositories by stars through a third-party AdapTab adapter. Forks are excluded and output is bounded.",
        inputSchema: {
          type: "object",
          properties: {
            login: { type: "string", minLength: 1, maxLength: 39, description: "Exact GitHub login." },
            minimumStars: { type: "integer", minimum: 0, maximum: 10000000, default: 0, description: "Exclude repositories below this star count." },
            limit: { type: "integer", minimum: 1, maximum: 10, default: 5, description: "Maximum repositories to return." }
          },
          required: ["login"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: true },
        execute: async (input = {}) => {
          assertObject(input, ["login", "minimumStars", "limit"]);
          const login = parseLogin(input.login);
          const minimumStars = parseInteger(input.minimumStars, 0, 0, 10000000, "minimumStars");
          const limit = parseInteger(input.limit, 5, 1, 10, "limit");
          const endpoint = new URL("/users/" + encodeURIComponent(login) + "/repos", API_ORIGIN);
          endpoint.searchParams.set("sort", "stars");
          endpoint.searchParams.set("direction", "desc");
          endpoint.searchParams.set("per_page", "100");
          endpoint.searchParams.set("type", "owner");
          const payload = await githubGet(endpoint);
          if (!Array.isArray(payload)) throw new Error("GitHub returned an unexpected repository response shape.");
          const repositories = payload
            .filter((repo) => repo?.fork === false && Number(repo?.stargazers_count ?? 0) >= minimumStars)
            .sort((a, b) => Number(b?.stargazers_count ?? 0) - Number(a?.stargazers_count ?? 0))
            .slice(0, limit)
            .map((repo) => ({
              name: text(repo?.name, 120),
              fullName: text(repo?.full_name, 160),
              description: text(repo?.description, 300),
              stars: Number(repo?.stargazers_count ?? 0),
              forks: Number(repo?.forks_count ?? 0),
              language: text(repo?.language, 60),
              archived: repo?.archived === true,
              url: text(repo?.html_url, 200)
            }));
          return { ok: true, source: "GitHub public API via a third-party AdapTab adapter", login, minimumStars, count: repositories.length, repositories };
        }
      });
    });
    await Promise.all(registrations);
    window[marker] = { version: VERSION, installed: true, installing: false };
    return { ok: true, status: "installed", adapterId: ADAPTER_ID, version: VERSION, tools: TOOL_NAMES };
  } catch (error) {
    delete window[marker];
    throw error;
  }
})()`;
