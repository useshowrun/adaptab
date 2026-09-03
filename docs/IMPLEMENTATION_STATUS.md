# AdapTab implementation status

Last updated: 2026-09-03

## Working now

- Public production deployment: `https://adaptab.netlify.app/start`.
- Human-facing Vite + React catalog at `/start` and a separate, agent-only
  `/bootstrap` document with imperative top-level WebMCP registration.
- The human catalog does not register WebMCP tools.
- The bootstrap registration path is roughly 4.4 kB compressed and lazy-loads
  Netlify Identity only when a tool call needs authenticated API access.
- Four bootstrap tools: resolve, get bundle, request adapter, and report result.
- Authenticated start-page resolution merges the public catalog with safe
  metadata from the owner's private library; the same bundle tool handles both
  visibility classes and decrypts custom source in the browser.
- Typed public adapter manifest and deterministic route/intent matcher.
- Version-pinned inline bundles with SHA-256 integrity metadata.
- `raising-fi.public.funding@1.1.0` with exact-origin enforcement, top-level
  enforcement, idempotent installation, timeout, a single same-origin network
  route, and all 14 currently available public record fields for up to the 40
  records exposed by the site.
- `linkedin.core.company-search@1.0.0` with route-aware selection, live-session
  CSRF derivation inside the page, bounded results, and no credential export.
- `linkedin.messaging.send-message@1.0.0` with exact profile verification,
  short-lived prepare/confirm drafts, and pre-request at-most-once locking.
- `linkedin.messaging.search-outreach@1.0.0` with visible People-result
  selection capped at three, exact recipient resolution, complete batch
  preview, batch-specific confirmation, sequential at-most-once attempts, and
  stop-on-ambiguity behavior.
- `github.public.user-research@1.0.0` with public user search, bounded profile
  lookup, and top owner repositories by stars.
- `hacker-news.public.front-page@1.0.0` with bounded, network-free extraction
  of the current front page. The first cross-origin search design was rejected
  during browser verification because Hacker News CSP blocks the request.
- Netlify Functions for catalog, resolution, bundle delivery, adapter requests,
  and opt-in telemetry.
- Netlify Blobs append-only storage for sanitized requests and telemetry,
  namespaced by deployment context.
- Private-workspace code with Netlify Identity, owner-scoped Blobs storage,
  fixed-recipient declarative LinkedIn tools, and authenticated activation
  pages. Identity and the default GitHub provider are enabled in production.
- Sixty-one automated tests plus production build validation.

## Verified in ChatGPT's integrated browser

The bootstrap tools were first verified as native WebMCP tools before the
human/agent page split. The following real flow passed:

1. `adaptab_resolve` matched a clean `https://raising.fi/` tab.
2. `adaptab_get_bundle` returned the pinned bundle and a hash matching resolve.
3. CDP `Runtime.evaluate` installed the bundle into the target top-level page.
4. ChatGPT rediscovered `adaptab_raising_fi_list_recent_funding` natively.
5. A call with `limit: 3` returned three live public records.
6. A second installation returned `already_installed` without duplicate tools.
7. A hard reload invalidated the old handle and removed the tool, as declared.
8. Reinjection registered a fresh tool and a new call succeeded.

The complete flow was repeated successfully against the public Netlify
deployment and a clean Raising.fi document.

The later agent-page split was also verified in production: `/start` exposed
no WebMCP tools, while a hidden `/bootstrap` document exposed all four and
successfully resolved `raising-fi.public.funding@1.1.0`.

The LinkedIn company-search adapter was resolved from both local and public
AdapTab catalogs, installed into authenticated LinkedIn documents, and invoked
through native WebMCP. Queries for OpenAI and Showrun returned bounded company
results while credentials remained inside the page.

The messaging group was resolved from the public Netlify catalog, its immutable
bundle hash matched the value returned by resolve, and it was installed into a
fresh authenticated LinkedIn document. Native WebMCP discovery exposed the
separate prepare and confirmed-send tools. Its send, duplicate-send,
ambiguous-outcome, expiry boundary, origin guard, and recipient-validation
behavior are covered by mocks. Separately authorized production sends were
successfully reported by LinkedIn.

The GitHub and Hacker News adapters were each resolved from the public Netlify
catalog, hash-matched, installed into clean target documents, rediscovered as
native WebMCP tools, and invoked successfully against live page data.

The current LinkedIn People-search markup was inspected in a live signed-in
tab and supports the adapter's primary-result boundary. The deployed catalog
resolved the adapter, its bundle hash matched, CDP installed it, native WebMCP
discovered its two tools, and a limit-two preview resolved the first two exact
visible recipients with `sent: false`. After a fresh explicit authorization,
the same two-recipient group was prepared again and both sequential sends
returned `sent`; inbox inspection showed both test messages.

This verifies the no-extension MVP path. It still requires a client with an
approved page-injection capability such as full CDP access.

The production private-workspace path was also verified with an authenticated
owner and a three-profile fixed-recipient group. The stored configuration was
returned only through the private activation page, the generated bundle's
SHA-256 matched locally, and CDP installed it into an authenticated LinkedIn
top-level document. LinkedIn discovered the generated preview and confirmed-
send tools through native WebMCP. Neither tool was invoked, so this test made
no profile-resolution requests and sent no messages.

A subsequent owner-authorized production run exercised the complete reviewed-
template flow. After a separate action-time confirmation, the send tool
reported successful bounded delivery with retries disabled for the batch.

The unified start flow was then production-tested from a fresh integrated-
browser document. It refreshed the remembered Identity session, connected two
owner-private adapters containing three actions, resolved a private LinkedIn
template alongside relevant public alternatives, and returned its owner-checked bundle with matching
integrity through the same `adaptab_get_bundle` tool used for public adapters.
The same page resolved an encrypted custom Raising.fi adapter, decrypted it
locally, removed ciphertext from the result, injected it into the exact target
origin, discovered its native WebMCP tool, and completed a harmless read-only
invocation.

## Next

1. Record the sub-three-minute demo and complete the Devpost submission.
2. Add a second test identity to verify cross-owner 404 behavior in production,
   then add deletion/export controls.
3. Add a guided adapter-authoring workflow using the existing manifests as
   examples and Showrun only as prior-art reference material.
