# AdapTab product plan

Status: implemented MVP architecture and roadmap
Last updated: 2026-09-03

Live requirement-by-requirement progress is tracked in
[`REQUIREMENTS_STATUS.md`](REQUIREMENTS_STATUS.md).

## Product identity

- Name: **AdapTab**
- Working tagline: **WebMCP for every tab.**
- Devpost title: **AdapTab: WebMCP for Every Tab**
- One-line description: AdapTab provides reviewed, route-aware adapters that
  let an agent add native WebMCP tools to websites that do not provide them.

## Background and relationship to Showrun

Showrun is previous open-source work containing deterministic skills and
scripts for authenticated web platforms. It commonly prefers known JSON or
GraphQL requests executed through a live Chrome tab over visual DOM
automation.

AdapTab is a new product and repository. It may reuse endpoint knowledge,
patterns, or library code from Showrun, but its product contract is different:

- Showrun distributes agent skills and CLI scripts.
- AdapTab distributes typed, route-aware WebMCP adapter definitions and
  activation methods.
- CDP remains a privileged transport and lifecycle mechanism.
- WebMCP is the capability interface the agent discovers and invokes.

## Core architectural decision

The Netlify application is the **catalog and control plane**. It does not
inject JavaScript into unrelated tabs and does not receive target-site browser
cookies.

The intended flow is:

1. The user gives the agent the AdapTab start URL.
2. The agent opens the AdapTab page and discovers AdapTab's bootstrap WebMCP
   tools.
3. The agent supplies the target tab URL and intended task.
4. AdapTab selects the smallest matching adapter and injection method.
5. AdapTab returns the reviewed tool metadata and immutable adapter artifact.
6. The agent's trusted browser capability performs the injection.
7. The target document registers its own AdapTab-provided WebMCP tools.
8. The agent rediscovers and invokes those tools in the authenticated target
   tab.
9. After document replacement, the agent or a future supervisor reinjects the
   adapter.

Trust boundaries:

```text
Netlify catalog/control plane
        -> reviewed adapter + activation description
Trusted browser bridge (CDP now, extension/runtime later)
        -> injection and lifecycle management
Authenticated target document
        -> WebMCP registration and same-origin requests
```

## Why a starting URL instead of per-site skill installation

The first-run prompt should be approximately:

> Open the AdapTab start page. Use its tools to activate the smallest matching
> adapter for my other open browser tab, then perform my requested task.

This gives the agent a single bootstrap surface. The agent does not need a
separate Showrun skill for each website. A remote MCP server may later expose
the same catalog independently of a page, but it is not required for the MVP
and does not by itself solve authenticated cross-origin execution.

## Bootstrap WebMCP tools on the AdapTab page

### `adaptab_resolve`

Purpose: match a target URL, task intent, and client environment to the
smallest compatible adapter.

Suggested input:

```json
{
  "url": "https://www.linkedin.com/mynetwork/",
  "intent": "search companies",
  "client": "chatgpt-integrated"
}
```

Suggested output fields:

```json
{
  "match": {
    "site": "linkedin",
    "product": "core",
    "adapterId": "linkedin.core.company-search",
    "version": "0.1.0"
  },
  "tools": [],
  "activation": {
    "method": "cdp-runtime-evaluate",
    "targetOrigin": "https://www.linkedin.com",
    "persistence": "reinject-after-document-replacement"
  }
}
```

### `adaptab_get_bundle`

Purpose: return an adapter only after resolution, avoiding source-code token
cost during discovery.

Inputs include adapter ID, exact version, and delivery mode. Output includes:

- immutable/minified adapter source or a content-addressed artifact reference
- SHA-256 integrity hash
- expected origin and route family
- supported injection method identifier
- required CDP command parameters, when relevant

For the first ChatGPT integrated-browser version, inline delivery is the most
portable fallback. A future local bridge should fetch and verify artifacts
out-of-band to keep adapter code out of model context.

### `adaptab_request_adapter`

Purpose: record an unsupported site or missing task for future adapter work.

Collect only what is needed:

- hostname
- broad page family
- requested action
- optional public notes

Do not collect full paths, query strings, page content, credentials, or form
values by default.

### `adaptab_report_result`

Purpose: opt-in operational telemetry using bounded fields:

- adapter ID and version
- tool name
- read/write classification
- success or bounded error code
- execution environment
- latency bucket
- lifecycle reason, such as initial injection or reinjection

Never accept tool inputs, outputs, page text, messages, cookies, CSRF values,
or target-account identifiers.

## Injection methods

Injection methods are declarative identifiers interpreted by the trusted
agent/browser layer. AdapTab must not return arbitrary shell commands.

Initial method registry:

| Method | Environment | Persistence |
| --- | --- | --- |
| `cdp-runtime-evaluate` | ChatGPT integrated browser | Current document |
| `cdp-new-document-script` | Standalone Chrome CDP where supported | Future documents |
| `manual-runtime-evaluate` | Generic CDP-capable agent | Current document |
| `extension-content-runtime` | Future browser extension | Automatic per matching document |

The integrated browser requires explicit CDP enablement and per-origin
approval. AdapTab must report these prerequisites honestly rather than
claiming activation succeeded.

## Adapter selection and filtering

Available tools are the intersection of:

```text
site match
AND product match
AND route match
AND requested intent
AND user permission
AND client capability
```

Do not load every tool for a domain.

Initial LinkedIn families:

| URL family | Adapter group |
| --- | --- |
| `/feed`, `/search`, `/company/*` | Core search |
| `/in/*` | Profile and explicitly requested messaging |
| `/messaging/*` | Messaging |
| `/sales/*` | Sales Navigator |
| `/talent/*` | Recruiter |

AdapTab-provided tools must use an `adaptab_` prefix and clearly state that
they are third-party adapters, not tools endorsed by the target site. Native
site tools should be preferred when an equivalent capability already exists;
AdapTab should supplement rather than shadow them.

## Initial public adapters

Implement and publish in this order:

1. `raising-fi.public.funding`
   - Read-only.
   - Uses Raising.fi's known public JSON API from the target page.
   - Returns a narrow preview schema.
   - Primary no-auth demo.

2. `linkedin.core.company-search`
   - Read-only.
   - Uses the live LinkedIn page session and known GraphQL request recipe.
   - Returns a small number of company names, subtitles, and URLs.
   - Never exports cookies or CSRF values.

3. `linkedin.messaging.send-message`
   - Mutating and confirmation-required.
   - Resolve and verify the recipient before enabling send.
   - Narrow input schema and explicit side-effect description.
   - No automatic retry after an ambiguous request.
   - Support one-use/attempt guards for sensitive writes.

Sales Navigator and Recruiter are represented in the catalog model but are
deferred until after the core flow is deployed.

## Draft repository structure

```text
adaptab/
├── apps/
│   └── web/
├── adapters/
│   ├── raising-fi/
│   └── linkedin/
│       ├── core/
│       ├── messaging/
│       ├── sales-nav/
│       └── recruiter/
├── packages/
│   ├── adapter-sdk/
│   ├── runtime/
│   └── registry/
├── netlify/
│   └── functions/
├── tests/
│   ├── fixtures/
│   ├── browser/
│   └── lifecycle/
├── netlify.toml
├── LICENSE
└── README.md
```

Recommended first stack:

- TypeScript
- Vite + React for the hosted catalog UI
- ES-module Netlify Functions
- Netlify Blobs for the unmatched-site queue and bounded telemetry
- Vitest for unit and adapter fixture tests
- a small CDP/WebMCP integration harness plus manual integrated-browser tests

## Draft adapter manifest

```ts
interface AdapterManifest {
  id: string;
  version: string;
  publisher: string;
  visibility: "public" | "private";
  execution: "page";

  matches: Array<{
    origin: string;
    paths: string[];
    product: string;
  }>;

  tools: Array<{
    name: string;
    description: string;
    routes: string[];
    readOnly: boolean;
    confirmation: "never" | "required";
  }>;

  network: {
    allowedOrigins: string[];
    allowedPathPatterns: string[];
  };
}
```

The adapter source must validate the target origin at installation and again
before execution. It should use exact endpoint allowlists, narrow schemas,
timeouts, bounded outputs, and `credentials: "same-origin"` or equivalent.

## Public, private, and community adapters

The data model should support `public` and `private` visibility from the
beginning, but full accounts are not required for the first deploy.

Recommended progression:

1. Public reviewed adapters stored in the repository.
2. Local-only user adapters imported and validated in the browser.
3. Authenticated private library using Netlify Identity.
4. Encrypted private artifacts behind authorization-checked Functions.
5. Team workspaces and roles.

Never execute an unreviewed community submission as a public adapter. Public
submissions require source review, fixture tests, route matching, risk
classification, and immutable versioning.

## Community authoring skill

A future `adaptab-author` skill should turn Showrun-style network research into
a reviewable adapter pull request. It should instruct agents to:

1. Define the authorized workflow.
2. Look for JSON/GraphQL/network requests before DOM automation.
3. Start with read-only endpoints.
4. Separate read and mutation tools.
5. Keep credentials inside the browser.
6. Create narrow schemas and bounded outputs.
7. Add sanitized fixtures.
8. Declare origin, route, and product matches.
9. Add lifecycle and error tests.
10. Submit for human review rather than auto-publishing executable code.

Unmatched-site requests can prioritize this backlog.

## Multi-step tools

The schema may reserve a future composed-tool type, but broad write
orchestration is out of scope for the MVP.

A safe first example is:

```text
search Raising.fi funding
-> filter companies
-> fetch public company details
```

Bulk outreach such as messaging everyone at a company is explicitly deferred.
It requires dry-run previews, recipient caps, per-step authorization,
idempotency, rate limits, partial-failure handling, and anti-abuse policy.

## Telemetry principles

Telemetry is opt-in and privacy-minimized.

Allowed initial events:

- adapter matched or no match
- injection attempted/succeeded/failed
- reinjection reason
- tool invocation succeeded or bounded failure class
- latency bucket
- adapter and tool version

Disallowed by default:

- cookies or tokens
- tool arguments or results
- messages and profile data
- page content
- full URLs with paths or query strings
- stable cross-site browsing identifiers

Site-owner analytics are a later product. They should require verified domain
ownership and provide aggregated, thresholded demand and failure information,
not individual user activity.

## Security invariants

- Netlify never receives target-site cookies.
- Only a trusted browser capability injects into the target tab.
- Verify exact origin before injection and execution.
- Public bundles are reviewed, versioned, immutable, and integrity-addressed.
- Tool descriptions disclose third-party provenance and side effects.
- Mutation tools require explicit authorization.
- Ambiguous writes are never retried automatically.
- Adapter network access is allowlisted.
- Tool outputs are bounded and schema-validated.
- Community requests do not directly become executable production code.
- Private adapters are never exposed through the public catalog.

## MVP implementation sequence

1. Scaffold the TypeScript repository and visible open-source license.
2. Define and test manifest schemas, route matching, and method selection.
3. Build the Netlify start/catalog page and its four bootstrap WebMCP tools.
4. Add content-addressed bundle generation and integrity metadata.
5. Implement Raising.fi read-only adapter and lifecycle tests.
6. Deploy the first Netlify preview and test from ChatGPT's integrated browser.
7. Implement LinkedIn company search using the live page session.
8. Implement the narrowly confirmed LinkedIn message adapter.
9. Add Netlify Functions and Blobs for no-match requests and opt-in telemetry.
10. Run the browser test matrix, polish the UI/docs, record the demo, and
    submit.

## Explicitly deferred

- Chrome extension
- always-on remote MCP server
- full private cloud workspace
- team roles and sharing
- automatic community publication
- Sales Navigator and Recruiter implementations
- broad multi-site workflows
- bulk messaging
- site-owner analytics dashboard

## Success criteria for the first live product

- AdapTab's start page exposes discoverable bootstrap WebMCP tools.
- A target URL resolves to exactly one minimal route-aware adapter.
- The agent can retrieve, verify, and inject the adapter using a declared
  method.
- Raising.fi tools work without authentication.
- LinkedIn read tools use the existing authenticated tab without exporting
  credentials.
- A confirmed LinkedIn write is attempted at most once.
- SPA navigation, hard refresh, new tab, and client reconnection behavior is
  tested and documented accurately.
- An unmatched site produces a durable backlog entry.
- Telemetry contains no sensitive payloads.
- The deployed app, public repository, README, license, and demo are coherent
  enough for independent judging.

## References

- WebMCP challenge: https://webmcp.devpost.com/
- OpenAI site tools: https://learn.chatgpt.com/docs/webmcp
- OpenAI browser developer mode: https://learn.chatgpt.com/docs/browser
- Netlify Functions: https://docs.netlify.com/build/functions/configuration/
- Netlify Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Netlify Identity: https://docs.netlify.com/manage/security/secure-access-to-sites/identity/get-started/
- Showrun reference repository: https://github.com/useshowrun/showrun
