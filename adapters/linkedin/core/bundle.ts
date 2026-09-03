export const linkedinCoreBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "linkedin.core.company-search";
  const VERSION = "1.0.0";
  const TOOL_NAME = "adaptab_linkedin_search_companies";
  const EXPECTED_ORIGIN = "https://www.linkedin.com";
  const QUERY_ID = "voyagerSearchDashClusters.05111e1b90ee7fea15bebe9f9410ced9";
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
      description: "Search LinkedIn companies through a third-party AdapTab adapter using the live signed-in page session. Returns a bounded list and never returns credentials.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 80, description: "Company name or keywords to search." },
          limit: { type: "integer", minimum: 1, maximum: 5, default: 3, description: "Maximum companies to return." }
        },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "query" && key !== "limit")) {
          throw new Error("Input must contain only query and an optional limit.");
        }
        const query = input.query;
        const limit = input.limit ?? 3;
        if (typeof query !== "string" || query.trim().length < 1 || query.trim().length > 80) {
          throw new Error("query must contain 1 through 80 characters.");
        }
        if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 5) {
          throw new Error("limit must be an integer from 1 through 5.");
        }
        if (location.origin !== EXPECTED_ORIGIN) {
          throw new Error("The LinkedIn document origin changed; resolve and install the adapter again.");
        }

        const csrfMatch = document.cookie.match(/(?:^|; )JSESSIONID=([^;]+)/);
        const csrfToken = csrfMatch ? csrfMatch[1].replace(/"/g, "") : "";
        if (!csrfToken) {
          throw new Error("LinkedIn's signed-in page session is unavailable. Sign in in this tab and try again.");
        }

        const variables = "(start:0,origin:GLOBAL_SEARCH_HEADER,query:(keywords:" + encodeURIComponent(query.trim()) + ",flagshipSearchIntent:SEARCH_SRP,queryParameters:List((key:resultType,value:List(COMPANIES))),includeFiltersInResponse:false),count:" + limit + ")";
        const endpoint = new URL("/voyager/api/graphql?variables=" + variables + "&queryId=" + QUERY_ID, EXPECTED_ORIGIN);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(endpoint, {
            method: "GET",
            credentials: "same-origin",
            redirect: "error",
            headers: {
              accept: "application/vnd.linkedin.normalized+json+2.1",
              "x-restli-protocol-version": "2.0.0",
              "x-li-lang": "en_US",
              "csrf-token": csrfToken
            },
            signal: controller.signal
          });
          if (response.status === 401 || response.status === 403) {
            throw new Error("LinkedIn rejected the current page session. Sign in again and retry manually.");
          }
          if (!response.ok) throw new Error("LinkedIn returned HTTP " + response.status + ".");
          const payload = await response.json();
          const metadata = payload?.data?.data?.searchDashClustersByAll?.metadata;
          if (!metadata || !Array.isArray(payload?.included)) {
            throw new Error("LinkedIn returned an unexpected company-search response shape.");
          }
          const companies = payload.included
            .filter((item) => typeof item?.$type === "string" && item.$type.includes("EntityResultViewModel"))
            .slice(0, limit)
            .map((item) => ({
              name: typeof item?.title?.text === "string" ? item.title.text : null,
              subtitle: typeof item?.primarySubtitle?.text === "string" ? item.primarySubtitle.text : null,
              followerText: typeof item?.secondarySubtitle?.text === "string" ? item.secondarySubtitle.text : null,
              url: typeof item?.navigationUrl === "string" ? item.navigationUrl.split("?")[0] : null
            }));
          return {
            ok: true,
            source: "LinkedIn via a third-party AdapTab adapter",
            query: query.trim(),
            totalResultCount: Number(metadata.totalResultCount ?? 0),
            count: companies.length,
            companies
          };
        } catch (error) {
          if (error?.name === "AbortError") throw new Error("LinkedIn company search timed out after 12 seconds.");
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      }
    });
    window[marker] = { version: VERSION, installed: true, installing: false };
    return { ok: true, status: "installed", adapterId: ADAPTER_ID, version: VERSION, tools: [TOOL_NAME] };
  } catch (error) {
    delete window[marker];
    throw error;
  }
})()`;
