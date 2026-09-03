import type {
  AdapterExecutionPolicy,
  AdapterLimitManifest,
  AdapterLimitReason,
  AdapterManifest,
  AdapterToolManifest,
} from "./types";

const tabStrategies = new Set(["reuse_resolved_top_level_tab", "additional_tabs_required"]);
const resourceUrlModes = new Set(["tool_inputs", "navigation_targets", "not_applicable"]);
const profileResolutionModes = new Set(["same_origin_network_requests", "page_navigation", "not_applicable"]);
const concurrencyModes = new Set(["sequential", "parallel", "mixed", "not_applicable"]);
const limitReasons = new Set<AdapterLimitReason>(["upstream", "security", "consent", "reliability", "user_policy"]);

function boundedString(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    throw new Error(`${name} must contain ${minimum} through ${maximum} characters.`);
  }
  return value.trim();
}

function exactFields(input: Record<string, unknown>, allowed: string[], name: string) {
  const extras = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extras.length) throw new Error(`Unknown ${name} fields: ${extras.join(", ")}.`);
}

export function normalizeExecutionPolicy(value: unknown): AdapterExecutionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest.executionPolicy must be an object.");
  const input = value as Record<string, unknown>;
  exactFields(input, ["tabStrategy", "additionalTabsRequired", "resourceUrls", "profileResolution", "requestConcurrency"], "executionPolicy");
  if (!tabStrategies.has(String(input.tabStrategy))) throw new Error("manifest.executionPolicy.tabStrategy is invalid.");
  if (typeof input.additionalTabsRequired !== "boolean") throw new Error("manifest.executionPolicy.additionalTabsRequired must be boolean.");
  if (!resourceUrlModes.has(String(input.resourceUrls))) throw new Error("manifest.executionPolicy.resourceUrls is invalid.");
  if (!profileResolutionModes.has(String(input.profileResolution))) throw new Error("manifest.executionPolicy.profileResolution is invalid.");
  if (!concurrencyModes.has(String(input.requestConcurrency))) throw new Error("manifest.executionPolicy.requestConcurrency is invalid.");
  if ((input.tabStrategy === "additional_tabs_required") !== input.additionalTabsRequired) {
    throw new Error("manifest.executionPolicy tabStrategy and additionalTabsRequired disagree.");
  }
  return input as unknown as AdapterExecutionPolicy;
}

function inputMaximum(tool: AdapterToolManifest, propertyName: string) {
  const properties = tool.inputSchema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return undefined;
  const property = (properties as Record<string, unknown>)[propertyName];
  if (!property || typeof property !== "object" || Array.isArray(property)) return undefined;
  return typeof (property as Record<string, unknown>).maximum === "number"
    ? (property as Record<string, number>).maximum
    : undefined;
}

export function normalizeLimits(value: unknown, tools: AdapterToolManifest[]): AdapterLimitManifest[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error("manifest.limits must be an array with at most 30 declarations.");
  const limits = value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`manifest.limits[${index}] must be an object.`);
    const input = raw as Record<string, unknown>;
    exactFields(input, ["id", "scope", "description", "reason", "source", "configurable", "toolName", "inputProperty", "value"], `limits[${index}]`);
    const id = boundedString(input.id, `manifest.limits[${index}].id`, 3, 80);
    if (!/^[a-z0-9][a-z0-9._-]+$/.test(id)) throw new Error(`manifest.limits[${index}].id must be a lowercase identifier.`);
    if (!["input", "output", "execution"].includes(String(input.scope))) throw new Error(`manifest.limits[${index}].scope is invalid.`);
    if (!limitReasons.has(input.reason as AdapterLimitReason)) throw new Error(`manifest.limits[${index}].reason is invalid.`);
    if (typeof input.configurable !== "boolean") throw new Error(`manifest.limits[${index}].configurable must be boolean.`);
    const limit: AdapterLimitManifest = {
      id,
      scope: input.scope as AdapterLimitManifest["scope"],
      description: boundedString(input.description, `manifest.limits[${index}].description`, 15, 300),
      reason: input.reason as AdapterLimitReason,
      source: boundedString(input.source, `manifest.limits[${index}].source`, 3, 300),
      configurable: input.configurable,
    };
    if (limit.scope === "input") {
      limit.toolName = boundedString(input.toolName, `manifest.limits[${index}].toolName`, 3, 80);
      limit.inputProperty = boundedString(input.inputProperty, `manifest.limits[${index}].inputProperty`, 1, 80);
      if (typeof input.value !== "number" || !Number.isFinite(input.value)) throw new Error(`manifest.limits[${index}].value must be a finite number for an input limit.`);
      limit.value = input.value;
      const tool = tools.find(({ name }) => name === limit.toolName);
      if (!tool || inputMaximum(tool, limit.inputProperty) !== limit.value) {
        throw new Error(`manifest.limits[${index}] must match the declared inputSchema maximum.`);
      }
    } else if (input.value !== undefined) {
      if ((typeof input.value !== "number" || !Number.isFinite(input.value)) && typeof input.value !== "string") {
        throw new Error(`manifest.limits[${index}].value must be a finite number or string.`);
      }
      limit.value = input.value as number | string;
    }
    return limit;
  });

  if (new Set(limits.map(({ id }) => id)).size !== limits.length) throw new Error("manifest.limits IDs must be unique.");
  for (const tool of tools) {
    const properties = tool.inputSchema.properties;
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) continue;
    for (const [propertyName, property] of Object.entries(properties)) {
      if (!property || typeof property !== "object" || Array.isArray(property)) continue;
      const maximum = (property as Record<string, unknown>).maximum;
      if (typeof maximum !== "number") continue;
      const declared = limits.some((limit) => limit.scope === "input" && limit.toolName === tool.name && limit.inputProperty === propertyName && limit.value === maximum);
      if (!declared) throw new Error(`Input maximum ${tool.name}.${propertyName}=${maximum} needs an explicit manifest.limits declaration.`);
    }
  }
  return limits;
}

export function normalizeAuthoringContract(value: Record<string, unknown>, tools: AdapterToolManifest[]) {
  return {
    executionPolicy: normalizeExecutionPolicy(value.executionPolicy),
    agentGuidance: boundedString(value.agentGuidance, "manifest.agentGuidance", 40, 1000),
    limits: normalizeLimits(value.limits, tools),
  };
}

export function assertAdapterAuthoringContract(manifest: AdapterManifest) {
  normalizeAuthoringContract(manifest as unknown as Record<string, unknown>, manifest.tools);
  return manifest;
}
