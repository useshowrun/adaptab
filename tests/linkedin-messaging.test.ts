import { webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { linkedinMessagingBundleSource } from "../adapters/linkedin/messaging/bundle";

type RegisteredTool = {
  name: string;
  annotations?: { readOnlyHint?: boolean };
  execute: (input?: unknown) => Promise<Record<string, unknown>>;
};

function makePage(options: { failSend?: boolean; publicIdentifier?: string } = {}) {
  const registered: RegisteredTool[] = [];
  const pageWindow: Record<string, unknown> = {};
  pageWindow.top = pageWindow;
  const fetchMock = vi.fn(async (endpoint: URL, request: RequestInit) => {
    if (endpoint.pathname === "/voyager/api/voyagerIdentityDashProfiles") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          included: [{
            $type: "com.linkedin.voyager.dash.identity.profile.Profile",
            entityUrn: "urn:li:fsd_profile:recipient-123",
            publicIdentifier: options.publicIdentifier ?? "example-person",
            firstName: "Example",
            lastName: "Person",
          }],
        }),
      };
    }
    if (endpoint.pathname === "/voyager/api/me") {
      return {
        ok: true,
        status: 200,
        json: async () => ({ miniProfile: { dashEntityUrn: "urn:li:fsd_profile:sender-456" } }),
      };
    }
    if (endpoint.pathname === "/voyager/api/voyagerMessagingDashMessengerMessages") {
      if (options.failSend) throw new Error("network outcome unknown");
      return { ok: true, status: 200, json: async () => ({ status: "created" }) };
    }
    throw new Error(`Unexpected endpoint: ${endpoint.href} ${request.method}`);
  });
  const context = {
    window: pageWindow,
    document: {
      cookie: 'JSESSIONID="ajax:message-csrf"',
      modelContext: { registerTool: async (tool: RegisteredTool) => { registered.push(tool); } },
    },
    location: { origin: "https://www.linkedin.com" },
    URL,
    URLSearchParams,
    AbortController,
    Uint8Array,
    Date,
    setTimeout,
    clearTimeout,
    fetch: fetchMock,
    crypto: webcrypto,
  };
  return { context, registered, fetchMock };
}

function findTool(tools: RegisteredTool[], name: string) {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  return tool;
}

describe("LinkedIn messaging installer", () => {
  it("prepares an exact verified draft without sending", async () => {
    const page = makePage();
    await runInNewContext(linkedinMessagingBundleSource, page.context);
    expect(page.registered.map(({ name }) => name)).toEqual([
      "adaptab_linkedin_prepare_message",
      "adaptab_linkedin_send_prepared_message",
    ]);
    expect(page.registered[1].annotations?.readOnlyHint).toBe(false);
    const prepared = await findTool(page.registered, "adaptab_linkedin_prepare_message").execute({
      profileUrl: "https://tr.linkedin.com/in/example-person/",
      message: "Exact message",
    });
    expect(prepared).toMatchObject({
      ok: true,
      sent: false,
      recipient: {
        name: "Example Person",
        publicIdentifier: "example-person",
        profileUrl: "https://www.linkedin.com/in/example-person/",
      },
      message: "Exact message",
      nextTool: "adaptab_linkedin_send_prepared_message",
    });
    expect(typeof prepared.draftId).toBe("string");
    expect(page.fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a reviewed draft at most once with the exact body", async () => {
    const page = makePage();
    await runInNewContext(linkedinMessagingBundleSource, page.context);
    const prepare = findTool(page.registered, "adaptab_linkedin_prepare_message");
    const send = findTool(page.registered, "adaptab_linkedin_send_prepared_message");
    const prepared = await prepare.execute({
      profileUrl: "https://www.linkedin.com/in/example-person/",
      message: "One exact message",
    });
    const sent = await send.execute({ draftId: prepared.draftId, confirm: "SEND" });
    expect(sent).toMatchObject({ ok: true, sent: true, message: "One exact message", retryAllowed: false });
    const postCall = page.fetchMock.mock.calls.find(([, request]) => request.method === "POST");
    expect(postCall).toBeDefined();
    const body = JSON.parse(String(postCall![1].body));
    expect(body.message.body.text).toBe("One exact message");
    expect(body.hostRecipientUrns).toEqual(["urn:li:fsd_profile:recipient-123"]);
    expect(body.mailboxUrn).toBe("urn:li:fsd_profile:sender-456");
    await expect(send.execute({ draftId: prepared.draftId, confirm: "SEND" })).rejects.toThrow("already attempted");
    expect(page.fetchMock).toHaveBeenCalledTimes(3);
  });

  it("locks a draft before an ambiguous send and never retries it", async () => {
    const page = makePage({ failSend: true });
    await runInNewContext(linkedinMessagingBundleSource, page.context);
    const prepare = findTool(page.registered, "adaptab_linkedin_prepare_message");
    const send = findTool(page.registered, "adaptab_linkedin_send_prepared_message");
    const prepared = await prepare.execute({
      profileUrl: "https://www.linkedin.com/in/example-person/",
      message: "Ambiguous send",
    });
    await expect(send.execute({ draftId: prepared.draftId, confirm: "SEND" })).rejects.toThrow("network outcome unknown");
    const callsAfterFailure = page.fetchMock.mock.calls.length;
    await expect(send.execute({ draftId: prepared.draftId, confirm: "SEND" })).rejects.toThrow("already attempted");
    expect(page.fetchMock).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("rejects unverified recipients and unsafe inputs", async () => {
    const wrongProfile = makePage({ publicIdentifier: "different-person" });
    await runInNewContext(linkedinMessagingBundleSource, wrongProfile.context);
    const prepare = findTool(wrongProfile.registered, "adaptab_linkedin_prepare_message");
    await expect(prepare.execute({
      profileUrl: "https://www.linkedin.com/in/example-person/",
      message: "Hello",
    })).rejects.toThrow("exact verified profile match");
    await expect(prepare.execute({ profileUrl: "https://attacker.test/in/example-person", message: "Hello" })).rejects.toThrow("LinkedIn /in/ profile");
    await expect(prepare.execute({ profileUrl: "https://www.linkedin.com/in/example-person/extra", message: "Hello" })).rejects.toThrow("LinkedIn /in/ profile");
  });
});
