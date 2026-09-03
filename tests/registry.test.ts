import { describe, expect, it } from "vitest";
import { getBundle, resolveAdapter, sha256 } from "../packages/registry/src/catalog";
import { resolveAvailableAdapters } from "../packages/registry/src/available";
import { createPrivateToolRecord } from "../packages/private-tools/src/index";

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

  it("selects only the LinkedIn messaging group for a send intent", () => {
    const result = resolveAdapter({
      url: "https://www.linkedin.com/in/example/",
      intent: "send a message to this profile",
      client: "chatgpt-integrated-browser",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("linkedin.messaging.send-message");
      expect(result.tools.map((tool) => tool.name)).toEqual([
        "adaptab_linkedin_prepare_message",
        "adaptab_linkedin_send_prepared_message",
      ]);
      expect(result.tools[1]).toMatchObject({ readOnly: false, requiresConfirmation: true });
    }
  });

  it("selects guarded search outreach before broader LinkedIn groups", () => {
    const result = resolveAdapter({
      url: "https://www.linkedin.com/search/results/people/?keywords=OpenAI",
      intent: "send messages to search results",
      client: "chatgpt-integrated-browser",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("linkedin.messaging.search-outreach");
      expect(result.tools.map((tool) => tool.name)).toEqual([
        "adaptab_linkedin_prepare_search_messages",
        "adaptab_linkedin_send_search_messages",
      ]);
      expect(result.tools[1]).toMatchObject({ readOnly: false, requiresConfirmation: true });
    }
  });

  it("selects the GitHub public user-research group", () => {
    const result = resolveAdapter({
      url: "https://github.com/useshowrun/adaptab",
      intent: "list the organization's top repositories by stars",
      client: "chatgpt-integrated-browser",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("github.public.user-research");
      expect(result.tools.map((tool) => tool.name)).toEqual([
        "adaptab_github_search_users",
        "adaptab_github_get_user",
        "adaptab_github_list_top_repositories",
      ]);
    }
  });

  it("selects the Hacker News current front-page group", () => {
    const result = resolveAdapter({
      url: "https://news.ycombinator.com/news",
      intent: "list the current Hacker News front page",
      client: "cdp",
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match.adapterId).toBe("hacker-news.public.front-page");
      expect(result.tools.map((tool) => tool.name)).toEqual(["adaptab_hacker_news_front_page"]);
    }
    expect(resolveAdapter({
      url: "https://news.ycombinator.com.attacker.test/news",
      intent: "Hacker News",
      client: "cdp",
    }).matched).toBe(false);
  });

  it("merges route-matched private adapters without overriding an unrelated public intent", () => {
    const privateRecord = createPrivateToolRecord("owner-a", {
      label: "Leadership circle",
      recipientProfileUrls: ["https://www.linkedin.com/in/example"],
    });
    const result = resolveAvailableAdapters({
      url: "https://www.linkedin.com/search/results/companies/",
      intent: "search LinkedIn companies",
      client: "chatgpt-integrated-browser",
    }, [privateRecord], true);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.match).toMatchObject({ adapterId: "linkedin.core.company-search", visibility: "public" });
    expect(result.access.privateWorkspace).toBe("connected");
    expect(result.availableAdapters.some((adapter) => adapter.adapterId === `private.${privateRecord.id}`)).toBe(true);
    expect(JSON.stringify(result.availableAdapters)).not.toContain("linkedin.com/in/example");
  });

  it("selects an owner-private adapter only when the intent identifies it", () => {
    const privateRecord = createPrivateToolRecord("owner-a", {
      label: "Leadership circle",
      recipientProfileUrls: ["https://www.linkedin.com/in/example"],
    });
    const result = resolveAvailableAdapters({
      url: "https://www.linkedin.com/feed/",
      intent: "use my private Leadership circle tool",
      client: "cdp",
    }, [privateRecord], true);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.match).toMatchObject({
        adapterId: `private.${privateRecord.id}`,
        visibility: "private",
        toolUrl: `/tools/${privateRecord.id}`,
      });
      expect(result.activation.nextTool).toBe("adaptab_get_bundle");
      expect(result.tools).toHaveLength(2);
    }
  });

  it("reports a connected but empty private workspace distinctly from signed out", () => {
    const input = { url: "https://raising.fi/", intent: "recent", client: "cdp" as const };
    expect(resolveAvailableAdapters(input, [], true).access.privateWorkspace).toBe("connected");
    expect(resolveAvailableAdapters(input, [], false).access.privateWorkspace).toBe("signed_out");
  });
});

describe("immutable bundle", () => {
  it("returns a stable SHA-256 and strict origin guard", () => {
    const record = getBundle("raising-fi.public.funding", "1.1.0");
    expect(record).toBeDefined();
    expect(sha256(record!.source)).toMatch(/^[a-f0-9]{64}$/);
    expect(record!.source).toContain("ALLOWED_ORIGINS");
    expect(record!.source).toContain("credentials: \"same-origin\"");
  });

  it("keeps the original Raising.fi bundle addressable after publishing its expanded schema", () => {
    const legacy = getBundle("raising-fi.public.funding", "1.0.0");
    expect(legacy).toBeDefined();
    expect(sha256(legacy!.source)).toBe("ffb9e5e75d6ee8687f00b8231e65091667ce93c17b6429b31a13af3a1e88ce0b");
    expect(resolveAdapter({ url: "https://raising.fi/", intent: "funding", client: "cdp" })).toMatchObject({
      matched: true,
      match: { version: "1.1.0" },
    });
  });
});
