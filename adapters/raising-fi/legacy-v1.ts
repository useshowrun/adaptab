import type { AdapterManifest } from "../../packages/adapter-sdk/src/types";

export const raisingFiManifestV1: AdapterManifest = {
  id: "raising-fi.public.funding",
  version: "1.0.0",
  publisher: "adaptab",
  visibility: "public",
  execution: "page",
  product: "Raising.fi public funding",
  origins: ["https://raising.fi", "https://www.raising.fi"],
  pathPatterns: ["/*"],
  intentPatterns: ["funding", "funded", "fundraise", "fundraising", "investment", "raised", "recent rounds", "startup rounds"],
  networkAllowlist: ["/api/funding"],
  executionPolicy: {
    tabStrategy: "reuse_resolved_top_level_tab",
    additionalTabsRequired: false,
    resourceUrls: "not_applicable",
    profileResolution: "not_applicable",
    requestConcurrency: "sequential",
  },
  agentGuidance: "Reuse the resolved Raising.fi top-level tab and use the adapter's known same-origin funding request. No additional tab or exploratory navigation is required.",
  limits: [{
    id: "legacy-record-count",
    scope: "input",
    toolName: "adaptab_raising_fi_list_recent_funding",
    inputProperty: "limit",
    value: 10,
    reason: "reliability",
    source: "This immutable legacy adapter version was implemented and tested with a 10-record output budget.",
    configurable: true,
    description: "Legacy version 1.0.0 accepts a caller-selected result count up to 10 records.",
  }],
  tools: [{
    name: "adaptab_raising_fi_list_recent_funding",
    description: "List a small number of recent public startup funding records from Raising.fi. Returns only company name, raise date, and industry.",
    routeFamily: "public",
    readOnly: true,
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 3, description: "Maximum records to return." } },
      additionalProperties: false,
    },
  }],
};

export const raisingFiBundleSourceV1 = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "raising-fi.public.funding";
  const VERSION = "1.0.0";
  const TOOL_NAME = "adaptab_raising_fi_list_recent_funding";
  const ALLOWED_ORIGINS = new Set(["https://raising.fi", "https://www.raising.fi"]);
  const marker = "__adaptab__" + ADAPTER_ID.replace(/[^a-z0-9]/gi, "_");

  if (!ALLOWED_ORIGINS.has(location.origin)) {
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
      description: "List a small number of recent public startup funding records from Raising.fi. Returns only company name, raise date, and industry.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 10, default: 3, description: "Maximum records to return." }
        },
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "limit")) {
          throw new Error("Input must be an object containing only an optional limit.");
        }
        const requested = input.limit ?? 3;
        if (typeof requested !== "number" || !Number.isInteger(requested) || requested < 1 || requested > 10) {
          throw new Error("limit must be an integer from 1 through 10.");
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        try {
          const endpoint = new URL("/api/funding", location.origin);
          endpoint.searchParams.set("page", "1");
          endpoint.searchParams.set("limit", String(requested));
          const response = await fetch(endpoint, {
            method: "GET",
            credentials: "same-origin",
            redirect: "error",
            headers: { accept: "application/json" },
            signal: controller.signal
          });
          if (!response.ok) throw new Error("Raising.fi returned HTTP " + response.status + ".");
          const payload = await response.json();
          if (!payload || !Array.isArray(payload.data)) {
            throw new Error("Raising.fi returned an unexpected response shape.");
          }
          const records = payload.data.slice(0, requested).map((item) => ({
            companyName: typeof item?.companyName === "string" ? item.companyName : null,
            dateOfRaise: typeof item?.dateOfRaise === "string" ? item.dateOfRaise : null,
            industry: typeof item?.industry === "string" ? item.industry : null
          }));
          return {
            ok: true,
            source: "Raising.fi",
            count: records.length,
            records,
            page: Number(payload.pagination?.page ?? 1)
          };
        } catch (error) {
          if (error?.name === "AbortError") throw new Error("Raising.fi request timed out after 12 seconds.");
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
