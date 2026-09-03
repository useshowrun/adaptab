export const linkedinSearchOutreachBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "linkedin.messaging.search-outreach";
  const VERSION = "1.0.0";
  const PREPARE_TOOL = "adaptab_linkedin_prepare_search_messages";
  const SEND_TOOL = "adaptab_linkedin_send_search_messages";
  const EXPECTED_ORIGIN = "https://www.linkedin.com";
  const PROFILE_DECORATION = "com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-19";
  const marker = "__adaptab__" + ADAPTER_ID.replace(/[^a-z0-9]/gi, "_");

  if (location.origin !== EXPECTED_ORIGIN) {
    throw new Error("AdapTab origin guard rejected " + location.origin + " for " + ADAPTER_ID + ".");
  }
  if (window.top !== window) throw new Error("AdapTab adapters must be installed in the top-level document.");
  if (typeof document.modelContext?.registerTool !== "function") {
    throw new Error("This document does not expose the WebMCP registerTool API.");
  }

  const previous = window[marker];
  if (previous?.installing === true) {
    return { ok: false, status: "installation_in_progress", adapterId: ADAPTER_ID, version: VERSION };
  }
  if (previous?.version === VERSION && previous?.installed === true) {
    return { ok: true, status: "already_installed", adapterId: ADAPTER_ID, version: VERSION, tools: [PREPARE_TOOL, SEND_TOOL] };
  }

  const state = { version: VERSION, installed: false, installing: true, batches: new Map(), writeAttempted: false };
  window[marker] = state;

  const assertPeopleSearch = () => {
    if (location.origin !== EXPECTED_ORIGIN) throw new Error("The LinkedIn document origin changed; resolve and install again.");
    if (!/^\/search\/results\/people\/?$/.test(location.pathname)) {
      throw new Error("Open the exact LinkedIn People search-results page, then resolve and install this adapter again.");
    }
  };
  const csrfToken = () => {
    const match = document.cookie.match(/(?:^|; )JSESSIONID=([^;]+)/);
    return match ? match[1].replace(/"/g, "") : "";
  };
  const fetchLinkedIn = async (path, options = {}) => {
    assertPeopleSearch();
    const csrf = csrfToken();
    if (!csrf) throw new Error("LinkedIn's signed-in page session is unavailable. Sign in in this tab and try again.");
    const endpoint = new URL(path, EXPECTED_ORIGIN);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {
        method: options.method || "GET",
        credentials: "same-origin",
        redirect: "error",
        headers: {
          accept: options.accept || "application/vnd.linkedin.normalized+json+2.1",
          "x-restli-protocol-version": "2.0.0",
          "x-li-lang": "en_US",
          "csrf-token": csrf,
          ...(options.body ? { "content-type": "application/json; charset=UTF-8" } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        throw new Error("LinkedIn rejected the current page session. Sign in again and retry manually.");
      }
      if (!response.ok) throw new Error("LinkedIn returned HTTP " + response.status + ".");
      return await response.json();
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("LinkedIn request timed out after 12 seconds.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };
  const parseProfileLink = (href) => {
    let parsed;
    try { parsed = new URL(href, location.href); } catch { return null; }
    if (parsed.origin !== EXPECTED_ORIGIN) return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "in") return null;
    let vanity;
    try { vanity = decodeURIComponent(segments[1]); } catch { return null; }
    if (!vanity || vanity.length > 100 || /[/?#]/.test(vanity)) return null;
    return { vanity, profileUrl: EXPECTED_ORIGIN + "/in/" + encodeURIComponent(vanity) + "/" };
  };
  const visibleProfileLinks = (limit) => {
    const results = [];
    const seen = new Set();
    for (const item of Array.from(document.querySelectorAll('main [role="listitem"]'))) {
      const anchor = item.querySelector('a[href*="/in/"]');
      const parsed = anchor ? parseProfileLink(anchor.href) : null;
      const key = parsed?.vanity.toLocaleLowerCase("en-US");
      if (!parsed || seen.has(key)) continue;
      seen.add(key);
      results.push(parsed);
      if (results.length >= limit) break;
    }
    return results;
  };
  const resolveProfile = async ({ vanity }) => {
    const params = new URLSearchParams({ q: "memberIdentity", memberIdentity: vanity, decorationId: PROFILE_DECORATION });
    const payload = await fetchLinkedIn("/voyager/api/voyagerIdentityDashProfiles?" + params.toString());
    const profile = (Array.isArray(payload?.included) ? payload.included : []).find((item) =>
      typeof item?.publicIdentifier === "string" && item.publicIdentifier.toLocaleLowerCase("en-US") === vanity.toLocaleLowerCase("en-US")
    );
    const profileUrn = profile?.entityUrn;
    const name = [profile?.firstName, profile?.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ").trim();
    if (!profile || typeof profileUrn !== "string" || !profileUrn.startsWith("urn:li:") || !name) {
      throw new Error("LinkedIn did not return an exact verified profile match for a visible result.");
    }
    return {
      profileUrn,
      publicIdentifier: profile.publicIdentifier,
      name,
      profileUrl: EXPECTED_ORIGIN + "/in/" + encodeURIComponent(profile.publicIdentifier) + "/",
      status: "pending"
    };
  };

  try {
    const registrations = [document.modelContext.registerTool({
      name: PREPARE_TOOL,
      description: "Preview one exact message for up to three visible LinkedIn People search results through a third-party AdapTab adapter. It verifies every recipient and does not send.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", minLength: 1, maxLength: 1000, description: "The exact message to preview for every selected recipient." },
          limit: { type: "integer", minimum: 1, maximum: 3, default: 3, description: "Maximum visible recipients to preview; hard-capped at three." }
        },
        required: ["message"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        assertPeopleSearch();
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "message" && key !== "limit")) {
          throw new Error("Input may contain only message and limit.");
        }
        if (typeof input.message !== "string" || input.message.length < 1 || input.message.length > 1000) {
          throw new Error("message must contain 1 through 1000 characters.");
        }
        const limit = input.limit === undefined ? 3 : input.limit;
        if (!Number.isInteger(limit) || limit < 1 || limit > 3) throw new Error("limit must be an integer from 1 through 3.");
        const links = visibleProfileLinks(limit);
        if (links.length === 0) throw new Error("No visible LinkedIn People results could be identified. Wait for results to load and try again.");
        const recipients = await Promise.all(links.map(resolveProfile));
        const batchId = crypto.randomUUID();
        const expiresAtMs = Date.now() + 5 * 60 * 1000;
        const confirmationCode = "SEND_" + recipients.length + "_MESSAGES";
        state.batches.set(batchId, {
          status: "prepared",
          recipients,
          message: input.message,
          confirmationCode,
          expiresAtMs,
          sourceSearchUrl: location.href.split("#")[0]
        });
        return {
          ok: true,
          sent: false,
          batchId,
          expiresAt: new Date(expiresAtMs).toISOString(),
          sourceSearchUrl: location.href.split("#")[0],
          recipientCount: recipients.length,
          recipients: recipients.map(({ name, profileUrl }) => ({ name, profileUrl })),
          message: input.message,
          nextTool: SEND_TOOL,
          confirmationCode,
          confirmation: "Review every recipient and the exact shared message, obtain explicit user approval, then call the send tool with this batchId and the exact confirmationCode."
        };
      }
    }), document.modelContext.registerTool({
      name: SEND_TOOL,
      description: "Send a previously previewed LinkedIn search-result batch through a third-party AdapTab adapter. Requires the exact batch confirmation code, attempts each recipient at most once, and stops after an ambiguous failure.",
      inputSchema: {
        type: "object",
        properties: {
          batchId: { type: "string", description: "The exact batch ID returned by the preview tool." },
          confirm: { type: "string", pattern: "^SEND_[1-3]_MESSAGES$", description: "The exact batch-specific confirmation code returned by the preview tool." }
        },
        required: ["batchId", "confirm"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        assertPeopleSearch();
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "batchId" && key !== "confirm")) {
          throw new Error("Input must contain only batchId and confirm.");
        }
        if (typeof input.batchId !== "string" || typeof input.confirm !== "string") {
          throw new Error("A valid batchId and confirmation code are required.");
        }
        const batch = state.batches.get(input.batchId);
        if (!batch) throw new Error("Batch not found in this document. Preview the search results again.");
        if (batch.status !== "prepared") throw new Error("This batch was already attempted and cannot be retried.");
        if (Date.now() > batch.expiresAtMs) {
          batch.status = "expired";
          throw new Error("This batch expired. Preview and review a new batch.");
        }
        if (input.confirm !== batch.confirmationCode) {
          throw new Error("The confirmation code does not match this reviewed batch.");
        }
        if (state.writeAttempted) {
          throw new Error("A search-message batch was already attempted in this document. Open or reload a reviewed search before preparing another send.");
        }

        batch.status = "attempted";
        state.writeAttempted = true;
        const me = await fetchLinkedIn("/voyager/api/me", { accept: "application/json" });
        const mailboxUrn = me?.miniProfile?.dashEntityUrn || me?.miniProfile?.entityUrn;
        if (typeof mailboxUrn !== "string" || !mailboxUrn.startsWith("urn:li:")) {
          throw new Error("LinkedIn did not return the sender mailbox identity. The batch remains attempted.");
        }

        const results = [];
        for (const recipient of batch.recipients) {
          recipient.status = "attempted";
          const trackingBytes = crypto.getRandomValues(new Uint8Array(16));
          const trackingId = String.fromCharCode(...trackingBytes);
          try {
            await fetchLinkedIn("/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage", {
              method: "POST",
              accept: "application/json",
              body: {
                message: {
                  body: { attributes: [], text: batch.message },
                  renderContentUnions: [],
                  originToken: crypto.randomUUID()
                },
                mailboxUrn,
                trackingId,
                dedupeByClientGeneratedToken: false,
                hostRecipientUrns: [recipient.profileUrn]
              }
            });
            recipient.status = "sent";
            results.push({ name: recipient.name, profileUrl: recipient.profileUrl, status: "sent" });
          } catch (error) {
            recipient.status = "ambiguous";
            results.push({ name: recipient.name, profileUrl: recipient.profileUrl, status: "ambiguous" });
            for (const pending of batch.recipients.filter((item) => item.status === "pending")) {
              results.push({ name: pending.name, profileUrl: pending.profileUrl, status: "not_attempted" });
            }
            return {
              ok: false,
              sent: false,
              partial: results.some((item) => item.status === "sent"),
              batchId: input.batchId,
              stoppedAfterAmbiguousFailure: true,
              error: error instanceof Error ? error.message : "LinkedIn send outcome is unknown.",
              results,
              message: batch.message,
              retryAllowed: false
            };
          }
        }
        batch.status = "sent";
        return {
          ok: true,
          sent: true,
          batchId: input.batchId,
          recipientCount: batch.recipients.length,
          results,
          message: batch.message,
          retryAllowed: false
        };
      }
    })];
    await Promise.all(registrations);
    state.installed = true;
    state.installing = false;
    return { ok: true, status: "installed", adapterId: ADAPTER_ID, version: VERSION, tools: [PREPARE_TOOL, SEND_TOOL] };
  } catch (error) {
    delete window[marker];
    throw error;
  }
})()`;
