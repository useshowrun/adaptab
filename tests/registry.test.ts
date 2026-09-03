import { describe, expect, it } from "vitest";
import { getBundle, resolveAdapter, sha256 } from "../packages/registry/src/catalog";

describe("adapter resolution", () => {
  it("matches the Raising.fi funding intent", () => {
    const result = resolveAdapter({
      url: "https://www.raising.fi/about?private=discarded",
      intent: "Show me the most recently funded startups",
      client: "chatgpt-integrated-browser",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("raising-fi.public.funding");
      expect(result.activation.lifecycle.documentNavigation).toBe("reinjection_required");
      expect(result.tools).toHaveLength(1);
    }
  });

  it("rejects lookalike and insecure origins", () => {
    expect(resolveAdapter({ url: "https://raising.fi.evil.test/", intent: "funding", client: "cdp" }).matched).toBe(false);
    expect(resolveAdapter({ url: "http://raising.fi/", intent: "funding", client: "cdp" })).toMatchObject({ matched: false, reason: "https_required" });
  });

  it("does not expose unrelated tools for an unsupported intent", () => {
    expect(resolveAdapter({ url: "https://raising.fi/", intent: "send a message", client: "cdp" })).toMatchObject({
      matched: false,
      reason: "intent_not_supported",
    });
  });

  it("selects only LinkedIn core search on supported routes and intent", () => {
    const result = resolveAdapter({
      url: "https://www.linkedin.com/mynetwork/catch-up/all/",
      intent: "search for the OpenAI company",
      client: "chatgpt-integrated-browser",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("linkedin.core.company-search");
      expect(result.tools.map((tool) => tool.name)).toEqual(["adaptab_linkedin_search_companies"]);
    }
    expect(resolveAdapter({
      url: "https://www.linkedin.com/jobs/",
      intent: "search companies",
      client: "cdp",
    })).toMatchObject({ matched: false, reason: "site_or_route_not_supported" });
  });
});

describe("immutable bundle", () => {
  it("returns a stable SHA-256 and strict origin guard", () => {
    const record = getBundle("raising-fi.public.funding", "1.0.0");
    expect(record).toBeDefined();
    expect(sha256(record!.source)).toMatch(/^[a-f0-9]{64}$/);
    expect(record!.source).toContain("ALLOWED_ORIGINS");
    expect(record!.source).toContain("credentials: \"same-origin\"");
  });
});
