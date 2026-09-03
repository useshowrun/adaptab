import type { ResolveInput } from "../../adapter-sdk/src/types";
import {
  buildPrivateToolBundle,
  getPrivateToolManifest,
  type PrivateToolRecord,
} from "../../private-tools/src/index";
import { listPublicAdapters, resolveAdapter } from "./catalog";
import { activationGuidance } from "./activation-guidance";

const genericIntentTokens = new Set([
  "adaptab", "current", "delete", "find", "from", "get", "list", "message",
  "page", "prepare", "preview", "read", "search", "send", "show", "this",
  "tool", "update", "use", "using", "with",
]);

function pathMatches(pattern: string, path: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

function tokens(value: string) {
  return value.toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !genericIntentTokens.has(token));
}

function privateIntentScore(record: PrivateToolRecord, intent: string) {
  const manifest = getPrivateToolManifest(record);
  const normalizedIntent = intent.toLocaleLowerCase("en-US");
  const product = manifest.product.toLocaleLowerCase("en-US");
  if (product.length >= 3 && normalizedIntent.includes(product)) return 1_000 + product.length;

  const phrase = manifest.intentPatterns
    .map((pattern) => pattern.toLocaleLowerCase("en-US"))
    .filter((pattern) => pattern.length >= 3 && normalizedIntent.includes(pattern))
    .sort((left, right) => right.length - left.length)[0];
  if (phrase) return 900 + phrase.length;

  const namedTool = manifest.tools.find((tool) =>
    normalizedIntent.includes(tool.name.toLocaleLowerCase("en-US")) ||
    normalizedIntent.includes(tool.name.replaceAll("_", " ").toLocaleLowerCase("en-US")),
  );
  if (namedTool) return 850 + namedTool.name.length;

  const intentTokens = new Set(tokens(intent));
  const distinctiveTokens = new Set(tokens([
    manifest.product,
    ...manifest.intentPatterns,
    ...manifest.tools.flatMap((tool) => [tool.name, tool.description]),
  ].join(" ")));
  const overlap = [...intentTokens].filter((token) => distinctiveTokens.has(token));
  if (overlap.length >= 2 || overlap.some((token) => ["group", "private", "team"].includes(token))) return 600 + overlap.length;
  return 0;
}

function privateCandidate(record: PrivateToolRecord, intent: string) {
  const manifest = getPrivateToolManifest(record);
  const integrity = record.kind === "encrypted-custom"
    ? { algorithm: "sha256" as const, value: record.sourceHash! }
    : buildPrivateToolBundle(record).integrity;
  const score = privateIntentScore(record, intent);
  return {
    visibility: "private" as const,
    adapterId: manifest.id,
    version: manifest.version,
    product: manifest.product,
    toolUrl: `/tools/${record.id}`,
    origins: manifest.origins,
    pathPatterns: manifest.pathPatterns,
    tools: manifest.tools,
    limits: manifest.limits ?? [],
    integrity,
    intentMatched: score > 0,
    score,
    agentActivation: activationGuidance(manifest, record.kind !== "encrypted-custom"),
  };
}

export function resolveAvailableAdapters(input: ResolveInput, privateRecords: PrivateToolRecord[], privateWorkspaceConnected = privateRecords.length > 0) {
  const publicResult = resolveAdapter(input);
  let target: URL | null = null;
  try { target = new URL(input.url); } catch { /* public result carries invalid_url */ }
  const eligible = target?.protocol === "https:" && ["chatgpt-integrated-browser", "cdp"].includes(input.client);

  const publicCandidates = eligible ? listPublicAdapters().filter((manifest) =>
    manifest.origins.includes(target!.origin) && manifest.pathPatterns.some((pattern) => pathMatches(pattern, target!.pathname)),
  ).map((manifest) => ({
    visibility: "public" as const,
    adapterId: manifest.id,
    version: manifest.version,
    product: manifest.product,
    origins: manifest.origins,
    pathPatterns: manifest.pathPatterns,
    tools: manifest.tools,
    integrity: manifest.integrity,
    intentMatched: publicResult.matched && publicResult.match.adapterId === manifest.id,
  })) : [];

  const privateCandidates = eligible ? privateRecords.map((record) => privateCandidate(record, input.intent)).filter((candidate) =>
    candidate.origins.includes(target!.origin) && candidate.pathPatterns.some((pattern) => pathMatches(pattern, target!.pathname)),
  ).sort((left, right) => right.score - left.score || left.tools.length - right.tools.length) : [];

  const selectedPrivate = privateCandidates.find(({ intentMatched }) => intentMatched);
  const availableAdapters = [...privateCandidates.map(({ score: _score, agentActivation: _agentActivation, ...candidate }) => candidate), ...publicCandidates];
  const access = { privateWorkspace: privateWorkspaceConnected ? "connected" as const : "signed_out" as const };

  if (!selectedPrivate) {
    if (publicResult.matched) {
      return {
        ...publicResult,
        match: { ...publicResult.match, visibility: "public" as const },
        availableAdapters,
        access,
      };
    }
    return { ...publicResult, availableAdapters, access };
  }

  const { score: _score, intentMatched: _intentMatched, toolUrl, agentActivation, ...selected } = selectedPrivate;
  return {
    matched: true as const,
    match: {
      site: target!.hostname,
      product: selected.product,
      adapterId: selected.adapterId,
      version: selected.version,
      visibility: "private" as const,
      toolUrl,
      integrity: selected.integrity,
    },
    tools: selected.tools,
    limits: selected.limits,
    availableAdapters,
    access,
    activation: {
      method: "cdp-runtime-evaluate" as const,
      nextTool: "adaptab_get_bundle",
      delivery: "inline" as const,
      expectedOrigins: selected.origins,
      expectedPaths: selected.pathPatterns,
      execution: "page" as const,
      ...agentActivation,
      lifecycle: {
        scope: "current_document" as const,
        spaNavigation: "usually_preserved" as const,
        documentNavigation: "reinjection_required" as const,
        newTab: "separate_injection_required" as const,
      },
      cdp: {
        method: "Runtime.evaluate" as const,
        params: { awaitPromise: true, returnByValue: true },
      },
    },
  };
}
