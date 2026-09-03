# AdapTab implementation status

Last updated: 2026-09-03

## Working now

- Public production deployment: `https://adaptab.netlify.app/start`.
- Vite + React start page with imperative top-level WebMCP registration.
- Four bootstrap tools: resolve, get bundle, request adapter, and report result.
- Typed public adapter manifest and deterministic route/intent matcher.
- Version-pinned inline bundles with SHA-256 integrity metadata.
- `raising-fi.public.funding@1.0.0` with exact-origin enforcement, top-level
  enforcement, idempotent installation, bounded inputs/outputs, timeout, and a
  single same-origin network route.
- `linkedin.core.company-search@1.0.0` with route-aware selection, live-session
  CSRF derivation inside the page, bounded results, and no credential export.
- Netlify Functions for catalog, resolution, bundle delivery, adapter requests,
  and opt-in telemetry.
- Netlify Blobs append-only storage for sanitized requests and telemetry,
  namespaced by deployment context.
- Ten automated tests plus production build validation.

## Verified in ChatGPT's integrated browser

The local start page exposed all four bootstrap tools as native WebMCP tools.
The following real flow passed:

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

The LinkedIn company-search adapter was also resolved from the local AdapTab
catalog, installed into an authenticated LinkedIn document, and invoked through
native WebMCP. A query for OpenAI returned three bounded company results while
credentials remained inside the page.

This verifies the no-extension MVP path. It still requires a client with an
approved page-injection capability such as full CDP access.

## Next

1. Deploy and repeat the LinkedIn company-search test from the public catalog.
2. Add the narrowly confirmed LinkedIn messaging adapter with prepare/commit
   semantics and no ambiguous retries.
3. Polish public documentation and record the sub-three-minute demo.
