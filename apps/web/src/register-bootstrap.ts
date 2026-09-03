import { postJson } from "./api";

const bootstrapMarker = "__adaptabBootstrapV1";

export async function registerBootstrapTools(): Promise<"registered" | "already_registered" | "unsupported"> {
  const modelContext = document.modelContext;
  if (typeof modelContext?.registerTool !== "function") return "unsupported";

  const state = window as unknown as Window & Record<string, unknown>;
  if (state[bootstrapMarker]) return "already_registered";
  state[bootstrapMarker] = true;

  try {
    await modelContext.registerTool({
      name: "adaptab_resolve",
      description:
        "Resolve a target page URL and task intent to the smallest compatible AdapTab WebMCP adapter. This reads the public adapter catalog and does not access the target page.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The complete URL of the target browser tab." },
          intent: { type: "string", minLength: 1, maxLength: 300, description: "The user's intended action in plain language." },
          client: { type: "string", enum: ["chatgpt-integrated-browser", "cdp", "other"] },
        },
        required: ["url", "intent", "client"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (input) => postJson("/api/resolve", input),
    });

    await modelContext.registerTool({
      name: "adaptab_get_bundle",
      description:
        "Get an immutable AdapTab page-installer bundle and its SHA-256 integrity value for a previously resolved adapter version.",
      inputSchema: {
        type: "object",
        properties: {
          adapterId: { type: "string" },
          version: { type: "string" },
          delivery: { type: "string", enum: ["inline"] },
        },
        required: ["adapterId", "version", "delivery"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (input) => postJson("/api/bundle", input),
    });

    await modelContext.registerTool({
      name: "adaptab_request_adapter",
      description:
        "Request future AdapTab support for an unsupported website and action. Only the hostname is retained from the URL. Do not include private page data, credentials, or message text in action descriptions or notes.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "A public site URL; only its hostname is retained." },
          desiredAction: { type: "string", minLength: 3, maxLength: 300 },
          pageFamily: { type: "string", maxLength: 100 },
          notes: { type: "string", maxLength: 500 },
        },
        required: ["url", "desiredAction"],
        additionalProperties: false,
      },
      execute: (input) => postJson("/api/request-adapter", input),
    });

    await modelContext.registerTool({
      name: "adaptab_report_result",
      description:
        "Report a bounded adapter outcome to improve compatibility. Requires explicit consent and never accepts tool arguments, results, page content, cookies, messages, or account identifiers.",
      inputSchema: {
        type: "object",
        properties: {
          consent: { const: true },
          adapterId: { type: "string", maxLength: 100 },
          version: { type: "string", maxLength: 30 },
          toolName: { type: "string", maxLength: 100 },
          outcome: { type: "string", enum: ["success", "failure", "cancelled"] },
          errorCode: { type: "string", maxLength: 80 },
          latencyBucket: { type: "string", enum: ["lt_1s", "1_3s", "3_10s", "gt_10s", "unknown"] },
          client: { type: "string", enum: ["chatgpt-integrated-browser", "cdp", "other"] },
          lifecycleReason: { type: "string", enum: ["initial", "spa_navigation", "document_navigation", "manual_reinject", "unknown"] },
        },
        required: ["consent", "adapterId", "version", "toolName", "outcome", "latencyBucket", "client", "lifecycleReason"],
        additionalProperties: false,
      },
      execute: (input) => postJson("/api/report-result", input),
    });
  } catch (error) {
    delete state[bootstrapMarker];
    throw error;
  }

  return "registered";
}
