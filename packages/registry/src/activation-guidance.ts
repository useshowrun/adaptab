export type ActivationGuidance = {
  executionPolicy: {
    tabStrategy: "reuse_resolved_top_level_tab";
    additionalTabsRequired: false;
    resourceUrls: "tool_inputs" | "not_applicable";
    profileResolution: "same_origin_network_requests" | "not_applicable";
  };
  guidance: string;
};

export function activationGuidance(adapterId: string, privateRecipientGroup = false): ActivationGuidance {
  const executionPolicy: ActivationGuidance["executionPolicy"] = {
    tabStrategy: "reuse_resolved_top_level_tab",
    additionalTabsRequired: false,
    resourceUrls: "not_applicable",
    profileResolution: "not_applicable",
  };

  if (adapterId === "linkedin.messaging.search-outreach") {
    return {
      executionPolicy: {
        ...executionPolicy,
        resourceUrls: "tool_inputs",
        profileResolution: "same_origin_network_requests",
      },
      guidance:
        "Stay on the resolved LinkedIn People search-results tab. Do not open individual recipient profiles or create a tab per recipient. The prepare tool reads visible result links and resolves recipients in parallel with same-origin requests; after the user reviews the returned batch, call the confirmed send tool from the same document.",
    };
  }

  if (adapterId === "linkedin.messaging.send-message") {
    return {
      executionPolicy: {
        ...executionPolicy,
        resourceUrls: "tool_inputs",
        profileResolution: "same_origin_network_requests",
      },
      guidance:
        "Reuse one already-open signed-in LinkedIn top-level tab as the execution context. Recipient profile URLs are tool inputs, not pages to open. Do not create or navigate to a tab for each recipient. Prepare and send from the same document unless a tool result explicitly reports that the session is unavailable.",
    };
  }

  if (privateRecipientGroup) {
    return {
      executionPolicy: {
        ...executionPolicy,
        resourceUrls: "tool_inputs",
        profileResolution: "same_origin_network_requests",
      },
      guidance:
        "Reuse one already-open signed-in target-site tab as the execution context. Configured resource URLs are tool inputs, not pages to open. Do not create a tab per resource. Preview the complete private workflow result and keep subsequent confirmed calls in the same document.",
    };
  }

  return {
    executionPolicy,
    guidance:
      "Reuse the resolved top-level target tab as the execution context. No additional tab is required unless a tool result explicitly requests navigation. Prefer the adapter's deterministic tool calls over exploratory browser navigation.",
  };
}
