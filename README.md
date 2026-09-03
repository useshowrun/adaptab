# AdapTab

**WebMCP for every tab.**

**Live app:** [adaptab.netlify.app/start](https://adaptab.netlify.app/start)

AdapTab is a hosted catalog of reviewed, route-aware browser adapters. An agent
visits one start page, resolves another open tab to the smallest compatible
adapter, obtains an immutable installer with an integrity hash, and injects it
through an approved browser automation channel. The target page then exposes
the adapter's narrow actions as native WebMCP tools.

The hosted service never receives browser cookies or acts as a proxy for the
third-party website. Adapter tools execute inside the matching top-level page
and use that page's existing browser session.

## Why WebMCP

Deterministic browser scripts can already operate websites, but an agent must
install and understand each integration separately. AdapTab adds a shared
capability layer: tools are typed, discoverable on the active page, filtered by
origin, route, intent, and client support, and invoked through WebMCP's normal
browser review flow.

```text
AdapTab catalog page
  → resolve origin + route + intent
  → return reviewed versioned adapter
Trusted browser bridge
  → inject into the approved target tab
Target document
  → register WebMCP tools
  → make bounded same-origin requests with the live browser session
```

## Current demo

The MVP ships two bounded read-only adapters:

- `raising-fi.public.funding@1.0.0` for the public Raising.fi funding preview.
- `linkedin.core.company-search@1.0.0` for authenticated LinkedIn company
  search using the current page session.

From a clean target tab, the tested flow is:

1. Call `adaptab_resolve` on the AdapTab start page.
2. Call `adaptab_get_bundle` for the exact returned version.
3. Verify its SHA-256 and expected origin.
4. Evaluate the installer in the Raising.fi top-level document using approved
   CDP access.
5. Rediscover and call the resolved target tool through native WebMCP.

## Local development

```sh
npm install
npm run check
npm run dev
```

Open `http://127.0.0.1:5173/start`. In a browser with WebMCP enabled, the page
registers four bootstrap tools:

- `adaptab_resolve`
- `adaptab_get_bundle`
- `adaptab_request_adapter`
- `adaptab_report_result`

`npm run check` runs strict TypeScript checks, adapter/unit tests, and the
production build.

## Security model

- Exact origin and route checks run during resolution and again at install.
- Bundle SHA-256 values provide transport/integrity verification; they are not
  publisher signatures.
- Adapters return bounded data and never return credentials.
- Telemetry requires an explicit `consent: true` argument and excludes tool
  inputs, outputs, page content, cookies, messages, and account identifiers.
- A full document navigation removes injected tools. The calling agent must
  resolve and inject again for the new document.

AdapTab does not grant permission to automate a website. Adapter authors and
users must comply with the target service's terms, applicable law, and their
own authorization. Public adapters should use documented APIs or otherwise
authorized interfaces. Third-party names identify compatibility only; AdapTab
is not endorsed by those services.

## Hackathon provenance

AdapTab was created from scratch during the 2026 WebMCP Challenge. The first
commit contains the new catalog, WebMCP bootstrap layer, injected runtime,
Raising.fi adapter, tests, and Netlify deployment code.

[Showrun](https://github.com/useshowrun/showrun) is prior work by the same team
and is not the hackathon entry. It informed the deterministic, network-first
adapter approach, but no Showrun CLI skill is required to run AdapTab and no
Showrun source is vendored in this repository.

## Documentation

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) and
[docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md) for the architecture and tested
browser behavior. [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
records the reproducible MVP results, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
covers Netlify deployment.
