import { postJson } from "./api";
import { decryptPrivateBundle, type EncryptedPrivateBundle } from "./private-crypto";

const markerPrefix = "__adaptabPrivateBootstrapV1_";
const workspaceMarker = "__adaptabPrivateWorkspaceV1";

export async function registerPrivateWorkspaceTools(): Promise<"registered" | "already_registered" | "unsupported"> {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool !== "function") return "unsupported";
  const state = window as unknown as Window & Record<string, unknown>;
  if (state[workspaceMarker]) return "already_registered";
  state[workspaceMarker] = true;
  try {
    await modelContext.registerTool({
      name: "adaptab_list_private_tools",
      description: "List the signed-in owner's private WebMCP adapter packages and every individual tool they expose. Private source is not returned by this listing.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const response = await fetch("/api/private-tools", { credentials: "same-origin", cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || "Private workspace is unavailable.");
        return body;
      },
    });
    return "registered";
  } catch (error) {
    delete state[workspaceMarker];
    throw error;
  }
}

export async function registerPrivateBootstrapTools(toolId: string): Promise<"registered" | "already_registered" | "unsupported"> {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool !== "function") return "unsupported";
  const marker = markerPrefix + toolId;
  const state = window as unknown as Window & Record<string, unknown>;
  if (state[marker]) return "already_registered";
  state[marker] = true;
  try {
    const registrations = [modelContext.registerTool({
      name: "adaptab_private_tool_info",
      description: "Read the authenticated owner's private tool configuration for this AdapTab activation page. The opaque page URL is not authorization.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => postJson("/api/private-tool", { toolId }),
    }), modelContext.registerTool({
      name: "adaptab_get_private_bundle",
      description: "Retrieve the reviewed, owner-authorized private adapter bundle for this activation page. The bundle must be evaluated only in an expected target origin and requires reinjection after full document navigation.",
      inputSchema: {
        type: "object",
        properties: { delivery: { type: "string", enum: ["inline"] } },
        required: ["delivery"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        const bundle = await postJson<Record<string, unknown>>("/api/private-bundle", { toolId, delivery: value.delivery });
        if (bundle.encrypted === true) {
          const source = await decryptPrivateBundle(toolId, bundle as unknown as EncryptedPrivateBundle);
          return { ...bundle, source, encryptedSource: undefined, decryptedInBrowser: true };
        }
        return bundle;
      },
    })];
    await Promise.all(registrations);
    return "registered";
  } catch (error) {
    delete state[marker];
    throw error;
  }
}
