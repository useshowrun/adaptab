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
        id: `funding-${index}`,
        companyName: `Company ${index}`,
        slug: `company-${index}`,
        website: `company-${index}.example`,
        companyDescription: `Description ${index}`,
        dateOfRaise: "2026-09-01",
        industry: "Software",
        amountRaised: "$12 Million",
        amountUsd: 12000000,
        raiseType: "Series A",
        location: "Istanbul, Türkiye",
        leadInvestor: "Lead Fund",
        investors: "Investor One, Investor Two",
        hiring: index === 0 ? {
          checkedAt: "2026-09-03T18:03:24.412Z",
          hiringScore: 72,
          openRoles: 5,
          rolesByFunction: { engineering: 3, sales: 2 },
          signals: ["scaling"],
          tools: ["Example CRM"],
        } : undefined,
        privateField: "do-not-return",
      })),
      isPremium: false,
      totalRaisedUsd: 480000000,
      message: "Public funding preview",
      pagination: { page: 1, limit: 40, total: 40, totalPages: 1, hasNextPage: false, hasPrevPage: false },
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

  it("returns every current public funding field while bounding records client-side", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(raisingFiBundleSource, context);
    const result = await registered[0].execute({ limit: 2 });
    expect(result).toMatchObject({
      ok: true,
      count: 2,
      totalRaisedUsd: 480000000,
      records: [
        {
          id: "funding-0",
          companyName: "Company 0",
          slug: "company-0",
          website: "company-0.example",
          companyDescription: "Description 0",
          dateOfRaise: "2026-09-01",
          industry: "Software",
          amountRaised: "$12 Million",
          amountUsd: 12000000,
          raiseType: "Series A",
          location: "Istanbul, Türkiye",
          leadInvestor: "Lead Fund",
          investors: "Investor One, Investor Two",
          hiring: { openRoles: 5, rolesByFunction: { engineering: 3, sales: 2 } },
        },
        { id: "funding-1", companyName: "Company 1", hiring: null },
      ],
      pagination: { page: 1, total: 40, hasNextPage: false },
    });
    expect(JSON.stringify(result)).not.toContain("privateField");
    const [endpoint, options] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(endpoint.href).toBe("https://www.raising.fi/api/funding?page=1&limit=2");
    expect(options).toMatchObject({ method: "GET", credentials: "same-origin", redirect: "error" });
  });

  it("rejects malformed inputs before making any request", async () => {
    const { context, registered, fetchMock } = makePage();
    await runInNewContext(raisingFiBundleSource, context);
    for (const input of [{ limit: 41 }, { limit: "3" }, { limit: -1 }, { limit: 1.5 }, null, { url: "https://attacker.test" }]) {
      await expect(registered[0].execute(input)).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
