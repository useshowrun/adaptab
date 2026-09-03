import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { linkedinCoreBundleSource } from "../adapters/linkedin/core/bundle";

type RegisteredTool = { name: string; execute: (input?: unknown) => Promise<unknown> };

function makePage(options: { origin?: string; cookie?: string } = {}) {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: { data: { searchDashClustersByAll: { metadata: { totalResultCount: 18 } } } },
      included: [
        {
          $type: "com.linkedin.voyager.dash.search.EntityResultViewModel",
          title: { text: "OpenAI" },
          primarySubtitle: { text: "Research Services" },
          secondarySubtitle: { text: "8M followers" },
          navigationUrl: "https://www.linkedin.com/company/openai/?trk=test",
          secret: "not-returned",
        },
        {
          $type: "com.linkedin.voyager.dash.search.EntityResultViewModel",
          title: { text: "OpenAI Academy" },
          primarySubtitle: { text: "Education" },
          secondarySubtitle: { text: "100 followers" },
          navigationUrl: "https://www.linkedin.com/company/openai-academy/",
        },
      ],
    }),
  }));
  const context = {
    window: pageWindow,
    document: {
      cookie: options.cookie ?? 'lang=v=2; JSESSIONID="ajax:123456"; theme=dark',
      modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } },
    },
    location: { origin: options.origin ?? "https://www.linkedin.com" },
    URL,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchMock,
    encodeURIComponent,
  };
  return { context, registered, fetchMock };
}

describe("LinkedIn core installer", () => {
  it("guards origin and registers idempotently", async () => {
    const page = makePage();
    await expect(runInNewContext(linkedinCoreBundleSource, page.context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(linkedinCoreBundleSource, page.context)).resolves.toMatchObject({ status: "already_installed" });
    expect(page.registered).toHaveLength(1);
    const wrong = makePage({ origin: "https://linkedin.example" });
    await expect(runInNewContext(linkedinCoreBundleSource, wrong.context)).rejects.toThrow("origin guard");
  });

  it("uses the live CSRF cookie without returning it", async () => {
    const page = makePage();
    await runInNewContext(linkedinCoreBundleSource, page.context);
    const result = await page.registered[0].execute({ query: "OpenAI", limit: 1 });
    expect(result).toMatchObject({
      ok: true,
      count: 1,
      totalResultCount: 18,
      companies: [{ name: "OpenAI", followerText: "8M followers", url: "https://www.linkedin.com/company/openai/" }],
    });
    expect(JSON.stringify(result)).not.toContain("ajax:123456");
    expect(JSON.stringify(result)).not.toContain("secret");
    const [endpoint, request] = page.fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.origin).toBe("https://www.linkedin.com");
    expect(endpoint.pathname).toBe("/voyager/api/graphql");
    expect(endpoint.href).toContain("resultType,value:List(COMPANIES)");
    expect(request).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
    expect((request.headers as Record<string, string>)["csrf-token"]).toBe("ajax:123456");
  });

  it("rejects missing sessions and malformed inputs before fetch", async () => {
    const page = makePage({ cookie: "lang=v=2" });
    await runInNewContext(linkedinCoreBundleSource, page.context);
    await expect(page.registered[0].execute({ query: "OpenAI" })).rejects.toThrow("signed-in page session");
    for (const input of [{}, { query: "" }, { query: "x".repeat(81) }, { query: "OpenAI", limit: 9 }, { query: "OpenAI", extra: true }]) {
      await expect(page.registered[0].execute(input)).rejects.toThrow();
    }
    expect(page.fetchMock).not.toHaveBeenCalled();
  });
});
