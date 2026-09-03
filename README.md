# AdapTab

**WebMCP for every tab.**

AdapTab is a hosted catalog of reviewed browser adapters. An agent visits the
AdapTab start page, resolves the current tab to a minimal adapter, obtains an
immutable installer with an integrity hash, and injects it into the user's
already-authenticated page through an approved browser automation channel.

The hosted service never receives browser cookies or acts as a proxy for the
third-party website. Adapter tools execute inside the matching top-level page
and use that page's existing browser session.

## Local development

```sh
npm install
npm run check
npm run dev
```

Open `http://localhost:8888/start`. In a browser with WebMCP enabled, the page
registers four bootstrap tools:

- `adaptab_resolve`
- `adaptab_get_bundle`
- `adaptab_request_adapter`
- `adaptab_report_result`

The first catalog adapter is `raising-fi.public.funding`, which provides a
bounded, read-only funding search on `https://raising.fi` and
`https://www.raising.fi`.

## Security model

- Exact origin and route checks run during resolution and again at install.
- Bundle SHA-256 values provide transport/integrity verification; they are not
  publisher signatures.
- Adapters return bounded data and never return credentials.
- Telemetry requires an explicit `consent: true` argument and excludes tool
  inputs, outputs, page content, cookies, messages, and account identifiers.
- A full document navigation removes injected tools. The calling agent must
  resolve and inject again for the new document.

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) and
[docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md) for the rationale and tested
browser behavior.
