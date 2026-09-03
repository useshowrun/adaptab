import { describe, expect, it } from "vitest";
import { HttpError, parseJsonBody, requireString } from "../netlify/functions/_shared/http.mts";

describe("HTTP input validation", () => {
  it("parses a bounded JSON object", async () => {
    const request = new Request("https://adaptab.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "funding" }),
    });
    await expect(parseJsonBody(request)).resolves.toEqual({ intent: "funding" });
  });

  it("rejects arrays and oversized strings", async () => {
    const request = new Request("https://adaptab.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    await expect(parseJsonBody(request)).rejects.toBeInstanceOf(HttpError);
    expect(() => requireString({ notes: "x".repeat(11) }, "notes", { max: 10 })).toThrow(HttpError);
  });
});
