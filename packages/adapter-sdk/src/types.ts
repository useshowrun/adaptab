export type ClientKind = "chatgpt-integrated-browser" | "cdp" | "other";

export interface AdapterToolManifest {
  name: string;
  description: string;
  routeFamily: string;
  readOnly: boolean;
  requiresConfirmation: boolean;
  inputSchema: Record<string, unknown>;
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
