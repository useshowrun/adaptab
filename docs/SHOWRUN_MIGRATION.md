# Showrun-to-AdapTab migration matrix

Last reviewed: 2026-09-03  
Pinned Showrun source: `aa12a23732e6f865bd1134df9af0332e87ac6981`

Showrun is prior work by the same team and is not the hackathon entry. This
document inventories its network recipes without presenting its CLI skills as
AdapTab work. AdapTab adapters are independently implemented as typed WebMCP
tools with explicit origins, routes, intent matching, bounded outputs,
side-effect classification, lifecycle behavior, and tests.

No Showrun source file is vendored into AdapTab. A capability is marked
"reviewed" only after it has a native WebMCP installer, fixture/unit coverage,
and a catalog entry. Unreviewed recipes remain non-executable.

## Inventory

The pinned Showrun snapshot contains 83 site capability folders, excluding its
two infrastructure/meta skills (`chrome-cdp` and `showrun`).

| Site family | Showrun capability folders | AdapTab state |
| --- | ---: | --- |
| Raising.fi | 1 | Reviewed: public funding |
| GitHub | 1 | Reviewed: user search, public profile, top repositories |
| Hacker News | 3 | Partial: reviewed current front page; search and user detail queued |
| LinkedIn | 14 | Partial: reviewed company search and prepared messaging; profile, posts, jobs, Sales Navigator queued |
| Crunchbase | 8 | Queued; authenticated/product-route review required |
| Ground News | 3 | Queued |
| Instagram | 4 | Queued; authenticated reads/writes require separate risk review |
| PitchBook | 11 | Queued; private subscription and route entitlements required |
| Reddit | 5 | Queued; anonymous/session behavior needs browser verification |
| Seeking Alpha | 9 | Queued; authenticated and market-data boundaries require review |
| Similarweb | 9 | Queued; free/premium products must resolve separately |
| X / Twitter | 5 | Queued; authenticated reads and writes require separate risk review |
| Yahoo Finance | 10 | Queued; crumb/session lifecycle needs browser verification |

## Reviewed conversions

| Showrun knowledge | AdapTab adapter | Important conversion |
| --- | --- | --- |
| `raisingfi/funding` | `raising-fi.public.funding@1.0.0` | Same-origin public request, bounded funding preview |
| `github/user-repos` | `github.public.user-research@1.0.0` | Three typed read tools; fixed GitHub API origin; credentials omitted |
| `hackernews/stories` | `hacker-news.public.front-page@1.0.0` | One DOM-backed read tool; no network request; maximum ten current stories |
| `linkedin/legacy/search` | `linkedin.core.company-search@1.0.0` | Live-session CSRF stays in page; company-only result schema |
| `linkedin/legacy/messaging` | `linkedin.messaging.send-message@1.0.0` | Recipient resolution separated from a confirmed at-most-once mutation |

## Migration gates

Every future port must pass these gates before entering the public catalog:

1. Confirm the workflow is authorized and compatible with the target service.
2. Resolve the smallest site/product/route/intent group.
3. Prefer JSON or GraphQL requests over DOM automation where appropriate.
4. Keep target credentials in the target page and never return them.
5. Use fixed network origins and allowlisted paths; never accept an endpoint
   URL from tool input.
6. Bound input lengths, result counts, response fields, and request timeouts.
7. Separate reads from mutations; require preview/confirmation for writes.
8. Treat ambiguous mutations as attempted and never automatically retry them.
9. Add origin, input, response-shape, allowlist, and idempotent-install tests.
10. Verify discovery and at least one safe invocation in a real target tab.

Hacker News search was prototyped against the public Algolia endpoint, then
kept out of the catalog after real-browser testing showed that the target
page's CSP blocks the cross-origin request. The next low-risk candidates are
Hacker News story/user detail and Reddit public search. Premium and
write-capable families remain deliberately behind their additional review
gates.
