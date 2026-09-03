import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { raisingFiBundleSource } from "../adapters/raising-fi/bundle";

type RegisteredTool = { name: string; execute: (input?: unknown) => Promise<unknown> };

function makePage(origin = "https://www.raising.fi") {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: Array.from({ length: 40 }, (_, index) => ({
        companyName: `Company ${index}`,
        dateOfRaise: "2026-09-01",
        industry: "Software",
        privateField: "do-not-return",
      })),
      pagination: { page: 1 },
    }),
  }));
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

describe("Raising.fi installer", () => {
  it("registers exactly once when installed repeatedly", async () => {
    const { context, registered } = makePage();
    await expect(runInNewContext(raisingFiBundleSource, context)).resolves.toMatchObject({ status: "installed" });
    await expect(runInNewContext(raisingFiBundleSource, context)).resolves.toMatchObject({ status: "already_installed" });
    expect(registered).toHaveLength(1);
  });

  it("guards exact origin and top-level execution", async () => {
    const wrongOrigin = makePage("https://raising.fi.attacker.test");
    await expect(runInNewContext(raisingFiBundleSource, wrongOrigin.context)).rejects.toThrow("origin guard");
    expect(wrongOrigin.registered).toHaveLength(0);
    const iframe = makePage();
    iframe.context.window.top = {};
    await expect(runInNewContext(raisingFiBundleSource, iframe.context)).rejects.toThrow("top-level");
  });

  it("bounds records client-side and uses only the same-origin funding endpoint", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(raisingFiBundleSource, context);
    const result = await registered[0].execute({ limit: 2 });
    expect(result).toMatchObject({ ok: true, count: 2, records: [{ companyName: "Company 0" }, { companyName: "Company 1" }] });
    expect(JSON.stringify(result)).not.toContain("privateField");
    const [endpoint, options] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.href).toBe("https://www.raising.fi/api/funding?page=1&limit=2");
    expect(options).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
  });

  it("rejects malformed inputs before making any request", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(raisingFiBundleSource, context);
    for (const input of [{ limit: 11 }, { limit: "3" }, { limit: -1 }, { limit: 1.5 }, null, { url: "https://attacker.test" }]) {
      await expect(registered[0].execute(input)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
