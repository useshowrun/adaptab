import { createHash } from "node:crypto";
import { githubPublicBundleSource } from "../../../adapters/github/public/bundle";
import { githubPublicManifest } from "../../../adapters/github/public/manifest";
import { hackerNewsPublicBundleSource } from "../../../adapters/hacker-news/public/bundle";
import { hackerNewsPublicManifest } from "../../../adapters/hacker-news/public/manifest";
import { raisingFiBundleSource } from "../../../adapters/raising-fi/bundle";
import { raisingFiBundleSourceV1, raisingFiManifestV1 } from "../../../adapters/raising-fi/legacy-v1";
import { raisingFiManifest } from "../../../adapters/raising-fi/manifest";
import { linkedinCoreBundleSource } from "../../../adapters/linkedin/core/bundle";
import { linkedinCoreManifest } from "../../../adapters/linkedin/core/manifest";
import { linkedinMessagingBundleSource } from "../../../adapters/linkedin/messaging/bundle";
import { linkedinMessagingManifest } from "../../../adapters/linkedin/messaging/manifest";
import { linkedinSearchOutreachBundleSource } from "../../../adapters/linkedin/search-outreach/bundle";
import { linkedinSearchOutreachManifest } from "../../../adapters/linkedin/search-outreach/manifest";
import type { BundleRecord, ClientKind, ResolveInput } from "../../adapter-sdk/src/types";
import { activationGuidance } from "./activation-guidance";

const bundles: BundleRecord[] = [
  { manifest: raisingFiManifest, source: raisingFiBundleSource },
  { manifest: raisingFiManifestV1, source: raisingFiBundleSourceV1 },
  { manifest: githubPublicManifest, source: githubPublicBundleSource },
  { manifest: hackerNewsPublicManifest, source: hackerNewsPublicBundleSource },
  { manifest: linkedinSearchOutreachManifest, source: linkedinSearchOutreachBundleSource },
  { manifest: linkedinCoreManifest, source: linkedinCoreBundleSource },
  { manifest: linkedinMessagingManifest, source: linkedinMessagingBundleSource },
];

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function latestPublicBundles() {
  const latest = new Map<string, BundleRecord>();
  for (const record of bundles) {
    if (record.manifest.visibility !== "public") continue;
    const current = latest.get(record.manifest.id);
    if (!current || compareVersions(record.manifest.version, current.manifest.version) > 0) latest.set(record.manifest.id, record);
  }
  return [...latest.values()];
}

function normalizePathPattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`);
}

function supportsClient(client: ClientKind): boolean {
  return client === "chatgpt-integrated-browser" || client === "cdp";
}

export function sha256(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function getBundle(adapterId: string, version: string): BundleRecord | undefined {
  return bundles.find(({ manifest }) => manifest.visibility === "public" && manifest.id === adapterId && manifest.version === version);
}

export function resolveAdapter(input: ResolveInput) {
  let target: URL;
  try {
    target = new URL(input.url);
  } catch {
    return { matched: false as const, reason: "invalid_url" as const };
  }

  if (target.protocol !== "https:") {
    return { matched: false as const, reason: "https_required" as const };
  }
  if (!supportsClient(input.client)) {
    return { matched: false as const, reason: "unsupported_client" as const };
  }

  const siteCandidates = latestPublicBundles().filter(({ manifest }) =>
    manifest.origins.includes(target.origin) &&
    manifest.pathPatterns.some((pattern) => normalizePathPattern(pattern).test(target.pathname)),
  );

  if (siteCandidates.length === 0) {
    return {
      matched: false as const,
      reason: "site_or_route_not_supported" as const,
      requestTool: "adaptab_request_adapter",
    };
  }

  const normalizedIntent = input.intent.toLocaleLowerCase("en-US");
  const record = siteCandidates.find(({ manifest }) =>
    manifest.intentPatterns.some((pattern) => normalizedIntent.includes(pattern)),
  );

  if (!record) {
    return {
      matched: false as const,
      reason: "intent_not_supported" as const,
      site: target.hostname,
      availableActions: siteCandidates.flatMap(({ manifest }) => manifest.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }))),
      requestTool: "adaptab_request_adapter",
    };
  }

  const { manifest, source } = record;
  return {
    matched: true as const,
    match: {
      site: target.hostname,
      product: manifest.product,
      adapterId: manifest.id,
      version: manifest.version,
      integrity: { algorithm: "sha256" as const, value: sha256(source) },
    },
    tools: manifest.tools,
    limits: manifest.limits,
    activation: {
      method: "cdp-runtime-evaluate" as const,
      nextTool: "adaptab_get_bundle",
      delivery: "inline" as const,
      expectedOrigins: manifest.origins,
      expectedPaths: manifest.pathPatterns,
      execution: manifest.execution,
      ...activationGuidance(manifest),
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

export function listPublicAdapters() {
  return latestPublicBundles().map(({ manifest, source }) => ({
    ...manifest,
    integrity: { algorithm: "sha256", value: sha256(source) },
  }));
}
