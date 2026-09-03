import { afterEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({
  getUser: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@netlify/identity", () => identity);

import { authenticatedFetch } from "../apps/web/src/api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  identity.getUser.mockReset();
  identity.refreshSession.mockReset();
  globalThis.fetch = originalFetch;
});

describe("browser API authentication", () => {
  it("refreshes a remembered session before sending an authenticated request", async () => {
    identity.getUser.mockResolvedValue({ id: "owner-a" });
    identity.refreshSession.mockResolvedValue("fresh-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;

    await authenticatedFetch("/api/private-tools", { cache: "no-store" });

    expect(identity.refreshSession).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/private-tools", expect.objectContaining({ credentials: "same-origin" }));
    expect(identity.refreshSession.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[0]);
  });

  it("does not refresh when there is no remembered user", async () => {
    identity.getUser.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock;

    await authenticatedFetch("/api/catalog");

    expect(identity.refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
