import { postJson } from "./api";

const markerPrefix = "__adaptabPrivateBootstrapV1_";

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
      execute: (input) => {
        const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
        return postJson("/api/private-bundle", { toolId, delivery: value.delivery });
      },
    })];
    await Promise.all(registrations);
    return "registered";
  } catch (error) {
    delete state[marker];
    throw error;
  }
}
