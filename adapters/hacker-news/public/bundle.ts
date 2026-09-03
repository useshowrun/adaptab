export const hackerNewsPublicBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "hacker-news.public.front-page";
  const VERSION = "1.0.0";
  const EXPECTED_ORIGIN = "https://news.ycombinator.com";
  const TOOL_NAME = "adaptab_hacker_news_front_page";
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
    return { ok: true, status: "already_installed", adapterId: ADAPTER_ID, version: VERSION, tools: [TOOL_NAME] };
  }

  window[marker] = { version: VERSION, installed: false, installing: true };
  try {
    await document.modelContext.registerTool({
      name: TOOL_NAME,
      description: "Read current public Hacker News front-page stories from the open page through a third-party AdapTab adapter. Makes no network request and returns at most ten stories.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "limit")) {
          throw new Error("Input must contain only an optional limit.");
        }
        const limit = input.limit ?? 5;
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10) {
          throw new Error("limit must be an integer from 1 through 10.");
        }
        if (location.origin !== EXPECTED_ORIGIN) {
          throw new Error("The Hacker News document origin changed; resolve and install the adapter again.");
        }

        const text = (value, max = 300) => typeof value === "string" ? value.trim().slice(0, max) : null;
        const rows = Array.from(document.querySelectorAll("tr.athing")).slice(0, limit);
        const stories = rows.map((row) => {
          const titleLink = row.querySelector(".titleline > a");
          const subtext = row.nextElementSibling?.querySelector(".subtext");
          const scoreText = subtext?.querySelector(".score")?.textContent || "";
          const commentsLink = Array.from(subtext?.querySelectorAll("a") || []).find((link) => /comment/i.test(link.textContent || ""));
          return {
            id: text(row.id, 40),
            rank: text(row.querySelector(".rank")?.textContent, 12),
            title: text(titleLink?.textContent, 300),
            url: text(titleLink?.href, 500),
            site: text(row.querySelector(".sitestr")?.textContent, 120),
            author: text(subtext?.querySelector(".hnuser")?.textContent, 80),
            points: Number.parseInt(scoreText, 10) || 0,
            age: text(subtext?.querySelector(".age")?.textContent, 80),
            commentCount: commentsLink ? Number.parseInt(commentsLink.textContent || "", 10) || 0 : 0,
            discussionUrl: typeof row.id === "string" && row.id ? "https://news.ycombinator.com/item?id=" + encodeURIComponent(row.id) : null
          };
        }).filter((story) => story.id && story.title);
        return {
          ok: true,
          source: "Current Hacker News document via a third-party AdapTab adapter",
          pageUrl: location.href,
          count: stories.length,
          stories
        };
      }
    });
    window[marker] = { version: VERSION, installed: true, installing: false };
    return { ok: true, status: "installed", adapterId: ADAPTER_ID, version: VERSION, tools: [TOOL_NAME] };
  } catch (error) {
    delete window[marker];
    throw error;
  }
})()`;
