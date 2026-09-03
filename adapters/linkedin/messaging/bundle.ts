export const linkedinMessagingBundleSource = String.raw`(async () => {
  "use strict";
  const ADAPTER_ID = "linkedin.messaging.send-message";
  const VERSION = "1.0.0";
  const PREPARE_TOOL = "adaptab_linkedin_prepare_message";
  const SEND_TOOL = "adaptab_linkedin_send_prepared_message";
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

  const state = { version: VERSION, installed: false, installing: true, drafts: new Map() };
  window[marker] = state;

  const csrfToken = () => {
    const match = document.cookie.match(/(?:^|; )JSESSIONID=([^;]+)/);
    return match ? match[1].replace(/"/g, "") : "";
  };
  const fetchLinkedIn = async (path, options = {}) => {
    if (location.origin !== EXPECTED_ORIGIN) throw new Error("The LinkedIn document origin changed; resolve and install again.");
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
  const parseProfileUrl = (profileUrl) => {
    let parsed;
    try { parsed = new URL(profileUrl); } catch { throw new Error("profileUrl must be a valid LinkedIn profile URL."); }
    const allowedHost = parsed.hostname === "linkedin.com" || parsed.hostname.endsWith(".linkedin.com");
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (parsed.protocol !== "https:" || !allowedHost || segments.length !== 2 || segments[0] !== "in" || !/^[a-zA-Z0-9-]{1,100}$/.test(segments[1])) {
      throw new Error("profileUrl must identify one LinkedIn /in/ profile.");
    }
    return segments[1];
  };

  try {
    const registrations = [document.modelContext.registerTool({
      name: PREPARE_TOOL,
      description: "Resolve and preview one LinkedIn recipient and exact message through a third-party AdapTab adapter. This creates only a short-lived local draft and does not send.",
      inputSchema: {
        type: "object",
        properties: {
          profileUrl: { type: "string", maxLength: 300, description: "A LinkedIn /in/ profile URL for the intended recipient." },
          message: { type: "string", minLength: 1, maxLength: 1000, description: "The exact message to preview. It is not sent by this tool." }
        },
        required: ["profileUrl", "message"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: true },
      execute: async (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "profileUrl" && key !== "message")) {
          throw new Error("Input must contain only profileUrl and message.");
        }
        if (typeof input.profileUrl !== "string" || input.profileUrl.length > 300) throw new Error("profileUrl is invalid.");
        if (typeof input.message !== "string" || input.message.length < 1 || input.message.length > 1000) {
          throw new Error("message must contain 1 through 1000 characters.");
        }
        const vanity = parseProfileUrl(input.profileUrl);
        const params = new URLSearchParams({ q: "memberIdentity", memberIdentity: vanity, decorationId: PROFILE_DECORATION });
        const payload = await fetchLinkedIn("/voyager/api/voyagerIdentityDashProfiles?" + params.toString());
        const profiles = Array.isArray(payload?.included) ? payload.included.filter((item) =>
          typeof item?.publicIdentifier === "string" && item.publicIdentifier.toLowerCase() === vanity.toLowerCase()
        ) : [];
        const profile = profiles[0];
        const profileUrn = profile?.entityUrn;
        if (!profile || typeof profileUrn !== "string" || !profileUrn.startsWith("urn:li:")) {
          throw new Error("LinkedIn did not return an exact verified profile match.");
        }
        const name = [profile.firstName, profile.lastName].filter((part) => typeof part === "string" && part.trim()).join(" ").trim();
        if (!name) throw new Error("LinkedIn returned a profile without a verifiable name.");
        const draftId = crypto.randomUUID();
        const expiresAtMs = Date.now() + 5 * 60 * 1000;
        state.drafts.set(draftId, {
          status: "prepared",
          profileUrn,
          publicIdentifier: profile.publicIdentifier,
          name,
          message: input.message,
          expiresAtMs
        });
        return {
          ok: true,
          sent: false,
          draftId,
          expiresAt: new Date(expiresAtMs).toISOString(),
          recipient: {
            name,
            publicIdentifier: profile.publicIdentifier,
            profileUrl: "https://www.linkedin.com/in/" + profile.publicIdentifier + "/"
          },
          message: input.message,
          nextTool: SEND_TOOL,
          confirmation: "Review the exact recipient and message, then call the send tool with this draftId and confirm=SEND."
        };
      }
    }), document.modelContext.registerTool({
      name: SEND_TOOL,
      description: "Send exactly one previously prepared LinkedIn message through a third-party AdapTab adapter. This has an external side effect, requires confirm=SEND, marks the draft attempted before the request, and never retries an ambiguous outcome.",
      inputSchema: {
        type: "object",
        properties: {
          draftId: { type: "string", description: "The exact draft ID returned by the prepare tool." },
          confirm: { type: "string", const: "SEND", description: "Must be exactly SEND." }
        },
        required: ["draftId", "confirm"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false },
      execute: async (input = {}) => {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some((key) => key !== "draftId" && key !== "confirm")) {
          throw new Error("Input must contain only draftId and confirm.");
        }
        if (typeof input.draftId !== "string" || input.confirm !== "SEND") {
          throw new Error("A valid draftId and confirm=SEND are required.");
        }
        const draft = state.drafts.get(input.draftId);
        if (!draft) throw new Error("Draft not found in this document. Prepare the message again.");
        if (draft.status !== "prepared") throw new Error("This draft was already attempted and cannot be retried.");
        if (Date.now() > draft.expiresAtMs) {
          draft.status = "expired";
          throw new Error("This draft expired. Prepare and review a new draft.");
        }

        draft.status = "attempted";
        const me = await fetchLinkedIn("/voyager/api/me", { accept: "application/json" });
        const mailboxUrn = me?.miniProfile?.dashEntityUrn || me?.miniProfile?.entityUrn;
        if (typeof mailboxUrn !== "string" || !mailboxUrn.startsWith("urn:li:")) {
          throw new Error("LinkedIn did not return the sender mailbox identity. The draft remains attempted.");
        }
        const trackingBytes = crypto.getRandomValues(new Uint8Array(16));
        const trackingId = String.fromCharCode(...trackingBytes);
        await fetchLinkedIn("/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage", {
          method: "POST",
          accept: "application/json",
          body: {
            message: {
              body: { attributes: [], text: draft.message },
              renderContentUnions: [],
              originToken: crypto.randomUUID()
            },
            mailboxUrn,
            trackingId,
            dedupeByClientGeneratedToken: false,
            hostRecipientUrns: [draft.profileUrn]
          }
        });
        draft.status = "sent";
        return {
          ok: true,
          sent: true,
          draftId: input.draftId,
          recipient: { name: draft.name, profileUrl: "https://www.linkedin.com/in/" + draft.publicIdentifier + "/" },
          message: draft.message,
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
