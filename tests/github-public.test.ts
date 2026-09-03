import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { githubPublicBundleSource } from "../adapters/github/public/bundle";

type RegisteredTool = { name: string; execute: (input?: unknown) => Promise<unknown> };

function makePage(origin = "https://github.com") {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const fetchMock = vi.fn(async (endpoint: URL) => {
    if (endpoint.pathname === "/search/users") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total_count: 1,
          items: [{ login: "useshowrun", type: "Organization", html_url: "https://github.com/useshowrun", avatar_url: "private-from-output-contract" }],
        }),
      };
    }
    if (endpoint.pathname.endsWith("/repos")) {
      return {
        ok: true,
        status: 200,
        json: async () => ([
          { name: "fork", full_name: "useshowrun/fork", fork: true, stargazers_count: 500, html_url: "https://github.com/useshowrun/fork" },
          { name: "small", full_name: "useshowrun/small", fork: false, stargazers_count: 2, html_url: "https://github.com/useshowrun/small" },
          { name: "adaptab", full_name: "useshowrun/adaptab", description: "WebMCP", fork: false, stargazers_count: 42, forks_count: 3, language: "TypeScript", archived: false, html_url: "https://github.com/useshowrun/adaptab", private: false },
        ]),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ login: "useshowrun", name: "ShowRun", bio: "Agent tools", company: null, location: null, public_repos: 3, followers: 10, html_url: "https://github.com/useshowrun", email: "not-returned@example.test" }),
    };
  });
  const context = {
    window: pageWindow,
    document: { modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } } },
    location: { origin },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchMock,
  };
  return { context, registered, fetchMock };
}

describe("GitHub public installer", () => {
  it("registers its bounded read-only group exactly once", async () => {
    const { context, registered } = makePage();
    await expect(runInNewContext(githubPublicBundleSource, context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(githubPublicBundleSource, context)).resolves.toMatchObject({ status: "already_installed" });
    expect(registered.map((tool) => tool.name)).toEqual([
      "adaptab_github_search_users",
      "adaptab_github_get_user",
      "adaptab_github_list_top_repositories",
    ]);
  });

  it("guards origin and top-level execution", async () => {
    const wrongOrigin = makePage("https://github.com.attacker.test");
    await expect(runInNewContext(githubPublicBundleSource, wrongOrigin.context)).rejects.toThrow("origin guard");
    const iframe = makePage();
    iframe.context.window.top = {};
    await expect(runInNewContext(githubPublicBundleSource, iframe.context)).rejects.toThrow("top-level");
  });

  it("uses fixed GitHub API routes and strips undeclared data", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(githubPublicBundleSource, context);
    const search = registered.find((tool) => tool.name === "adaptab_github_search_users")!;
    const profile = registered.find((tool) => tool.name === "adaptab_github_get_user")!;
    const repositories = registered.find((tool) => tool.name === "adaptab_github_list_top_repositories")!;

    const searchResult = await search.execute({ query: "Showrun", limit: 1 });
    expect(searchResult).toMatchObject({ count: 1, users: [{ login: "useshowrun" }] });
    expect(JSON.stringify(searchResult)).not.toContain("avatar_url");
    const profileResult = await profile.execute({ login: "useshowrun" });
    expect(profileResult).toMatchObject({ user: { login: "useshowrun", publicRepositories: 3 } });
    expect(JSON.stringify(profileResult)).not.toContain("not-returned@example.test");
    const repoResult = await repositories.execute({ login: "useshowrun", minimumStars: 10, limit: 2 });
    expect(repoResult).toMatchObject({ count: 1, repositories: [{ fullName: "useshowrun/adaptab", stars: 42 }] });

    const calls = fetchMock.mock.calls as unknown as Array<[URL, RequestInit]>;
    expect(calls.map(([url]) => url.origin)).toEqual(["https://api.github.com", "https://api.github.com", "https://api.github.com"]);
    expect(calls[0][0].pathname).toBe("/search/users");
    expect(calls[1][0].pathname).toBe("/users/useshowrun");
    expect(calls[2][0].pathname).toBe("/users/useshowrun/repos");
    expect(calls.every(([, options]) => options.credentials === "omit" && options.method === "GET")).toBe(true);
  });

  it("rejects malformed input before any request", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(githubPublicBundleSource, context);
    const search = registered.find((tool) => tool.name === "adaptab_github_search_users")!;
    const profile = registered.find((tool) => tool.name === "adaptab_github_get_user")!;
    await expect(search.execute({ query: "", limit: 20 })).rejects.toThrow();
    await expect(profile.execute({ login: "bad/login" })).rejects.toThrow();
    await expect(profile.execute({ login: "valid", url: "https://attacker.test" })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
