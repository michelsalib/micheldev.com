# micheldev.com

Michel Salib's personal site: a hub index plus a CV, generated from YAML.

**[micheldev.com](https://micheldev.com)** is canonical; `michelsalib.com`
301-redirects to it.

Editing the site means editing a file in `content/`, committing, and pushing.
The `/cv` page and both PDFs render from one source, so they cannot disagree.

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
| Analytics | Cloudflare's, read by the origin. No third-party requests, no cookies |

## Content

| File | What it drives |
| --- | --- |
| `cv.yaml` | `/cv`, `/cv/fr`, both PDFs, the OG card |
| `projects.yaml` | The `/projects` section, the archive table, `/elsewhere`, `/stats.json` |
| `site.yaml` | Homepage copy, section headings, canonical + redirect hosts |
| `*.schema.json` | Validates each file, in the editor and in CI (`bun run validate`) |

Prose is a `{ en, fr }` map; anything factual — dates, employers, numbers — is
written once. `to: present` on one `experience` entry is what marks the current
role, and validation fails if two claim it. The first entry in `active` leads
the projects section, and the first `metrics` entry gets the accent tile — both
by position, so reordering the YAML moves the treatment.

Numbers quoted inside copy use braces: `{stars}`, `{repos}`, `{live_services}`.
A brace names a `derive` key and renders the figure the tiles render, live where
`/stats.json` can improve on it. See `splitFigures` in `src/content.ts`.

## Commands

```sh
bun install

bun run dev        # rebuild on change, served through the production handler
bun run build      # → dist/
bun run pdf        # print both CV PDFs and shoot the OG card (needs Chrome)
bun start          # serve dist/ exactly as Cloud Run does

bun run validate   # content against its schemas, plus consistency checks
bun run check      # Biome lint + format
bun run typecheck
bun test
```

A fresh clone needs nothing but `bun install` — every environment variable is
optional. Copy `.env.example` to `.env` for the parts that cannot be derived
from `content/`; Bun loads it automatically.

`bun run dev` serves through the same handler production uses, so redirects,
cache headers and 404s behave locally as they will when deployed. It queries the
same live APIs too, memoised in process, so an afternoon of edits costs one
refresh. Set `GITHUB_TOKEN` anyway: 60 requests an hour anonymously, 5,000 with
one.

## The live figures

Four numbers on the homepage are fetched, not built: downloads, stars, repos and
the per-project release/traffic lines. `/stats.json` counts npm, Packagist,
GitHub and Cloudflare behind a week of shared cache; `src/client/stats.ts` writes
the answers over what the build rendered.

Never a dependency, only an upgrade: every figure is already a real number in the
HTML, so no JS, a blocked request or a dead registry all leave a correct page
that is merely a little behind. Elements with no build-time equivalent (the last
release, the visit count) ship `hidden`.

Three optional repository secrets unlock the rest: `CLOUDFLARE_ZONE_ID` and
`CLOUDFLARE_API_TOKEN` (scoped to `Zone · Analytics · Read`) for the traffic
figures, and `GH_STATS_TOKEN` for GitHub's higher rate limit. Both tokens are
stored as **one** Secret Manager secret holding a JSON object, reaching the
container as `STATS_CREDENTIALS` — Cloud Run projects a secret as a single
environment variable, so packing them keeps it to one version and one IAM
binding. Supply none and none of it exists: the visit count is absent, GitHub is
called anonymously, and the runtime service account holds no roles at all.

## The PDFs and the OG card

`/cv` and its PDF are the same document: the PDF is Chrome printing the page
through the `@media print` block in `src/styles/04-cv.css`. The link-preview card
is the same trick — `src/pages/og.ts` rendered to `.print/og/index.html` and
screenshotted at 1200×630. Both are produced by `bun run pdf`, which CI runs
after the build and before the image, because Chrome lives on the runner and has
no business in a production image.

Email and phone are **PDF-only**. They come from `CV_EMAIL`/`CV_PHONE`, never
from `content/` — the repo is public — and land only in the copies under
`.print/`, which are outside `dist/` and so are never served or containerised.
`/cv` itself is crawlable, so it points at LinkedIn instead.

## Deploying

CI builds the site, prints the PDFs and the card, then builds a container that is
nothing but `dist/` and one dependency-free script.

First-time setup for a fresh GCP project:

```sh
./infra/bootstrap.sh micheldev-www <billing-account-id>
```

Then follow the instructions it prints: verify the domains in Search Console,
apply once with `enable_domain_mappings = false`, set the two GitHub repository
variables from the Terraform outputs, push, and finally flip the mappings on and
point Cloudflare at the records in the `dns_records` output — proxy enabled, SSL
mode **Full (strict)**.

Cloud Run rather than a bucket because a bucket cannot serve HTTPS on a custom
domain without a ~€18/month load balancer, and rather than Firebase Hosting
because this keeps one deploy pattern across the whole estate. Cloudflare
supplies the CDN that Cloud Run domain mappings lack.

## Layout

```
content/          the site, as data
src/
  build.ts        orchestrates the build
  content.ts      loads and types the YAML
  html.ts         tagged templates; interpolation escapes by default
  partials.ts     head, top bar, footer, figure tiles
  pages/          home, cv, 404, og card
  styles/         00-fonts, 01-tokens, 02-base, 03-home, 04-cv
  client/         theme toggle, CV spine + summary strip, live figures
  server.ts       the Cloud Run runtime; imports one local module, no packages
  stats.ts        counts npm, Packagist, GitHub, Cloudflare; dependency-free
  format.ts       number and date shapes, shared by the build and the browser
scripts/          validate, pdf
infra/            Terraform
tests/            build output, server behaviour, print cascade
```

## Traps worth knowing

Each of these was a bug first, and each has a test.

- **The `@media print` block must be last in `04-cv.css`.** A4 at 12mm margins is
  ~703 CSS px, so `max-width: 880px` applies *while printing* and wins on source
  order.
- **Print must disable the scroll-driven animations.** There is no scrollport, so
  `animation-timeline: view()` freezes at `opacity: 0` and the CV prints blank.
- **Hues arrive as classes, never inline styles.** `style-src 'self'` blocks the
  attribute outright, which once rendered the whole CV spine grey.
- **`.dockerignore` denies everything and allows back by name.** A file added to
  the Dockerfile's `COPY` and not to that list is simply absent from the build
  context.
- **`bun run check` reports `noDescendingSpecificity` warnings on the
  stylesheets.** Cross-element false positives; the cascade was verified in a
  browser. Exit code is 0.
