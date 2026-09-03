export type ClientKind = "chatgpt-integrated-browser" | "cdp" | "other";

export interface AdapterToolManifest {
  name: string;
  description: string;
  routeFamily: string;
  readOnly: boolean;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
}

export interface AdapterExecutionPolicy {
  tabStrategy: "reuse_resolved_top_level_tab" | "additional_tabs_required";
  additionalTabsRequired: boolean;
  resourceUrls: "tool_inputs" | "navigation_targets" | "not_applicable";
  profileResolution: "same_origin_network_requests" | "page_navigation" | "not_applicable";
  requestConcurrency: "sequential" | "parallel" | "mixed" | "not_applicable";
}

export type AdapterLimitReason = "upstream" | "security" | "consent" | "reliability" | "user_policy";

export interface AdapterLimitManifest {
  id: string;
  scope: "input" | "output" | "execution";
  description: string;
  reason: AdapterLimitReason;
  source: string;
  configurable: boolean;
  toolName?: string;
  inputProperty?: string;
  value?: number | string;
}

export interface AdapterManifest {
  id: string;
  version: string;
  publisher: string;
  visibility: "public" | "private";
  execution: "page";
  product: string;
  origins: string[];
  pathPatterns: string[];
  intentPatterns: string[];
  networkAllowlist: string[];
  executionPolicy: AdapterExecutionPolicy;
  agentGuidance: string;
  limits: AdapterLimitManifest[];
  tools: AdapterToolManifest[];
}

export interface ResolveInput {
  url: string;
  intent: string;
  client: ClientKind;
}

export interface BundleRecord {
  manifest: AdapterManifest;
  source: string;
}
