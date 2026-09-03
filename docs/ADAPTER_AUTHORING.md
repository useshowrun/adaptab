# AdapTab adapter authoring contract

This contract applies to every AdapTab adapter, whether it is submitted to the
public catalog or encrypted into a private workspace. The public catalog adds
human review and fixture requirements; private source remains owner-supplied
and unreviewed.

## Core rule: preserve capability

An adapter should expose the authorized website capability that is actually
available. Do not add a demo cap, silently omit fields, require extra page
navigation, or otherwise narrow the operation merely because the first test
used a smaller example.

A functional limit is allowed only when it comes from one of these sources:

- `upstream`: the website or API has an evidenced limit;
- `security`: a concrete security boundary requires it;
- `consent`: the limit is necessary to give the user a meaningful preview or
  confirmation boundary;
- `reliability`: a tested execution or idempotency constraint requires it; or
- `user_policy`: the user or workspace explicitly configured it.

Every functional limit must appear in `manifest.limits` with a description,
source, reason, value when applicable, and whether the caller can configure
it. Numeric `maximum` values on top-level tool inputs are rejected unless they
have a matching declaration. Reviewers must also compare source-code limits,
pagination, output truncation, timeouts, and retry behavior with the manifest.

Technical validation bounds are different from functional restrictions.
Reasonable string lengths, schema-size limits, response-size protection, and
timeouts protect execution, but they must not be used to conceal missing
functionality. If a technical bound materially changes what the user can do,
declare it as a functional limit too.

## Agent execution guidance

Use one already-open, authenticated top-level target tab whenever the workflow
can execute through known requests or the current DOM. URLs supplied to a tool
are inputs, not navigation instructions, unless the adapter explicitly declares
them as navigation targets.

Every manifest must provide both:

- `executionPolicy`, a machine-readable declaration of tab use, resource-URL
  semantics, profile resolution, and request concurrency; and
- `agentGuidance`, a direct textual playbook explaining the same behavior.

The guidance must say which tab is reused, whether resource URLs should be
opened, whether known network requests replace exploratory UI navigation, and
whether independent requests may run in parallel. If extra tabs are genuinely
required, declare `additional_tabs_required` and explain why.

Do not instruct the hosted AdapTab page to inject another origin. The catalog,
trusted browser bridge, and injected target-page runtime remain separate trust
boundaries.

## Network-first implementation

1. Define the user-authorized workflow and exact side effects.
2. Inspect JSON, GraphQL, and other structured requests before choosing DOM
   automation.
3. Prefer deterministic requests already used by the website.
4. Keep cookies, CSRF values, and account identifiers inside the target page.
5. Declare exact origins, path families, and network routes.
6. Use same-origin credentials only where the website session is required.
7. Separate reads, previews, and mutations into distinct tools.
8. Never automatically retry an ambiguous mutation.
9. Return all useful available fields unless a documented policy excludes one.
10. Add sanitized fixtures and origin, route, lifecycle, error, and limit tests.

## Required manifest fields

The private workspace accepts the authoring fields shown below. Public TypeScript
manifests use the same fields.

```json
{
  "version": "1.0.0",
  "origins": ["https://portal.example.com"],
  "pathPatterns": ["/*"],
  "networkAllowlist": ["/api/items"],
  "executionPolicy": {
    "tabStrategy": "reuse_resolved_top_level_tab",
    "additionalTabsRequired": false,
    "resourceUrls": "tool_inputs",
    "profileResolution": "same_origin_network_requests",
    "requestConcurrency": "parallel"
  },
  "agentGuidance": "Reuse the resolved signed-in portal tab. Treat item URLs as tool inputs, resolve them through known same-origin requests in parallel, and do not open an additional tab per item.",
  "limits": [
    {
      "id": "upstream-page-size",
      "scope": "input",
      "toolName": "adaptab_portal_list_items",
      "inputProperty": "limit",
      "value": 100,
      "reason": "upstream",
      "source": "The portal API documents a maximum page size of 100.",
      "configurable": true,
      "description": "The caller may request up to the upstream API page size."
    }
  ],
  "tools": []
}
```

Allowed execution values:

- `tabStrategy`: `reuse_resolved_top_level_tab` or
  `additional_tabs_required`;
- `resourceUrls`: `tool_inputs`, `navigation_targets`, or `not_applicable`;
- `profileResolution`: `same_origin_network_requests`, `page_navigation`, or
  `not_applicable`; and
- `requestConcurrency`: `sequential`, `parallel`, `mixed`, or
  `not_applicable`.

`additionalTabsRequired` must agree with `tabStrategy`.

## Mutations

Mutation tools must declare `readOnly: false` and
`requiresConfirmation: true`. When possible, provide a read-only prepare or
preview tool first. The confirmation must bind to the reviewed target and
payload, expire, and become non-retryable before an ambiguous write request.

This is a consent and reliability requirement, not permission for an adapter
author to impose unrelated business restrictions.

## Public catalog path

Public adapters are executable third-party code. A pull request must include:

- the manifest and installer source;
- provenance for endpoint knowledge;
- sanitized fixtures and automated tests;
- evidence for each declared limit;
- exact origin, route, and network review;
- mutation and ambiguous-failure review where relevant; and
- a versioned, immutable artifact after approval.

Run `npm run check`. The registry test validates the authoring contract for
every currently published public adapter. Community submissions never publish
automatically.

## Private workspace path

The `/workspace` import accepts the same execution guidance and limit
declarations, previews them before upload, and validates them on the server.
Custom source is encrypted in the browser before upload; its key remains in
that browser profile. This privacy property does not sandbox the source: it
still executes with the target page's access, so import only code you trust.

## Review checklist

- Does the adapter reuse one target tab unless additional tabs are truly
  necessary?
- Are URLs clearly classified as tool inputs or navigation targets?
- Are known network requests preferred over exploratory navigation?
- Are independent requests declared parallel when that is safe and faster?
- Does the tool return the useful fields the source actually provides?
- Is every functional limit necessary, declared, evidenced, and visible?
- Are read and mutation tools separated with explicit confirmation?
- Are origin, route, credential, retry, and lifecycle rules tested?
