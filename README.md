# micheldev.com

Michel Salib's personal site: a hub index plus a CV, generated from YAML.

**[micheldev.com](https://micheldev.com)** is canonical.
`michelsalib.com` 301-redirects to it.

Editing the site means editing a file in `content/`, committing, and pushing.
Nothing else — the career timeline on the homepage, the `/cv` page and both PDFs
all render from the same source, so they cannot disagree with each other.

## Stack

| | |
| --- | --- |
| Build | Bun + TypeScript. Templates are tagged template literals; no framework |
| Front end | Hand-written CSS, ~2.5 KB of JS. Motion is CSS scroll-driven timelines |
| Type | Ubuntu Sans + Ubuntu Sans Mono, variable, subset to latin, self-hosted (89 KB) |
| Runtime | `Bun.serve` on Cloud Run, `us-central1`, min instances 0 |
| Edge | Cloudflare in front, which is what makes a US origin fine from Paris |
| Infra | Terraform in `infra/`, own GCP project |
| CI/CD | GitHub Actions → Workload Identity Federation → Cloud Run |
| Analytics | Cloudflare's, read by the origin. No third-party requests from the browser, no cookies, no trackers |

## Content

Everything editable lives in `content/`:

| File | What it drives |
| --- | --- |
| `cv.yaml` | `/cv`, `/cv/fr`, both PDFs, and the homepage `/work` timeline |
| `projects.yaml` | The `/projects` section, the archive table, `/elsewhere`, and what `/stats.json` counts |
| `site.yaml` | Homepage copy, section headings, canonical + redirect hosts |
| `cv.schema.json` | Validates `cv.yaml`, in the editor and in CI |

`cv.yaml` is validated on every push. The schema is wired up via a
`# yaml-language-server: $schema=` directive, so an editor flags mistakes as you
type — it has already caught an unquoted `: ` that silently turned a list item
into a map.

### Translatable fields

Prose is a `{ en, fr }` map; anything factual — dates, employers, technologies,
numbers — is written once:

```yaml
context:
  en: 24k+ employees across the world.
  fr: 24k+ employés dans le monde.
stack: [TypeScript, Node.js, AWS]
```

### Marking the current role

Set `to: present` on one `experience` entry. That single switch makes the
renderer label it **Currently**, give it the green live dot and print
`2025 — now`. Every other entry gets a closed year range and a neutral dot.
`bun run validate` fails if two entries claim it.

### The lead project

The first entry in `active` leads the homepage: it gets the plate with the 45°
cut, and its `subdomains` are listed a row each — host, status dot, and what
that endpoint tracks. Everything after it is a card. Reordering the list moves
that treatment, the same way reordering `metrics` moves the accent tile; there
is no `featured` flag to keep in sync with the order.

```yaml
subdomains:
  - host: notion-tmdb
    what: Films and TV
```

The apex is added at render time from `hosts.canonical`, so these stay bare
labels and a domain move is one line in `site.yaml`. They must match what
Terraform actually maps — `live_services` counts them, and that number is on the
hero tile and in the top bar.

## The live figures

Four numbers on the homepage are not built into the page: downloads, stars,
repos, and the date of the last release. The build renders a real figure for
each, and `src/client/stats.ts` replaces it with a fresher one from
`/stats.json` — a route on the origin that counts npm, Packagist and GitHub at
request time.

The point is that the numbers move without a deploy. The reason it does not cost
anything is the cache:

```
public, max-age=600, s-maxage=604800, stale-while-revalidate=86400, stale-if-error=604800
```

A week at the edge, ten minutes in a browser. One pass over roughly twenty
upstream requests every seven days, however many people visit;
`stale-while-revalidate` means the visitor who arrives at the moment it expires
is served the old figure and the refresh happens behind them, and
`stale-if-error` keeps the last good answer on screen through a registry outage.
The origin also memoises in process and single-flights the refresh, because
scaling to zero means cold instances are routine.

> **Cloudflare does not cache JSON by default.** This needs a Cache Rule on the
> zone — match `hostname eq "micheldev.com" and http.request.uri.path eq
> "/stats.json"`, set *Eligible for cache*, and leave the edge TTL on **Use
> cache-control header**. Without it the headers are still correct and the
> origin simply does the work more often; nothing breaks.

**Nothing is a placeholder.** Every tile holds a correct figure before the fetch
resolves, and keeps it if the fetch never does — a reader with no JS sees a page
that is merely a little behind. `stats.downloads_floor` in `projects.yaml` is
the one figure with no other source, so it is rounded *down* from a measured
total and can only ever understate. A source that fails keeps its last good
value rather than dropping to zero; a partial download total is discarded
outright, because a headline falling from 22.6M to 1.5M reads as a collapse
rather than as the outage it is.

Registries and the downloads floor live in the `stats` block of `projects.yaml`.
*Which projects* get counted is not listed there — it is every entry in `active`
carrying a `repo`, so a project named on the page is measured by construction
and cannot be forgotten. The build resolves both into
`dist/.stats-sources.json`, the same way `site.hosts` becomes `.hosts.json`;
the runtime image ships no YAML parser.

### Per project

Each of the four active projects gets its own line, and which figures it shows
depends on what kind of thing it is rather than on any flag in the YAML:

| | |
| --- | --- |
| Notion connectors | `20.3k requests · 7 days`, summed across all six hostnames |
| media-cast, audio-tray, updater | `v0.3.0 · today · 29 downloads` |

Assembled from whatever came back, not branched on a declared type — a hosted
service has traffic and no releases, a desktop app has releases and no traffic,
and a zero is treated as nothing so no card ever reads `0 downloads`.

The window is **7 days here and 30 on the hero tile**, which looks inconsistent
and is not. Breaking traffic down by hostname needs
`httpRequestsAdaptiveGroups`, and on the free plan that dataset refuses a range
wider than a day and retains only about a week; the zone-wide
`httpRequests1dGroups` behind the visit count has neither limit. The week is
queried as seven one-day fields aliased into a single request — under the range
cap each time, one round trip rather than seven.

And it says **requests**, not visits, deliberately: these endpoints are called
by Notion and by their own schedules far more than by people, and two of the six
are backup jobs. The number honestly shows a service doing its job, which is not
the same claim as an audience.

### Credentials in production

Three repository secrets, all optional and independent:

| Secret | What it unlocks |
| --- | --- |
| `CLOUDFLARE_ZONE_ID` | Zone → Overview, right sidebar. Not a credential, but a public repo prints unmasked variables |
| `CLOUDFLARE_API_TOKEN` | The visit count and the connector traffic. An API token — **not** the Global API Key — scoped to `Zone · Analytics · Read` on that one zone |
| `GH_STATS_TOKEN` | 5,000 GitHub requests an hour instead of 60. A fine-grained token with no permissions |

`GH_STATS_TOKEN`, not `GITHUB_TOKEN`: Actions reserves that prefix for the token
it injects into every run, and would refuse to create the secret. That injected
one would not work here anyway — it expires with the job.

The two tokens are stored as **one Secret Manager secret holding a JSON
object**, reaching the container as `STATS_CREDENTIALS`. Cloud Run projects a
secret as a single environment variable, so one secret per credential would also
mean one version and one IAM binding per credential, on an identity meant to
hold as little as possible. Packed, it is one of each however many there are,
and a third credential later is a key in a map rather than another block of
Terraform.

Supply none and none of it exists — no secret, no binding, no environment
variable, and a runtime service account still holding **no roles at all**. That
is the default, and the site is built to run that way: the visit count is simply
absent and GitHub is called anonymously.

Two caveats before quoting the visit count. On the free plan the total includes
crawlers with no supported way to split them out, and the retention window is
plan-specific, so a 30-day query may return fewer days than asked for.

## Commands

```sh
bun install

bun run dev        # rebuild on change, served through the production handler
bun run build      # → dist/
bun run pdf        # print /cv and /cv/fr to PDF (needs Chrome)
bun start          # serve dist/ exactly as Cloud Run does

bun run validate   # cv.yaml against its schema, plus consistency checks
bun run check      # Biome lint + format
bun run typecheck  # tsgo
bun test
```

`bun run dev` serves through the same handler production uses, so redirects,
cache headers and 404s behave locally as they will when deployed.

A fresh clone needs nothing but `bun install` — every environment variable is
optional, and the site builds, serves and passes its tests without any of them.
Copy `.env.example` to `.env` to fill in the parts that cannot be derived from
`content/`; Bun loads it automatically, so no `source` step.

### Working on the live figures

There is nothing to generate and no local mode — `bun run dev` queries the same
four APIs the deployed site does, through the same handler, so `/stats.json`
behaves locally exactly as it will in production.

That is affordable because the caching already pays for itself twice. The route
memoises in process, and `dev.ts` rebuilds inside that same process rather than
restarting it, so an afternoon of edits costs **one** refresh: the first request
takes about 1.3s and every one after it, across any number of rebuilds, is
served from memory in about a millisecond.

Set `GITHUB_TOKEN` anyway. Six of those requests go to GitHub, which allows 60 an
hour anonymously, counted per source IP — enough for ordinary work, not enough
for a morning of restarting the server. With a token it is 5,000, and the figures
stop occasionally falling back to their build-time values while you are looking
at them.

## The PDFs

`/cv` and its PDF are the same document. The PDF is Chrome printing the page
through the `@media print` block in `src/styles/04-cv.css`, so it cannot drift
from what a visitor sees.

Two things about that block are load-bearing, and both were bugs first:

- **It must be last in the file.** A4 at 12mm margins is about 703 CSS px, so the
  `max-width: 880px` breakpoint applies *while printing*. At equal specificity
  the later rule wins, and when print sat above it the skills band was pushed to
  the end of the PDF.
- **It must disable the scroll-driven animations.** There is no scrollport when
  printing, so `animation-timeline: view()` freezes on its `from` keyframe —
  `opacity: 0` — and the CV printed blank across seven pages while the invisible
  boxes still took up space.

`tests/build.test.ts` asserts both, and `scripts/pdf.ts` fails the build if
either PDF exceeds three pages, because that is what a broken print layout looks
like from the outside.

Email and phone are **PDF-only**: `/cv` is crawlable, so the contact line is
rendered inside a block the print stylesheet reveals and the screen never shows.
See the `privacy` key in `cv.yaml`.

## Deploying

CI builds the site, prints the PDFs, then builds a container that is nothing but
`dist/` and one dependency-free script. Chrome lives on the runner, not in the
image.

First-time setup for a fresh GCP project:

```sh
./infra/bootstrap.sh micheldev-www <billing-account-id>
```

Then follow the instructions it prints: verify the domains in Search Console,
apply once with `enable_domain_mappings = false`, set the two GitHub repository
variables from the Terraform outputs, push, and finally flip the mappings on and
point Cloudflare at the records in the `dns_records` output — proxy enabled, SSL
mode **Full (strict)**.

### Why Cloud Run and not a bucket

A plain GCS bucket cannot serve HTTPS on a custom domain; that needs a load
balancer, whose forwarding rule costs about €18/month whether anyone visits or
not. Firebase Hosting would be free and fast, but Cloud Run keeps one deploy
pattern across the whole estate — the same Docker → Artifact Registry →
Terraform → Cloud Run path as `notion-tmdb`. Cloudflare supplies the CDN that
Cloud Run domain mappings lack, which removes the only real argument against
`us-central1`.

## Layout

```
content/          the site, as data
src/
  build.ts        orchestrates the build
  content.ts      loads and types the YAML
  html.ts         tagged templates; interpolation escapes by default
  partials.ts     head, top bar, footer
  pages/          home, cv, 404
  styles/         00-fonts, 01-tokens, 02-base, 03-home, 04-cv
  client/         theme toggle, CV spine + summary strip, live figures
  server.ts       the Cloud Run runtime; imports one local module, no packages
  stats.ts        counts npm, Packagist, GitHub, Cloudflare; dependency-free
  format.ts       number and date shapes, shared by the build and the browser
  dev.ts          watch + rebuild
scripts/          validate, pdf
infra/            Terraform
tests/            build output, server behaviour, print cascade
```

`src/html.ts` escapes every interpolated value. Markup has to come through
`raw()`, which is why the only fields that can carry HTML are the `*_html` keys
in `site.yaml` — greppable, and few.

## Notes

`bun run check` reports a handful of `noDescendingSpecificity` warnings on the
stylesheets. They are cross-element false positives: the flagged pairs target
different elements and pseudo-elements, and the cascade was verified by measuring
rendered pixels in a real browser. Exit code is 0.
