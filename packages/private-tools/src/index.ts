import { createHash } from "node:crypto";
import type { AdapterManifest } from "../../adapter-sdk/src/types";

export const PRIVATE_TOOL_TEMPLATE = "linkedin.fixed-recipient-messaging" as const;
export const PRIVATE_TOOL_VERSION = "1.0.0";

export interface PrivateToolRecord {
  id: string;
  ownerId: string;
  label: string;
  slug: string;
  template: typeof PRIVATE_TOOL_TEMPLATE;
  version: typeof PRIVATE_TOOL_VERSION;
  recipientProfileUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PrivateToolSummary {
  id: string;
  label: string;
  template: typeof PRIVATE_TOOL_TEMPLATE;
  version: string;
  recipientProfileUrls: string[];
  toolUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrivateToolRepository {
  list(ownerId: string): Promise<PrivateToolRecord[]>;
  get(ownerId: string, toolId: string): Promise<PrivateToolRecord | null>;
  put(record: PrivateToolRecord): Promise<void>;
}

export function normalizeLinkedInProfileUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Each recipient must be a complete LinkedIn profile URL.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["www.linkedin.com", "linkedin.com", "tr.linkedin.com"].includes(parsed.hostname)) {
    throw new Error("Recipients must use an approved LinkedIn HTTPS profile origin.");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || segments[0] !== "in") {
    throw new Error("Each recipient URL must point to one LinkedIn /in/ profile.");
  }
  let vanity: string;
  try {
    vanity = decodeURIComponent(segments[1]);
  } catch {
    throw new Error("A recipient profile identifier is invalid.");
  }
  if (!vanity || vanity.length > 100 || /[\u0000-\u0020/?#]/.test(vanity)) {
    throw new Error("A recipient profile identifier is invalid.");
  }
  return `https://www.linkedin.com/in/${encodeURIComponent(vanity)}/`;
}

export function normalizePrivateToolInput(label: unknown, recipientProfileUrls: unknown) {
  if (typeof label !== "string" || label.trim().length < 3 || label.trim().length > 80) {
    throw new Error("label must contain 3 through 80 characters.");
  }
  if (!Array.isArray(recipientProfileUrls) || recipientProfileUrls.length < 1 || recipientProfileUrls.length > 3) {
    throw new Error("recipientProfileUrls must contain 1 through 3 profiles.");
  }
  if (recipientProfileUrls.some((value) => typeof value !== "string")) {
    throw new Error("Every recipient profile URL must be a string.");
  }
  const normalized = recipientProfileUrls.map((value) => normalizeLinkedInProfileUrl(value as string));
  if (new Set(normalized.map((value) => value.toLocaleLowerCase("en-US"))).size !== normalized.length) {
    throw new Error("Recipient profiles must be unique.");
  }
  const slug = label.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "recipient_group";
  return { label: label.trim(), recipientProfileUrls: normalized, slug };
}

export function createPrivateToolRecord(ownerId: string, input: { label: unknown; recipientProfileUrls: unknown }, now = new Date()): PrivateToolRecord {
  const normalized = normalizePrivateToolInput(input.label, input.recipientProfileUrls);
  const timestamp = now.toISOString();
  return {
    id: crypto.randomUUID(),
    ownerId,
    ...normalized,
    template: PRIVATE_TOOL_TEMPLATE,
    version: PRIVATE_TOOL_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function summarizePrivateTool(record: PrivateToolRecord): PrivateToolSummary {
  return {
    id: record.id,
    label: record.label,
    template: record.template,
    version: record.version,
    recipientProfileUrls: record.recipientProfileUrls,
    toolUrl: `/tools/${record.id}`,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function buildPrivateToolBundle(record: PrivateToolRecord) {
  const suffix = record.id.replace(/-/g, "").slice(0, 8);
  const prepareTool = `adaptab_prepare_${record.slug}_${suffix}`.slice(0, 64);
  const sendTool = `adaptab_send_${record.slug}_${suffix}`.slice(0, 64);
  const config = {
    adapterId: `private.${record.id}`,
    version: record.version,
    label: record.label,
    recipients: record.recipientProfileUrls.map((profileUrl) => ({
      profileUrl,
      vanity: decodeURIComponent(new URL(profileUrl).pathname.split("/").filter(Boolean)[1]),
    })),
    prepareTool,
    sendTool,
  };
  const source = `(async () => {\n  "use strict";\n  const CONFIG = ${JSON.stringify(config)};\n${privateRuntimeSource}\n})()`;
  const manifest: AdapterManifest = {
    id: config.adapterId,
    version: record.version,
    publisher: "private-workspace-owner",
    visibility: "private",
    execution: "page",
    product: record.label,
    origins: ["https://www.linkedin.com"],
    pathPatterns: ["/*"],
    intentPatterns: ["message private recipient group", record.label.toLocaleLowerCase("en-US")],
    networkAllowlist: [
      "/voyager/api/voyagerIdentityDashProfiles",
      "/voyager/api/me",
      "/voyager/api/voyagerMessagingDashMessengerMessages",
    ],
    tools: [
      {
        name: prepareTool,
        description: `Preview one exact message for the owner-configured private LinkedIn group “${record.label}”. Resolves every fixed recipient but does not send.`,
        routeFamily: "linkedin-authenticated-page",
        readOnly: true,
        requiresConfirmation: false,
        inputSchema: {
          type: "object",
          properties: { message: { type: "string", minLength: 1, maxLength: 1000 } },
          required: ["message"],
          additionalProperties: false,
        },
      },
      {
        name: sendTool,
        description: "Send a previously previewed private recipient-group batch after exact confirmation. Attempts each recipient at most once and stops after ambiguity.",
        routeFamily: "linkedin-authenticated-page",
        readOnly: false,
        requiresConfirmation: true,
        inputSchema: {
          type: "object",
          properties: {
            batchId: { type: "string" },
            confirm: { type: "string", pattern: "^SEND_[1-3]_MESSAGES$" },
          },
          required: ["batchId", "confirm"],
          additionalProperties: false,
        },
      },
    ],
  };
  return {
    manifest,
    source,
    integrity: { algorithm: "sha256" as const, value: createHash("sha256").update(source, "utf8").digest("hex") },
  };
}

const privateRuntimeSource = String.raw`  const EXPECTED_ORIGIN = "https://www.linkedin.com";
  const PROFILE_DECORATION = "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-19";
  const marker = "__adaptab__" + CONFIG.adapterId.replace(/[^a-z0-9]/gi, "_");
  if (location.origin !== EXPECTED_ORIGIN) throw new Error("AdapTab rejected this origin for the private adapter.");
  if (window.top !== window) throw new Error("AdapTab adapters must be installed in the top-level document.");
  if (typeof document.modelContext?.registerTool !== "function") throw new Error("This document does not expose the WebMCP registerTool API.");
  const previous = window[marker];
  if (previous?.installing === true) return { ok: false, status: "installation_in_progress" };
  if (previous?.version === CONFIG.version && previous?.installed === true) {
    return { ok: true, status: "already_installed", adapterId: CONFIG.adapterId, version: CONFIG.version, tools: [CONFIG.prepareTool, CONFIG.sendTool] };
  }
  const state = { version: CONFIG.version, installed: false, installing: true, batches: new Map(), writeAttempted: false };
  window[marker] = state;
  const assertLinkedIn = () => {
    if (location.origin !== EXPECTED_ORIGIN) throw new Error("The LinkedIn document origin changed; resolve and install again.");
  };
  const csrfToken = () => {
    const match = document.cookie.match(/(?:^|; )JSESSIONID=([^;]+)/);
    return match ? match[1].replace(/"/g, "") : "";
  };
  const fetchLinkedIn = async (path, options = {}) => {
    assertLinkedIn();
    const csrf = csrfToken();
    if (!csrf) throw new Error("LinkedIn's signed-in page session is unavailable. Sign in in this tab and try again.");
    const endpoint = new URL(path, EXPECTED_ORIGIN);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: options.method || "GET", credentials: "same-origin", redirect: "error",
        headers: { accept: options.accept || "application/vnd.linkedin.normalized+json+2.1", "x-restli-protocol-version": "2.0.0", "x-li-lang": "en_US", "csrf-token": csrf, ...(options.body ? { "content-type": "application/json; charset=UTF-8" } : {}) },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) throw new Error("LinkedIn rejected the current page session. Sign in again and retry manually.");
      if (!response.ok) throw new Error("LinkedIn returned HTTP " + response.status + ".");
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("LinkedIn request timed out after 12 seconds.");
      throw error;
    } finally { clearTimeout(timeout); }
  };
  const resolveProfile = async ({ vanity, profileUrl }) => {
    const params = new URLSearchParams({ q: "memberIdentity", memberIdentity: vanity, decorationId: PROFILE_DECORATION });
    const payload = await fetchLinkedIn("/voyager/api/voyagerIdentityDashProfiles?" + params.toString());
    const profile = (Array.isArray(payload?.included) ? payload.included : []).find((item) => typeof item?.publicIdentifier === "string" && item.publicIdentifier.toLocaleLowerCase("en-US") === vanity.toLocaleLowerCase("en-US"));
    const profileUrn = profile?.entityUrn;
    const name = [profile?.firstName, profile?.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ").trim();
    if (!profile || typeof profileUrn !== "string" || !profileUrn.startsWith("urn:li:") || !name) throw new Error("LinkedIn did not return an exact verified match for " + profileUrl + ".");
    return { profileUrn, publicIdentifier: profile.publicIdentifier, name, profileUrl, status: "pending" };
  };
  try {
    const registrations = [document.modelContext.registerTool({
      name: CONFIG.prepareTool,
      description: "Preview one exact message for the owner-configured private LinkedIn group " + CONFIG.label + ". It verifies every fixed recipient and does not send.",
      inputSchema: { type: "object", properties: { message: { type: "string", minLength: 1, maxLength: 1000 } }, required: ["message"], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        assertLinkedIn();
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "message")) throw new Error("Input may contain only message.");
        if (typeof input.message !== "string" || input.message.length < 1 || input.message.length > 1000) throw new Error("message must contain 1 through 1000 characters.");
        const recipients = await Promise.all(CONFIG.recipients.map(resolveProfile));
        const batchId = crypto.randomUUID();
        const expiresAtMs = Date.now() + 5 * 60 * 1000;
        const confirmationCode = "SEND_" + recipients.length + "_MESSAGES";
        state.batches.set(batchId, { status: "prepared", recipients, message: input.message, confirmationCode, expiresAtMs });
        return { ok: true, sent: false, batchId, expiresAt: new Date(expiresAtMs).toISOString(), recipientCount: recipients.length, recipients: recipients.map(({ name, profileUrl }) => ({ name, profileUrl })), message: input.message, nextTool: CONFIG.sendTool, confirmationCode, confirmation: "Review every fixed recipient and the exact shared message, obtain explicit user approval, then call the send tool with this batchId and exact confirmationCode." };
      }
    }), document.modelContext.registerTool({
      name: CONFIG.sendTool,
      description: "Send a reviewed private LinkedIn recipient-group batch. Requires the exact confirmation code and attempts each recipient at most once.",
      inputSchema: { type: "object", properties: { batchId: { type: "string" }, confirm: { type: "string", pattern: "^SEND_[1-3]_MESSAGES$" } }, required: ["batchId", "confirm"], additionalProperties: false },
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        assertLinkedIn();
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "batchId" && key !== "confirm")) throw new Error("Input must contain only batchId and confirm.");
        const batch = state.batches.get(input.batchId);
        if (!batch) throw new Error("Batch not found in this document. Preview the private group again.");
        if (batch.status !== "prepared") throw new Error("This batch was already attempted and cannot be retried.");
        if (Date.now() > batch.expiresAtMs) { batch.status = "expired"; throw new Error("This batch expired. Preview and review a new batch."); }
        if (input.confirm !== batch.confirmationCode) throw new Error("The confirmation code does not match this reviewed batch.");
        if (state.writeAttempted) throw new Error("A private message batch was already attempted in this document. Reload before preparing another send.");
        batch.status = "attempted"; state.writeAttempted = true;
        const me = await fetchLinkedIn("/voyager/api/me", { accept: "application/json" });
        const mailboxUrn = me?.miniProfile?.dashEntityUrn || me?.miniProfile?.entityUrn;
        if (typeof mailboxUrn !== "string" || !mailboxUrn.startsWith("urn:li:")) throw new Error("LinkedIn did not return the sender mailbox identity. The batch remains attempted.");
        const results = [];
        for (const recipient of batch.recipients) {
          recipient.status = "attempted";
          const trackingBytes = crypto.getRandomValues(new Uint8Array(16));
          const trackingId = String.fromCharCode(...trackingBytes);
          try {
            await fetchLinkedIn("/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage", { method: "POST", accept: "application/json", body: { message: { body: { attributes: [], text: batch.message }, renderContentUnions: [], originToken: crypto.randomUUID() }, mailboxUrn, trackingId, dedupeByClientGeneratedToken: false, hostRecipientUrns: [recipient.profileUrn] } });
            recipient.status = "sent"; results.push({ name: recipient.name, profileUrl: recipient.profileUrl, status: "sent" });
          } catch (error) {
            recipient.status = "ambiguous"; results.push({ name: recipient.name, profileUrl: recipient.profileUrl, status: "ambiguous" });
            for (const pending of batch.recipients.filter((item) => item.status === "pending")) results.push({ name: pending.name, profileUrl: pending.profileUrl, status: "not_attempted" });
            return { ok: false, sent: false, partial: results.some((item) => item.status === "sent"), batchId: input.batchId, stoppedAfterAmbiguousFailure: true, error: error instanceof Error ? error.message : "LinkedIn send outcome is unknown.", results, message: batch.message, retryAllowed: false };
          }
        }
        batch.status = "sent";
        return { ok: true, sent: true, batchId: input.batchId, recipientCount: batch.recipients.length, results, message: batch.message, retryAllowed: false };
      }
    })];
    await Promise.all(registrations); state.installed = true; state.installing = false;
    return { ok: true, status: "installed", adapterId: CONFIG.adapterId, version: CONFIG.version, tools: [CONFIG.prepareTool, CONFIG.sendTool] };
  } catch (error) { delete window[marker]; throw error; }`;
