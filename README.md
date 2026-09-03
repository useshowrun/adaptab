# AdapTab

**WebMCP for every tab.**

**Live app:** [adaptab.netlify.app/start](https://adaptab.netlify.app/start)

AdapTab is a hosted catalog of reviewed, route-aware browser adapters. An agent
loads one lightweight bootstrap page, resolves another open tab to the smallest
compatible adapter, obtains an immutable installer with an integrity hash, and
injects it through an approved browser automation channel. The target page then
exposes the adapter's narrow actions as native WebMCP tools.

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
AdapTab agent bootstrap
  → resolve origin + route + intent
  → return reviewed versioned adapter
Trusted browser bridge
  → inject into the approved target tab
Target document
  → register WebMCP tools
  → make bounded allowlisted requests, using the live session only when needed
```

## Judge quickstart

Open one supported target page. Enable browser injection for the target only
when the agent host requests it, then ask:

> Use https://adaptab.netlify.app/bootstrap as AdapTab's agent bootstrap. Keep
> it available while using AdapTab for all relevant open tabs.

The bootstrap tools provide the precise resolve, verify, inject, and rediscover
instructions to the agent. When the user is signed in, the same resolver
searches both the reviewed public catalog and that owner's private library;
private source remains lazy, owner-checked, and `no-store`.

`/bootstrap` is separate from the human-facing
[`/start`](https://adaptab.netlify.app/start) catalog. `/start` does not
register WebMCP tools; `/bootstrap` loads no React UI, catalog list, or
workspace status before registering its four tools. A capable agent may keep
it in a background or hidden browsing context, but it is not page-free:
closing or replacing that document removes its registered tools.

“All relevant” is deliberate: the agent processes open tabs individually and
activates only those with a route- and intent-compatible adapter. Each browser
document still has its own injection lifecycle and may require its own CDP
approval.

For a no-login test, open `https://news.ycombinator.com/` and ask for the
current Hacker News front page, or open `https://raising.fi/` and ask for
recent funding. The hosted AdapTab page is a catalog/control plane; the
trusted browser bridge performs cross-tab injection.

## Current demo

The MVP ships six route- and intent-filtered adapters:

- `raising-fi.public.funding@1.1.0` for up to 40 recent public Raising.fi
  records with all currently available funding fields, including amounts,
  rounds, investors, locations, websites, descriptions, and hiring signals.
- `github.public.user-research@1.0.0` for public user search, profile lookup,
  and top repositories by stars.
- `hacker-news.public.front-page@1.0.0` for a bounded, network-free reading of
  the current front page.
- `linkedin.core.company-search@1.0.0` for authenticated LinkedIn company
  search using the current page session.
- `linkedin.messaging.send-message@1.0.0` for an exact recipient/message
  preview followed by a separately confirmed, at-most-once send attempt.
- `linkedin.messaging.search-outreach@1.0.0` for a capped People-search
  recipient preview followed by a batch-specific confirmation and sequential,
  at-most-once send attempts.

The repository also contains a private-workspace MVP at `/workspace`. A
signed-in user can create an owner-only adapter from the reviewed LinkedIn
recipient-group template or import a custom adapter for any HTTPS origin. The
workspace lists every individual WebMCP tool inside each adapter package.
Custom source is AES-GCM encrypted in the browser before upload; Netlify stores
the ciphertext and the decryption key stays in that browser profile. Private
records never enter `/api/catalog`; authenticated `/api/resolve` can merge
their safe metadata into results, and `/api/bundle` delivers their source only
after a server-side owner check. The start-page client decrypts custom source
locally. An opaque `/tools/<id>` URL locates a tool but never authorizes access
by itself.

From a clean target tab, the tested flow is:

1. Call `adaptab_resolve` on the AdapTab bootstrap page.
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

Open `http://127.0.0.1:5173/bootstrap.html`. In a browser with WebMCP enabled,
the lightweight agent page registers four bootstrap tools:

- `adaptab_resolve`
- `adaptab_get_bundle`
- `adaptab_request_adapter`
- `adaptab_report_result`

`npm run check` runs strict TypeScript checks, adapter/unit tests, and the
production build.

Private Identity flows require Netlify's runtime. Enable Netlify Identity and
use `netlify dev` rather than the Vite-only command when testing authentication
locally.

## Security model

- Exact target origins are checked during resolution, installation, and tool
  execution; route families are filtered during resolution.
- Bundle SHA-256 values provide transport/integrity verification; they are not
  publisher signatures.
- Adapters return bounded data and never return credentials.
- Telemetry requires an explicit `consent: true` argument and excludes tool
  inputs, outputs, page content, cookies, messages, and account identifiers.
- A full document navigation removes injected tools. The calling agent must
  lazily rediscover, resolve, verify, and inject again for the new document.
- Messaging drafts expire after five minutes, are bound to the current
  document, and become permanently non-retryable before the send request.
- Search outreach is limited to three visible People results, requires a full
  preview plus batch-specific confirmation, permits one attempted batch per
  document, and stops after ambiguity.
- Reviewed private templates accept bounded declarative configuration. Custom
  private imports may contain owner-supplied JavaScript, which is encrypted in
  the browser, remains outside Git, and is never received by Netlify in
  plaintext. It is unreviewed code that runs with target-page access, so the UI
  previews origins, paths, declared network access, tools, and write risk.
- Custom private bundles enforce exact origin, declared path, and top-level
  document guards. The declared network list is metadata, not a JavaScript
  sandbox. Every private read and ciphertext delivery remains owner-scoped and
  uses no-store caching.

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

The [Showrun migration matrix](docs/SHOWRUN_MIGRATION.md) pins the prior-work
snapshot, records every capability family, and distinguishes reviewed AdapTab
ports from queued research.

## Documentation

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) and
[docs/EXPERIMENT_LOG.md](docs/EXPERIMENT_LOG.md) for the architecture and tested
browser behavior. [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md)
records the reproducible MVP results, and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
covers Netlify deployment. [docs/SHOWRUN_MIGRATION.md](docs/SHOWRUN_MIGRATION.md)
tracks prior-art recipes as they are independently converted into reviewed
AdapTab adapters. [docs/REQUIREMENTS_STATUS.md](docs/REQUIREMENTS_STATUS.md)
is the living ledger for the original requirements, shipped evidence, gaps,
and next milestones.
