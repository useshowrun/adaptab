import { describe, expect, it } from "vitest";
import {
  buildPrivateToolBundle,
  createEncryptedPrivateToolRecord,
  createPrivateToolRecord,
  normalizeLinkedInProfileUrl,
  type PrivateToolRecord,
  type PrivateToolRepository,
} from "../packages/private-tools/src/index";
import { createPrivateBundleHandler } from "../netlify/functions/private-bundle.mts";
import { createBundleHandler } from "../netlify/functions/bundle.mts";
import { createResolveHandler } from "../netlify/functions/resolve.mts";
import { createPrivateToolHandler } from "../netlify/functions/private-tool.mts";
import { createPrivateToolsHandler } from "../netlify/functions/private-tools.mts";
import { listPublicAdapters } from "../packages/registry/src/catalog";

class MemoryRepository implements PrivateToolRepository {
  records: PrivateToolRecord[] = [];
  async list(ownerId: string) { return this.records.filter((record) => record.ownerId === ownerId); }
  async get(ownerId: string, toolId: string) { return this.records.find((record) => record.ownerId === ownerId && record.id === toolId) ?? null; }
  async put(record: PrivateToolRecord) { this.records.push(record); }
}

function post(body: Record<string, unknown>) {
  return new Request("https://adaptab.test/api/private", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://adaptab.test" },
    body: JSON.stringify(body),
  });
}

describe("private tool configuration", () => {
  it("normalizes approved LinkedIn profile origins and rejects lookalikes", () => {
    expect(normalizeLinkedInProfileUrl("https://tr.linkedin.com/in/eyupulker?trk=test")).toBe("https://www.linkedin.com/in/eyupulker/");
    expect(() => normalizeLinkedInProfileUrl("https://www.linkedin.com.evil.test/in/eyupulker")).toThrow();
    expect(() => normalizeLinkedInProfileUrl("https://user@www.linkedin.com/in/eyupulker")).toThrow();
  });

  it("builds a private, fixed-recipient bundle without interpolating executable input", () => {
    const record = createPrivateToolRecord("owner-a", {
      label: 'Team "; globalThis.pwned = true; //',
      recipientProfileUrls: ["https://www.linkedin.com/in/eyupulker", "https://www.linkedin.com/in/mahmutkaraca"],
    }, new Date("2026-09-03T12:00:00.000Z"));
    const bundle = buildPrivateToolBundle(record);
    expect(bundle.manifest.visibility).toBe("private");
    expect(bundle.manifest.tools).toHaveLength(2);
    expect(bundle.source).toContain("credentials: \"same-origin\"");
    expect(bundle.source).toContain("writeAttempted");
    expect(bundle.source).toContain("SEND_");
    const encodedConfig = bundle.source.match(/const CONFIG = (.*);\n/)?.[1];
    expect(JSON.parse(encodedConfig!).label).toBe(record.label);
    expect(bundle.integrity.value).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps every public-catalog result public", () => {
    expect(listPublicAdapters()).not.toHaveLength(0);
    expect(listPublicAdapters().every((adapter) => adapter.visibility === "public")).toBe(true);
  });

  it("validates an encrypted custom manifest without receiving plaintext source", () => {
    const record = createEncryptedPrivateToolRecord("owner-a", {
      label: "Internal portal reader",
      manifest: {
        version: "1.0.0",
        origins: ["https://portal.example.com"],
        pathPatterns: ["/*"],
        networkAllowlist: ["/api/items"],
        tools: [{
          name: "adaptab_internal_list_items",
          description: "List a bounded set of items from the private portal.",
          routeFamily: "portal",
          readOnly: true,
          requiresConfirmation: false,
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        }],
      },
      encryptedSource: { algorithm: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(32) },
      sourceHash: "a".repeat(64),
    });
    expect(record.kind).toBe("encrypted-custom");
    expect(record.manifest?.visibility).toBe("private");
    expect(record.manifest?.tools[0].name).toBe("adaptab_internal_list_items");
    expect(record).not.toHaveProperty("source");
    expect(JSON.stringify(record)).not.toContain("document.modelContext.registerTool");
  });

  it("rejects custom writes that omit confirmation", () => {
    expect(() => createEncryptedPrivateToolRecord("owner-a", {
      label: "Unsafe writer",
      manifest: {
        version: "1.0.0", origins: ["https://portal.example.com"], pathPatterns: ["/*"], networkAllowlist: [],
        tools: [{ name: "adaptab_unsafe_write", description: "Perform an unsafe unconfirmed write.", routeFamily: "portal", readOnly: false, requiresConfirmation: false, inputSchema: { type: "object" } }],
      },
      encryptedSource: { algorithm: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", ciphertext: "A".repeat(32) }, sourceHash: "a".repeat(64),
    })).toThrow("require confirmation");
  });
});

describe("private tool authorization", () => {
  it("rejects unauthenticated access", async () => {
    const handler = createPrivateToolsHandler({ currentUser: async () => null, repository: new MemoryRepository(), verifyOrigin: () => {} });
    const response = await handler(new Request("https://adaptab.test/api/private-tools"));
    expect(response.status).toBe(401);
  });

  it("creates and lists only the signed-in owner's configuration", async () => {
    const repository = new MemoryRepository();
    let ownerId = "owner-a";
    const handler = createPrivateToolsHandler({ currentUser: async () => ({ id: ownerId }), repository, verifyOrigin: () => {} });
    const created = await handler(post({ label: "Colleague test group", recipientProfileUrls: ["https://tr.linkedin.com/in/eyupulker", "https://www.linkedin.com/in/mahmutkaraca"] }));
    expect(created.status).toBe(201);
    const payload = await created.json();
    expect(payload.tool.recipientProfileUrls).toEqual(["https://www.linkedin.com/in/eyupulker/", "https://www.linkedin.com/in/mahmutkaraca/"]);
    ownerId = "owner-b";
    const listed = await handler(new Request("https://adaptab.test/api/private-tools"));
    expect((await listed.json()).tools).toEqual([]);
  });

  it("returns not found rather than leaking another owner's tool", async () => {
    const repository = new MemoryRepository();
    const record = createPrivateToolRecord("owner-a", { label: "Private group", recipientProfileUrls: ["https://www.linkedin.com/in/example"] });
    await repository.put(record);
    const handler = createPrivateToolHandler({ currentUser: async () => ({ id: "owner-b" }), repository, verifyOrigin: () => {} });
    const response = await handler(post({ toolId: record.id }));
    expect(response.status).toBe(404);
  });

  it("bounds each MVP workspace to twenty tools", async () => {
    const repository = new MemoryRepository();
    for (let index = 0; index < 20; index += 1) {
      await repository.put(createPrivateToolRecord("owner-a", { label: `Private group ${index}`, recipientProfileUrls: ["https://www.linkedin.com/in/example"] }));
    }
    const handler = createPrivateToolsHandler({ currentUser: async () => ({ id: "owner-a" }), repository, verifyOrigin: () => {} });
    const response = await handler(post({ label: "One too many", recipientProfileUrls: ["https://www.linkedin.com/in/example"] }));
    expect(response.status).toBe(409);
  });

  it("delivers an owner-only bundle with private no-store caching", async () => {
    const repository = new MemoryRepository();
    const record = createPrivateToolRecord("owner-a", { label: "Private group", recipientProfileUrls: ["https://www.linkedin.com/in/example"] });
    await repository.put(record);
    const handler = createPrivateBundleHandler({ currentUser: async () => ({ id: "owner-a" }), repository, verifyOrigin: () => {} });
    const response = await handler(post({ toolId: record.id, delivery: "inline" }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.adapterId).toBe(`private.${record.id}`);
    expect(payload.source).toContain(record.recipientProfileUrls![0]);
  });

  it("delivers only ciphertext for an encrypted custom adapter", async () => {
    const repository = new MemoryRepository();
    const record = createEncryptedPrivateToolRecord("owner-a", {
      label: "Internal reader",
      manifest: {
        version: "1.0.0", origins: ["https://portal.example.com"], pathPatterns: ["/*"], networkAllowlist: [],
        tools: [{ name: "adaptab_internal_reader", description: "Read a bounded value from the internal page.", routeFamily: "portal", readOnly: true, requiresConfirmation: false, inputSchema: { type: "object" } }],
      },
      encryptedSource: { algorithm: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", ciphertext: "B".repeat(32) }, sourceHash: "b".repeat(64),
    });
    await repository.put(record);
    const handler = createPrivateBundleHandler({ currentUser: async () => ({ id: "owner-a" }), repository, verifyOrigin: () => {} });
    const response = await handler(post({ toolId: record.id, delivery: "inline" }));
    const payload = await response.json();
    expect(payload.encrypted).toBe(true);
    expect(payload.source).toBeUndefined();
    expect(payload.encryptedSource.ciphertext).toBe("B".repeat(32));
    expect(payload.integrity.value).toBe("b".repeat(64));
  });

  it("resolves the signed-in owner's private adapters through the shared bootstrap endpoint", async () => {
    const repository = new MemoryRepository();
    const record = createPrivateToolRecord("owner-a", { label: "Leadership circle", recipientProfileUrls: ["https://www.linkedin.com/in/example"] });
    await repository.put(record);
    let originChecked = false;
    const handler = createResolveHandler({
      currentUser: async () => ({ id: "owner-a" }),
      repository,
      verifyOrigin: () => { originChecked = true; },
    });
    const response = await handler(post({
      url: "https://www.linkedin.com/feed/",
      intent: "use my private Leadership circle tool",
      client: "chatgpt-integrated-browser",
    }));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(originChecked).toBe(true);
    expect(payload.match.adapterId).toBe(`private.${record.id}`);
  });

  it("does not reveal another owner's adapter through shared resolution", async () => {
    const repository = new MemoryRepository();
    const record = createPrivateToolRecord("owner-a", { label: "Leadership circle", recipientProfileUrls: ["https://www.linkedin.com/in/example"] });
    await repository.put(record);
    const handler = createResolveHandler({ currentUser: async () => ({ id: "owner-b" }), repository, verifyOrigin: () => {} });
    const response = await handler(post({
      url: "https://www.linkedin.com/feed/",
      intent: "use my private Leadership circle tool",
      client: "cdp",
    }));
    const payload = await response.json();
    expect(payload.matched).toBe(false);
    expect(JSON.stringify(payload)).not.toContain(record.id);
  });

  it("uses the shared bundle endpoint for private delivery while preserving owner isolation", async () => {
    const repository = new MemoryRepository();
    const record = createPrivateToolRecord("owner-a", { label: "Leadership circle", recipientProfileUrls: ["https://www.linkedin.com/in/example"] });
    await repository.put(record);
    let ownerId = "owner-b";
    const handler = createBundleHandler({ currentUser: async () => ({ id: ownerId }), repository, verifyOrigin: () => {} });
    const denied = await handler(post({ adapterId: `private.${record.id}`, version: record.version, delivery: "inline" }));
    expect(denied.status).toBe(404);
    ownerId = "owner-a";
    const allowed = await handler(post({ adapterId: `private.${record.id}`, version: record.version, delivery: "inline" }));
    const payload = await allowed.json();
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    expect(payload.source).toContain("document.modelContext.registerTool");
  });

  it("keeps public resolution and bundle delivery usable without authentication", async () => {
    const repository = new MemoryRepository();
    const resolve = createResolveHandler({ currentUser: async () => null, repository, verifyOrigin: () => { throw new Error("should not run"); } });
    const resolved = await resolve(post({ url: "https://raising.fi/", intent: "recently funded startups", client: "cdp" }));
    expect(resolved.status).toBe(200);
    expect(resolved.headers.get("cache-control")).toBe("public, max-age=60");
    const bundle = createBundleHandler({ currentUser: async () => null, repository, verifyOrigin: () => { throw new Error("should not run"); } });
    const response = await bundle(post({ adapterId: "raising-fi.public.funding", version: "1.1.0", delivery: "inline" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("public");
  });
});
