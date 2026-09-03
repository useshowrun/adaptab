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
- Private adapter authentication and storage.
- Signed bundle verification end to end.
- Route matching from the deployed AdapTab catalog.
- Netlify deployment and persistence.
- Native-site-tool conflict detection.
- Sales Navigator or Recruiter adapters.
- Multi-step composed tools.

