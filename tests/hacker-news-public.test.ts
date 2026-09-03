import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { hackerNewsPublicBundleSource } from "../adapters/hacker-news/public/bundle";

type RegisteredTool = { name: string; execute: (input?: unknown) => Promise<unknown> };

function storyRow(id: string, title: string) {
  const links = [{ textContent: "7 comments" }];
  const subtext = {
    querySelector: (selector: string) => ({
      ".score": { textContent: "42 points" },
      ".hnuser": { textContent: "agent" },
      ".age": { textContent: "1 hour ago" },
    })[selector] ?? null,
    querySelectorAll: (selector: string) => selector === "a" ? links : [],
  };
  return {
    id,
    querySelector: (selector: string) => ({
      ".titleline > a": { textContent: title, href: `https://example.test/${id}` },
      ".rank": { textContent: "1." },
      ".sitestr": { textContent: "example.test" },
    })[selector] ?? null,
    nextElementSibling: { querySelector: (selector: string) => selector === ".subtext" ? subtext : null },
  };
}

function makePage(origin = "https://news.ycombinator.com") {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const rows = [storyRow("123", "WebMCP arrives"), storyRow("124", "Agent-native web")];
  const querySelectorAll = vi.fn((selector: string) => selector === "tr.athing" ? rows : []);
  const context = {
    window: pageWindow,
    document: {
      modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } },
      querySelectorAll,
    },
    location: { origin, href: `${origin}/` },
  };
  return { context, registered, querySelectorAll };
}

describe("Hacker News public installer", () => {
  it("registers its read-only DOM tool idempotently and guards origin", async () => {
    const { context, registered } = makePage();
    await expect(runInNewContext(hackerNewsPublicBundleSource, context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(hackerNewsPublicBundleSource, context)).resolves.toMatchObject({ status: "already_installed" });
    expect(registered.map((tool) => tool.name)).toEqual(["adaptab_hacker_news_front_page"]);
    await expect(runInNewContext(hackerNewsPublicBundleSource, makePage("https://news.ycombinator.com.attacker.test").context)).rejects.toThrow("origin guard");
  });

  it("reads and bounds current-page stories without a network request", async () => {
    const { context, registered, querySelectorAll } = makePage();
    await runInNewContext(hackerNewsPublicBundleSource, context);
    const result = await registered[0].execute({ limit: 1 });
    expect(result).toMatchObject({
      count: 1,
      stories: [{
        id: "123",
        title: "WebMCP arrives",
        author: "agent",
        points: 42,
        commentCount: 7,
        discussionUrl: "https://news.ycombinator.com/item?id=123",
      }],
    });
    expect(querySelectorAll).toHaveBeenCalledWith("tr.athing");
  });

  it("rejects malformed input before reading the page", async () => {
    const { context, registered, querySelectorAll } = makePage();
    await runInNewContext(hackerNewsPublicBundleSource, context);
    querySelectorAll.mockClear();
    await expect(registered[0].execute({ limit: 11 })).rejects.toThrow();
    await expect(registered[0].execute({ limit: 1, endpoint: "https://attacker.test" })).rejects.toThrow();
    expect(querySelectorAll).not.toHaveBeenCalled();
  });
});
