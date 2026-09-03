# AdapTab experiment log

Status: observed behavior, not a production guarantee  
Last updated: 2026-09-03

## Environments tested

- ChatGPT/Codex integrated browser with site tools enabled.
- Integrated-browser developer mode with explicit full-CDP approval.
- Separate Chrome 152 test profile launched with CDP and WebMCP testing
  enabled.

## Native WebMCP baseline

The OpenAI documentation page exposed native site tools that ChatGPT could
discover and invoke. A custom guide was successfully requested through a
native write tool.

In standalone Chrome 152 with the WebMCP testing feature enabled, the CDP
WebMCP domain discovered and invoked native documentation tools without an
extension.

## Raising.fi injection test

A third-party test adapter was injected with CDP `Runtime.evaluate` into a
Raising.fi top-level document. It registered:

- a lifecycle/context diagnostic tool
- a bounded read-only funding-list tool

Observed results:

- ChatGPT discovered and invoked both tools through native WebMCP.
- The funding tool made a same-origin request to the existing public JSON API.
- Normal SPA navigation to About and browser Back preserved the tools and the
  same document identifier.
- Re-running the installer was idempotent and did not duplicate tools.
- Hard refresh removed the tools.
- A tool handle from the old document became stale and was rejected.
- Explicit reinjection restored the tools with a new document identifier.
- A new tab started without tools and required separate injection.
- A fresh client connection rediscovered tools already present in a surviving
  document without reinjection.

Important limitation:

- The integrated browser rejected CDP
  `Page.addScriptToEvaluateOnNewDocument` as unsupported through its raw-CDP
  connection.
- Therefore the integrated-browser method is explicit `Runtime.evaluate`
  injection plus reinjection after document replacement.
- This does not prove browser-restart persistence.

## LinkedIn authenticated injection test

After the user signed into LinkedIn in the integrated browser, a third-party
test adapter was injected into the live LinkedIn document.

Observed results:

- LinkedIn initially exposed no native WebMCP tools.
- ChatGPT discovered an injected context tool and bounded company-search tool.
- A native WebMCP invocation searched LinkedIn companies using Showrun's known
  GraphQL recipe and the live browser session.
- Searches for OpenAI and Showrun returned expected company results.
- Cookies and CSRF values were derived and consumed inside the LinkedIn page;
  they were not returned or written to disk.
- Direct route navigation replaced the document, removed the tools, and made
  the old handle stale.
- Reinjection restored tools with a new document identifier.
- A subsequent LinkedIn in-app SPA navigation preserved the tools and document
  identifier.

## Confirmed write test

With explicit user authorization, the test:

1. Registered a read-only tool restricted to resolving one requested LinkedIn
   vanity profile.
2. Verified the resolved recipient name and profile URL.
3. Registered a one-time send tool with the recipient and exact text fixed in
   the tool definition.
4. Required an explicit `SEND` argument.
5. Marked the tool attempted before the network request.
6. Prohibited automatic retry for ambiguous outcomes.
7. Invoked the tool through native WebMCP.

LinkedIn returned HTTP 200 and the message operation reported success. No
second send was attempted.

A later production-catalog test used the reviewed prepare/send adapter with
fresh user authorization. Exact-recipient preparation succeeded, the one-use
draft was confirmed once, and LinkedIn again reported a successful send.

## LinkedIn People-search composition probe

An authenticated LinkedIn People search was opened with a harmless keyword to
validate the first composed adapter's discovery boundary. In the current live
page, primary search results are exposed as distinct `role=listitem` elements;
the first `/in/` link in each item identifies the primary result while mutual
connection links occur later in the same item.

The implemented adapter therefore uses the user's already-open, already-
filtered result page as its search step, selects at most three visible primary
links, and resolves each exact profile through the page session before
creating a preview. Automated tests verify the batch-specific confirmation,
sequential send order, at-most-once lock, and stop-on-ambiguity behavior.

After deployment, the production catalog resolved
`linkedin.messaging.search-outreach@1.0.0` for that exact People-search route
and intent. The fetched bundle's SHA-256 matched the resolver result, CDP
installed it, and native WebMCP discovered only its preview and confirmed-send
tools. A preview with limit two independently resolved the first two visible
primary profiles, returned their names/URLs and an exact shared-message
preview, plus a batch-specific confirmation code, with `sent: false`. The send
tool was not called during that first preview probe.

With a later exact user authorization, a fresh two-recipient preview was
created for Eyüp Ülker and Mahmut Karaca using harmless test text the user
approved. The first invocation was stopped by the integrated browser's safety
layer before LinkedIn delivery; inbox inspection confirmed no message had
appeared. After the user explicitly authorized a retry, a fresh batch was
prepared and the confirmed tool reported `sent` for both sequential requests.
LinkedIn's messaging UI showed both delivered test messages. This also showed
that an agent-host safety policy can reject a write even when the page and
target endpoint would permit it.

## Private workspace implementation probe

The first private adapter slice is implemented and covered by automated tests:

- unauthenticated private-list access returns 401;
- a different signed-in owner receives 404 for another owner's opaque tool ID;
- approved LinkedIn profile origins are canonicalized and lookalikes rejected;
- the reviewed template accepts no arbitrary JavaScript—only a label and one
  to three URLs;
- generated bundles are private, integrity-addressed, and returned with
  `private, no-store` caching;
- the public catalog filters on `visibility: public` explicitly; and
- the agent-facing page registers only private info and bundle bootstrap tools.

Production Identity and the default GitHub provider are enabled. An owner
signed in with GitHub and created a private three-profile fixed-recipient
group. The activation page retrieved the exact stored configuration through
native WebMCP, returned a generated private bundle, and exposed its expected
LinkedIn origin and two generated tool manifests. A local SHA-256 computation
matched the returned integrity value.

After exact-origin and top-level checks, CDP installed that bundle into the
already authenticated LinkedIn document. Native WebMCP rediscovery returned
the generated read-only preview tool and separately confirmed send tool. The
test intentionally invoked neither, so it made no recipient-resolution
requests and sent no messages. Cross-owner 404 behavior is unit-tested but
still needs a second production identity for live verification.

A later owner-authorized production test completed the full reviewed-template
path: authenticated bundle retrieval, SHA-256 verification, tab-scoped CDP
injection, native WebMCP discovery, read-only preview, and a separately
confirmed mutation. The tool reported successful bounded delivery and disabled
retries for the completed batch.

The next private-library slice adds a general custom import path. Automated
tests verify manifest bounds, confirmation requirements for mutations,
client-side AES-GCM round trips, missing-key failure, ciphertext-only server
delivery, and origin/path/top-level guards. The workspace now lists the
individual WebMCP tools within every private adapter and registers
`adaptab_list_private_tools` for agent discovery.

In production, the authenticated owner imported a harmless read-only
Raising.fi page-context adapter through the permission-preview UI. The source
was encrypted in the browser, the workspace immediately showed three
individual tools across two site-independent adapter packages, and the detail
page reported that the custom adapter's key was available in that browser.
The activation page exposed its two private bootstrap WebMCP tools. A direct
production decrypt/inject/discover call was initially still pending.

## Unified start-page private activation

After the shared resolver and bundle route were deployed, production QA opened
only `/start` in a fresh integrated-browser document. The first pass found a
real session-lifecycle race: the browser-side Identity client still recognized
the owner, but an expired access cookie reached the Function before the SDK's
background refresh. The API correctly treated the call as signed out. AdapTab
now refreshes a remembered session before private-aware API calls, with public
signed-out requests unchanged.

The corrected flow verified:

- `/start` displayed three connected private WebMCP tools while keeping exactly
  four bootstrap tool names;
- authenticated resolution returned one intent-selected private LinkedIn
  adapter plus relevant route-matched public alternatives, without returning
  fixed-recipient configuration;
- the shared bundle tool performed the owner check and returned the reviewed
  private source with an integrity value matching resolution;
- the same resolver selected a client-encrypted custom Raising.fi adapter;
- the same bundle tool decrypted its source only in the browser profile holding
  the local key and omitted ciphertext from the returned materialized bundle;
- CDP installed the bundle into the exact Raising.fi top-level origin;
- native WebMCP discovered the one read-only private tool, whose invocation
  returned only the current page title, URL, and heading.

This closes the custom decrypt/inject/discover gap. It does not change the
cross-origin trust boundary: the hosted page provided the owner-authorized
bundle, while the approved integrated-browser CDP capability performed the
target-tab injection.

## GitHub public adapter test

Both the local and deployed AdapTab catalogs resolved
`github.public.user-research@1.0.0` for an open authenticated GitHub repository
page. Their integrity values matched, CDP installed the production bundle, and
native WebMCP discovered three read-only tools.

Live calls successfully:

- found the Showrun organization through public user search;
- returned its bounded public organization profile; and
- listed its top three owner repositories by stars, excluding forks.

All requests used the fixed `api.github.com` origin with credentials omitted.

## Hacker News public adapter test

The first Hacker News prototype registered successfully but attempted to call
the public Algolia HN Search API across origins. A real WebMCP invocation
failed because Hacker News's `default-src 'self'` content-security policy also
restricts fetch connections.

That prototype was not published. It was replaced with
`hacker-news.public.front-page@1.0.0`, a network-free tool that reads the
current top-level Hacker News document. Both local and production bundles were
tested after clean reloads; native WebMCP returned live front-page stories with
bounded metadata.

## Conclusions supported by the experiments

- An extension is not required for execution when a trusted host already has
  sufficient CDP access.
- WebMCP does not replace CDP; WebMCP provides typed discovery/invocation while
  CDP provides privileged injection and lifecycle access.
- Page-context execution is a useful credential boundary because the browser
  remains the only cookie jar.
- Tool registration belongs to a document. A lifecycle supervisor is required
  for reliable reinjection across full navigations and new tabs.
- The Netlify page cannot cross origins and inject into another tab by itself.
  It should provide reviewed adapters and activation descriptions to the
  trusted agent/browser layer.
- A third-party adapter must disclose its provenance because tools otherwise
  appear associated with the target page's origin.

## Items not yet tested

- Automatic reinjection by a long-running local supervisor.
- Full browser restart and recovery.
- A production Chrome extension.
- Production cross-owner isolation with a second Identity account.
- Signed bundle verification end to end.
- Native-site-tool conflict detection.
- Sales Navigator or Recruiter adapters.
