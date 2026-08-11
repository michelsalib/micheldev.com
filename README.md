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
| Analytics | None. No third-party requests of any kind |

## Content

Everything editable lives in `content/`:

| File | What it drives |
| --- | --- |
| `cv.yaml` | `/cv`, `/cv/fr`, both PDFs, and the homepage `/work` timeline |
| `projects.yaml` | The `/projects` section, the archive table, and `/elsewhere` |
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
renderer label it **Currently**, give it the green live dot, print `2025 — now`,
and promote it into the homepage hero panel. Every other entry gets a closed year
range and a neutral dot. `bun run validate` fails if two entries claim it.

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
  client/         theme toggle, CV spine + summary strip
  server.ts       the Cloud Run runtime; imports nothing
  dev.ts          watch + rebuild
scripts/          validate, pdf
infra/            Terraform
tests/            build output, server behaviour, print cascade
mockups/          the design explorations this was built from
```

`src/html.ts` escapes every interpolated value. Markup has to come through
`raw()`, which is why the only fields that can carry HTML are the `*_html` keys
in `site.yaml` — greppable, and few.

## Notes

`bun run check` reports a handful of `noDescendingSpecificity` warnings on the
stylesheets. They are cross-element false positives: the flagged pairs target
different elements and pseudo-elements, and the cascade was verified by measuring
rendered pixels in a real browser. Exit code is 0.
