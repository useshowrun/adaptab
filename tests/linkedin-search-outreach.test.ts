import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { linkedinSearchOutreachBundleSource } from "../adapters/linkedin/search-outreach/bundle";

type RegisteredTool = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  execute: (input?: unknown) => Promise<Record<string, any>>;
};

const people = [
  { vanity: "ada-lovelace", name: ["Ada", "Lovelace"], urn: "urn:li:fsd_profile:ada" },
  { vanity: "grace-hopper", name: ["Grace", "Hopper"], urn: "urn:li:fsd_profile:grace" },
  { vanity: "katherine-johnson", name: ["Katherine", "Johnson"], urn: "urn:li:fsd_profile:katherine" },
  { vanity: "hidden-fourth", name: ["Hidden", "Fourth"], urn: "urn:li:fsd_profile:hidden" },
];

function makePage(options: { failAtPost?: number; pathname?: string } = {}) {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  let postCount = 0;
  const fetchMock = vi.fn(async (endpoint: URL, request: RequestInit) => {
    if (endpoint.pathname === "/voyager/api/voyagerIdentityDashProfiles") {
      const vanity = endpoint.searchParams.get("memberIdentity");
      const person = people.find((candidate) => candidate.vanity === vanity);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          included: person ? [{
            entityUrn: person.urn,
            publicIdentifier: person.vanity,
            firstName: person.name[0],
            lastName: person.name[1],
          }] : [],
        }),
      };
    }
    if (endpoint.pathname === "/voyager/api/me") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ miniProfile: { dashEntityUrn: "urn:li:fsd_profile:sender" } }),
      };
    }
    if (endpoint.pathname === "/voyager/api/voyagerMessagingDashMessengerMessages") {
      postCount += 1;
      if (postCount === options.failAtPost) throw new Error("network outcome unknown");
      return { ok: true, status: 200, json: async () => ({ status: "created" }) };
    }
    throw new Error(`Unexpected endpoint: ${endpoint.href} ${request.method}`);
  });
  const cards = people.map((person) => ({
    querySelector: () => ({ href: `https://www.linkedin.com/in/${person.vanity}/` }),
  }));
  const pathname = options.pathname ?? "/search/results/people/";
  const href = `https://www.linkedin.com${pathname}?keywords=computing`;
  const context = {
    window: pageWindow,
    document: {
      cookie: 'JSESSIONID="ajax:search-csrf"',
      querySelectorAll: () => cards,
      modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } },
    },
    location: { origin: "https://www.linkedin.com", pathname, href },
    URL,
    URLSearchParams,
    AbortController,
    Uint8Array,
    Date,
    Error,
    Set,
    Array,
    Number,
    Object,
    Promise,
    setTimeout,
    clearTimeout,
    fetch: fetchMock,
    crypto: webcrypto,
  };
  return { context, registered, fetchMock };
}

function tool(tools: RegisteredTool[], name: string) {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

describe("LinkedIn guarded search outreach installer", () => {
  it("previews and verifies no more than three visible recipients without sending", async () => {
    const page = makePage();
    await runInNewContext(linkedinSearchOutreachBundleSource, page.context);
    expect(page.registered.map(({ name }) => name)).toEqual([
      "adaptab_linkedin_prepare_search_messages",
      "adaptab_linkedin_send_search_messages",
    ]);
    expect(page.registered[1].annotations?.readOnlyHint).toBe(false);
    const prepared = await tool(page.registered, "adaptab_linkedin_prepare_search_messages").execute({
      message: "A reviewed message",
      limit: 3,
    });
    expect(prepared).toMatchObject({
      ok: true,
      sent: false,
      recipientCount: 3,
      message: "A reviewed message",
      confirmationCode: "SEND_3_MESSAGES",
      recipients: [
        { name: "Ada Lovelace", profileUrl: "https://www.linkedin.com/in/ada-lovelace/" },
        { name: "Grace Hopper", profileUrl: "https://www.linkedin.com/in/grace-hopper/" },
        { name: "Katherine Johnson", profileUrl: "https://www.linkedin.com/in/katherine-johnson/" },
      ],
    });
    expect(page.fetchMock).toHaveBeenCalledTimes(3);
    expect(page.fetchMock.mock.calls.some(([, request]) => request.method === "POST")).toBe(false);
  });

  it("requires the batch-specific code and sends each reviewed recipient once", async () => {
    const page = makePage();
    await runInNewContext(linkedinSearchOutreachBundleSource, page.context);
    const prepare = tool(page.registered, "adaptab_linkedin_prepare_search_messages");
    const send = tool(page.registered, "adaptab_linkedin_send_search_messages");
    const prepared = await prepare.execute({ message: "Exact shared message", limit: 2 });
    await expect(send.execute({ batchId: prepared.batchId, confirm: "SEND_3_MESSAGES" })).rejects.toThrow("does not match");
    const sent = await send.execute({ batchId: prepared.batchId, confirm: "SEND_2_MESSAGES" });
    expect(sent).toMatchObject({ ok: true, sent: true, recipientCount: 2, retryAllowed: false });
    const posts = page.fetchMock.mock.calls.filter(([, request]) => request.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts.map(([, request]) => JSON.parse(String(request.body)).hostRecipientUrns[0])).toEqual([
      "urn:li:fsd_profile:ada",
      "urn:li:fsd_profile:grace",
    ]);
    await expect(send.execute({ batchId: prepared.batchId, confirm: "SEND_2_MESSAGES" })).rejects.toThrow("already attempted");
    const second = await prepare.execute({ message: "A second batch", limit: 1 });
    await expect(send.execute({ batchId: second.batchId, confirm: "SEND_1_MESSAGES" })).rejects.toThrow("already attempted in this document");
    expect(page.fetchMock.mock.calls.filter(([, request]) => request.method === "POST")).toHaveLength(2);
  });

  it("stops the batch after an ambiguous result and never retries", async () => {
    const page = makePage({ failAtPost: 2 });
    await runInNewContext(linkedinSearchOutreachBundleSource, page.context);
    const prepare = tool(page.registered, "adaptab_linkedin_prepare_search_messages");
    const send = tool(page.registered, "adaptab_linkedin_send_search_messages");
    const prepared = await prepare.execute({ message: "Do not retry", limit: 3 });
    const result = await send.execute({ batchId: prepared.batchId, confirm: "SEND_3_MESSAGES" });
    expect(result).toMatchObject({
      ok: false,
      partial: true,
      stoppedAfterAmbiguousFailure: true,
      retryAllowed: false,
      results: [
        { name: "Ada Lovelace", status: "sent" },
        { name: "Grace Hopper", status: "ambiguous" },
        { name: "Katherine Johnson", status: "not_attempted" },
      ],
    });
    const callsAfterFailure = page.fetchMock.mock.calls.length;
    await expect(send.execute({ batchId: prepared.batchId, confirm: "SEND_3_MESSAGES" })).rejects.toThrow("already attempted");
    expect(page.fetchMock).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("refuses to run after leaving the exact People search route", async () => {
    const page = makePage({ pathname: "/feed/" });
    await runInNewContext(linkedinSearchOutreachBundleSource, page.context);
    await expect(tool(page.registered, "adaptab_linkedin_prepare_search_messages").execute({
      message: "Wrong route",
    })).rejects.toThrow("People search-results page");
  });
});
