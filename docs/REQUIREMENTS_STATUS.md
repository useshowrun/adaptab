# AdapTab requirements status

Canonical product plan: [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md)  
Browser evidence: [`EXPERIMENT_LOG.md`](EXPERIMENT_LOG.md)  
Showrun migration: [`SHOWRUN_MIGRATION.md`](SHOWRUN_MIGRATION.md)  
Last reviewed: 2026-09-03

This document tracks the requirements first stated when AdapTab moved from
ideation into product building. It is the living gap analysis for future
development. Update it whenever a requirement changes state or a browser test
adds evidence.

## Status vocabulary

- **MVP complete**: implemented, deployed, and verified in a real browser.
- **Code complete**: implemented and tested, but a required production test is
  still missing.
- **Partial**: a useful vertical slice exists, but named parts of the original
  requirement remain.
- **Designed**: architecture is documented but the user-facing capability does
  not exist.
- **Deferred**: intentionally outside the current MVP.

## Overall snapshot

- The end-to-end public MVP is operational: start URL, WebMCP bootstrap,
  route/intent resolution, immutable bundle delivery, trusted CDP injection,
  native target-page tool discovery, and live invocation.
- Six reviewed adapters are implemented across Raising.fi, GitHub, Hacker
  News, and three LinkedIn product groups.
- Sixty-one automated tests and repeated integrated-browser tests pass.
- Of the eight original product requirement groups: one is MVP complete and
  seven are partial; the private-workspace requirement now has a tested narrow
  implementation rather than only a design.
- Against the ten MVP success criteria in `PRODUCT_PLAN.md`, eight are complete
  and two are partial: the durable no-match path still needs a production
  persistence test, and the submission demo video is not yet recorded.

## Original requirements ledger

### R1. Hosted tool library reachable from one starting link

**Original intent:** Deploy known tools to Netlify so a user can give an agent
one AdapTab link and become ready to work.

**Status: MVP complete.**

Shipped:

- Public start page: `https://adaptab.netlify.app/start`.
- Lightweight agent page: `https://adaptab.netlify.app/bootstrap`, separate
  from the human catalog and workspace interface. The human page does not
  register WebMCP tools.
- Four native bootstrap tools: resolve, get bundle, request adapter, and report
  result.
- The same authenticated resolver and bundle tools include the owner's private
  library, so private use does not require a second activation page.
- Six reviewed, versioned adapters in the catalog.
- Public catalog and target adapters verified in ChatGPT's integrated browser.

Remaining product work:

- None for the narrow MVP contract. Broader activation convenience is tracked
  under R3.

### R2. Unsupported-site backlog and community growth

**Original intent:** When no adapter matches, record the missing site/action;
eventually help agents or contributors create reviewed adapters using
network-first guidance.

**Status: Partial.**

Shipped:

- `adaptab_request_adapter` accepts a hostname, broad page family, desired
  action, and optional public notes.
- The backend strips paths and query strings and appends sanitized records to
  deployment-namespaced Netlify Blobs storage.
- Basic validation, body bounds, and best-effort rate limiting are present.
- The Showrun migration matrix inventories 83 prior capability folders and
  defines ten publication gates.

Missing:

- Production verification that a submitted no-match request persists and can
  be retrieved by maintainers.
- Maintainer backlog UI or export.
- `adaptab-author` skill/template that generates a manifest, installer, tests,
  and review-ready pull request.
- Community contribution and human-review workflow.

Next acceptance milestone:

- Submit one harmless test request in production, verify its sanitized stored
  shape, and build the local authoring template without auto-publishing code.

### R3. Easier activation than per-site skill installation

**Original intent:** A link or starting prompt should replace installing many
Showrun skills. The path should be fast and token-efficient; authentication
should stay in the browser.

**Status: Partial.**

Shipped:

- One browser-neutral bootstrap URL replaces per-site agent-skill installation.
- The agent page registers tools without loading the React catalog UI or
  fetching catalog/workspace summaries. Its initial production build payload
  is about 4.4 kB compressed, before lazy authentication code is needed.
- ChatGPT's integrated browser can load a bootstrap document in a hidden tab,
  discover all four tools, and invoke the resolver without foreground
  navigation. The document must remain open because WebMCP is page-bound.
- `adaptab_resolve` returns only the smallest matching adapter metadata and,
  when signed in, considers both public and owner-private adapters.
- Source is fetched only after resolution through `adaptab_get_bundle`.
- The shared bundle tool locally decrypts custom private source using the key
  in the current browser profile; the key never reaches Netlify.
- Activation describes the exact `Runtime.evaluate` call, expected origins,
  expected paths, and reinjection lifecycle.
- Authenticated requests execute in the target document; target cookies and
  CSRF material do not go to Netlify.
- The current operational policy is agent-level lazy injection: immediately
  before use, rediscover the expected tool and rerun resolve/fetch/hash/origin/
  path/inject only when it is missing or stale.

Missing:

- The user must still approve full CDP and the agent must perform an explicit
  resolve/fetch/verify/inject sequence.
- Inline bundle delivery consumes model/tool context.
- Full document navigation and new tabs still rely on the agent noticing that
  the tool is absent and performing lazy reinjection.
- No standalone supervisor, Chrome new-document hook, or extension runtime.
- No measured activation latency/token benchmark against Showrun.
- No proof yet that a separate, fully headless browser process can publish its
  page tools into an arbitrary agent host without a host-specific bridge.

Next acceptance milestone:

- Add a trusted local activation helper that fetches and verifies bundles
  outside model context, watches document replacement, and reinjects only the
  resolved adapter. Keep the Netlify page, bridge, and target runtime as
  separate trust boundaries.

Future options:

- A **CDP supervisor engine** can watch approved targets, top-level navigation,
  and execution-context replacement, then fetch/verify/reinject out of model
  context while its local session remains connected.
- A **browser extension** can provide durable per-site activation through a
  service worker/content runtime and explicit host permissions when a trusted
  CDP host is unavailable or the user experience warrants installation.
- Neither option makes the hosted Netlify page a cross-origin injector.

### R4. Route-, product-, and context-aware tool filtering

**Original intent:** Do not expose every tool for a domain. Select tools by
site, page family, product, task, permission, and client capability—for example
LinkedIn core, Sales Navigator, and Recruiter separately.

**Status: Partial; MVP filtering is complete.**

Shipped:

- Typed manifests declare exact origins, path patterns, intent patterns,
  product names, tool schemas, read/write state, confirmation state, and
  network allowlists.
- Deterministic resolver intersects origin, route, intent, and supported client.
- LinkedIn company search and messaging are separate adapter groups; a send
  intent does not load the search group.
- Every third-party tool uses the `adaptab_` prefix and discloses provenance.

Missing:

- Explicit user-permission policy is not yet represented independently from
  browser/CDP approval.
- Native-site WebMCP conflict detection and preference are not implemented.
- Sales Navigator and Recruiter groups are not implemented.
- Intent matching is deterministic substring matching rather than a richer
  scored policy with ambiguity handling.

Next acceptance milestone:

- Add resolver tests and UI for native-tool conflicts, explicit risk/permission
  tiers, and product-family ambiguity before adding Sales Navigator/Recruiter.

### R5. User-created and private tools on any website

**Original intent:** Users should be able to add tools that AdapTab or the site
does not provide, including private internal workflows.

**Status: Partial; template and encrypted custom-import paths are code complete.**

Shipped:

- Manifest types reserve `public` and `private` visibility.
- `/workspace` provides Netlify Identity sign-in and an owner-specific library
  that lists every individual WebMCP tool within its adapter package.
- Users can create a declarative fixed-recipient LinkedIn messaging tool with
  one to three validated profile URLs from reviewed template code.
- Users can import a custom manifest and source for any bounded set of exact
  HTTPS origins. The UI previews page, declared network, read/write, and
  confirmation permissions before import.
- Custom source is wrapped with origin, path, and top-level guards, then
  AES-GCM encrypted in the browser. Netlify receives owner-scoped ciphertext,
  metadata, and an integrity hash but no plaintext source or key.
- `/start` resolves and retrieves both public and owner-private adapters through
  its existing four bootstrap tools. `/tools/<opaque-id>` remains available as
  a direct authenticated locator.
- A remembered Identity session is refreshed before private-aware requests,
  avoiding the expired-cookie race found during fresh-session production QA.
- Every private Function performs an owner-scoped lookup, returns 404 across
  owners, and uses `private, no-store` delivery.
- Private adapters remain excluded from `/api/catalog`. Authenticated resolve
  merges safe route-matched metadata without recipient configuration or source;
  shared bundle delivery still requires the server-side owner check.
- The reviewed private template is production-verified end to end: owner-only
  bundle retrieval, hash verification, CDP injection, WebMCP discovery,
  explicit confirmation, and bounded at-most-once delivery.
- The encrypted custom path is production-verified from the unified `/start`
  page through local decryption, hash match, exact-origin CDP injection, native
  WebMCP discovery, and harmless read-only invocation.

Missing:

- Production cross-owner verification with a second account, plus deletion and
  export controls. The authenticated stored-record and injection path is
  verified with the primary owner.
- Additional reviewed templates beyond the fixed-recipient messaging workflow.
- Recovery-key UX, deletion/export/revocation, configurable quotas, and audit
  controls. The current browser-local key is intentionally not server-backed.
- Stronger isolation for untrusted owner-authored code. Exact page guards are
  enforced, but source runs in the target page main world and its declared
  network allowlist is not a JavaScript sandbox.
- A way to supplement a site that already has native WebMCP without shadowing
  its tools.

Next acceptance milestone:

- Finish decrypt/inject/discover verification for the harmless production
  custom adapter, then verify cross-owner isolation with a second account and
  add deletion/export.

### R6. Multi-step and composed tools

**Original intent:** Support sequential or parallel endpoint workflows, first
within a site and eventually across sites.

**Status: Partial.**

Shipped:

- LinkedIn messaging uses separate prepare and send steps with a short-lived,
  one-use draft. This proves guarded state transfer but is not a general
  composition engine.
- `linkedin.messaging.search-outreach@1.0.0` implements the first bounded
  composition on the current LinkedIn People search page: visible-result
  selection, parallel exact-recipient resolution, complete preview, a
  batch-specific confirmation code, and sequential at-most-once sends.
- The batch is capped at three recipients, expires after five minutes, and
  stops all remaining attempts after an ambiguous send outcome. Only one
  batch can be attempted in the same document.

Missing:

- Composition schema, dependency graph, parallel execution, dry-run preview,
  per-step authorization, generic idempotency keys, rollback guidance, and
  cross-site orchestration. The first adapter implements these concerns only
  for its own bounded workflow.
- Generic policy enforcement across compositions, including workspace-level
  rate limits and abuse controls. Live sends must be tested only with a
  freshly authorized exact recipient list and message.

Next acceptance milestone:

- Extract the proven state/preview/failure semantics into a generic
  composition schema, then add workspace-level policy and rate limits.
  Unbounded or unattended outreach remains out of scope.

### R7. Private workspaces and team sharing

**Original intent:** Store personal/internal adapters privately and eventually
share them with a team.

**Status: Partial; authenticated single-user foundation is code complete.**

Shipped:

- Netlify Identity integration and authenticated `/workspace` UI.
- Owner-scoped private-tool keys in a dedicated Netlify Blobs store.
- Server-side owner checks on list, detail, and bundle delivery.
- Opaque tool URLs that are intentionally not bearer credentials.
- General private adapter packages with individual tool listings.
- Client-encrypted custom source with a browser-local key and owner-scoped
  ciphertext delivery.

Missing:

- Production cross-owner isolation verification with a second account.
  Identity, GitHub login, owner record creation, authenticated retrieval, and
  private bundle delivery are verified.
- Organizations, membership, roles, invitations, recovery-key management,
  audit logs, secret handling, sharing controls, revocation, and formal tenant
  isolation review.

Next acceptance milestone:

- Add deletion/export/audit basics and verify a second owner is isolated. Team
  sharing comes only after isolation and audit tests.

### R8. Privacy-minimized telemetry and future site-owner analytics

**Original intent:** Learn which tools and workflows agents need, and
eventually help verified website owners prioritize their native WebMCP roadmap.

**Status: Partial.**

Shipped:

- `adaptab_report_result` requires explicit `consent: true`.
- Only bounded enums/identifiers are accepted: adapter version, tool name,
  outcome, error class, latency bucket, client, and lifecycle reason.
- Inputs, outputs, page content, messages, cookies, full target URLs, and
  account identifiers are excluded.
- Events use append-only, deployment-namespaced Netlify Blobs storage with
  basic rate limiting.

Missing:

- Production persistence/query verification.
- Consent UI and automatic client-side instrumentation after consent.
- Retention policy, deletion process, aggregation thresholds, and abuse review.
- Verified-domain ownership and site-owner dashboard.
- Analytics that compare native tools with community/private demand without
  exposing individual activity.

Next acceptance milestone:

- Verify one consented synthetic event end to end, document retention, and add
  a maintainer-only aggregate export. A site-owner product requires domain
  verification and thresholded aggregates later.

## Adapter rollout status

| Adapter | State | Real-browser evidence |
| --- | --- | --- |
| `raising-fi.public.funding@1.1.0` | MVP complete | Public resolve, inject, invoke, reload, reinject; all current public funding fields |
| `linkedin.core.company-search@1.0.0` | MVP complete | Authenticated company searches; credentials stayed in page |
| `linkedin.messaging.send-message@1.0.0` | MVP complete | Exact recipient preview and two separately authorized production sends |
| `linkedin.messaging.search-outreach@1.0.0` | MVP complete | Production resolve/hash/inject/preview and authorized two-recipient send verified |
| `github.public.user-research@1.0.0` | MVP complete | Three public tools invoked from production bundle |
| `hacker-news.public.front-page@1.0.0` | MVP complete | CSP-safe, network-free production invocation |

## Recommended development order

### Submission gate

1. Record and publish the required sub-three-minute demo video.
2. Finalize Devpost description, testing instructions, screenshots, and team
   details.
3. Re-run the public smoke test and preserve the exact tested commit SHA.

### Next product milestone

1. Build `adaptab-author` and a reviewed contribution template.
2. Verify the no-match queue and consented telemetry persistence in production.
3. Add a trusted local lifecycle supervisor with out-of-context bundle fetch,
   hash verification, and document reinjection.
4. Finish encrypted custom decrypt/inject verification in production, then
   add private deletion/export and recovery-key UX.

### Later platform milestones

1. Expand reviewed private templates, then team workspaces and audit controls.
2. Read-only composition engine, followed by narrowly guarded writes.
3. Verified-site-owner, thresholded analytics.
4. Extension delivery only where a trusted CDP host is unavailable or
   persistence/user experience materially benefits from it.
