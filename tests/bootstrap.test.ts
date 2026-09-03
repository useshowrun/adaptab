import { afterEach, describe, expect, it } from "vitest";
import { registerBootstrapTools } from "../apps/web/src/register-bootstrap";

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: originalDocument });
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: originalWindow });
});

describe("bootstrap registration", () => {
  it("starts all registrations before waiting so discovery is not sequentially partial", async () => {
    const definitions: Array<{ name: string }> = [];
    const releases: Array<() => void> = [];
    const registerTool = (definition: { name: string }) => {
      definitions.push(definition);
      return new Promise<void>((resolve) => releases.push(resolve));
    };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: { modelContext: { registerTool } },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {},
    });

    const registration = registerBootstrapTools();
    expect(definitions.map(({ name }) => name)).toEqual([
      "adaptab_resolve",
      "adaptab_get_bundle",
      "adaptab_request_adapter",
      "adaptab_report_result",
    ]);
    releases.forEach((release) => release());
    await expect(registration).resolves.toBe("registered");
  });
});
