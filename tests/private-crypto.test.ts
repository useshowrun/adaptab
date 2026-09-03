import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptPrivateBundle, encryptPrivateSource, materializePrivateBundle, savePrivateToolKey, wrapPrivateSource } from "../apps/web/src/private-crypto";

const originalLocalStorage = globalThis.localStorage;

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
});

afterEach(() => Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage }));

describe("client-encrypted private adapters", () => {
  it("wraps source in top-level exact-origin guards", () => {
    const wrapped = wrapPrivateSource("return { ok: true };", ["https://portal.example.com"], ["/admin/*"]);
    expect(wrapped).toContain('ADAPTAB_PRIVATE_ORIGINS = ["https://portal.example.com"]');
    expect(wrapped).toContain('ADAPTAB_PRIVATE_PATHS = ["/admin/*"]');
    expect(wrapped).toContain("adaptabPathMatches");
    expect(wrapped).toContain("window.top !== window");
  });

  it("round-trips source using a device-local AES-GCM key", async () => {
    const toolId = "00000000-0000-4000-8000-000000000000";
    const encrypted = await encryptPrivateSource("return { ok: true };", ["https://portal.example.com"], ["/private/*"]);
    savePrivateToolKey(toolId, encrypted.key);
    const source = await decryptPrivateBundle(toolId, {
      encrypted: true,
      encryptedSource: encrypted.encryptedSource,
      integrity: { algorithm: "sha256", value: encrypted.sourceHash },
    });
    expect(source).toContain("return { ok: true };");
    expect(source).toContain('ADAPTAB_PRIVATE_PATHS = ["/private/*"]');
    expect(encrypted.encryptedSource.ciphertext).not.toContain("return");
  });

  it("refuses decryption when this browser has no key", async () => {
    await expect(decryptPrivateBundle("missing", {
      encrypted: true,
      encryptedSource: { algorithm: "AES-GCM", iv: "AAAAAAAAAAAAAAAA", ciphertext: "BBBBBBBBBBBBBBBB" },
      integrity: { algorithm: "sha256", value: "a".repeat(64) },
    })).rejects.toThrow("local key is missing");
  });

  it("materializes an encrypted bundle through its shared private adapter identifier", async () => {
    const toolId = "00000000-0000-4000-8000-000000000000";
    const encrypted = await encryptPrivateSource("return { unified: true };", ["https://portal.example.com"]);
    savePrivateToolKey(toolId, encrypted.key);
    const result = await materializePrivateBundle({
      adapterId: `private.${toolId}`,
      encrypted: true,
      encryptedSource: encrypted.encryptedSource,
      integrity: { algorithm: "sha256", value: encrypted.sourceHash },
    });
    expect(result.decryptedInBrowser).toBe(true);
    expect(result.source).toContain("unified: true");
    expect(result.encryptedSource).toBeUndefined();
  });
});
