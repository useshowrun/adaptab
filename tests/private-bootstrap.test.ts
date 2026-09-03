import { afterEach, describe, expect, it } from "vitest";
import { registerPrivateBootstrapTools } from "../apps/web/src/register-private-tools";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: originalWindow });
});

describe("private activation bootstrap", () => {
  it("registers only the authenticated private info and bundle tools", async () => {
    const definitions: Array<{ name: string }> = [];
    Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: { modelContext: { registerTool: (definition: { name: string }) => { definitions.push(definition); } } } });
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: {} });
    await expect(registerPrivateBootstrapTools("00000000-0000-4000-8000-000000000000")).resolves.toBe("registered");
    expect(definitions.map(({ name }) => name)).toEqual(["adaptab_private_tool_info", "adaptab_get_private_bundle"]);
  });
});
