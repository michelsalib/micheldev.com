# micheldev.com — brief

Decisions locked in the 2026-08-11 scoping session. Anything not listed here is
still open.

## Purpose

A **hub / index of me**: the page someone lands on after googling "Michel
Salib", giving them the whole map — projects, career, links — in one screen and
a bit. Not a freelance funnel, not a blog.

## Domains

- **`micheldev.com` is canonical.** It is already the verified apex in Search
  Console for the project subdomains (`notion-tmdb.micheldev.com` and five
  siblings), so the homepage is genuinely the index of a running system.
- **`michelsalib.com` 301-redirects** to it. One site, one canonical URL, no
  duplicated content, no split SEO.

## Content

Three sections, one hue each:

| Section      | Hue     | Contains                                                     |
| ------------ | ------- | ------------------------------------------------------------ |
| `/work`      | violet  | Career timeline — LSE, Refinitiv, Thomson Reuters, Best Comparator, ECE. Summary only; detail lives on `/cv` |
| `/projects`  | magenta | The six live services, current repos, and the starred Symfony2-era archive |
| `/elsewhere` | cyan    | CV, GitHub, LinkedIn, connectors, Notion roadmap, about.me    |

Career leads, projects follow. The CV showed the professional record is much
stronger than the side projects — 150k+ monthly users, 20 developers led,
10M+ API requests/day — so the hero states that and the connectors sit in
`/projects` where they belong.

- **No writing/blog section.** Explicitly cut: maintenance appetite is "edit a
  data file a few times a year", and an empty blog reads worse than no blog.
- **No availability or "open to work" signal.** It is the most stale-prone
  element on a site like this.
- **Contact is the CV only.** No form (a backend that can silently break), no
  exposed mailto.

## Language

- Site: **English only**.
- CV: **English and French variants**, both generated from the same data.

## CV

`content/cv.yaml` is the single source of truth, rendered three ways:

1. `/cv` — a real HTML page, **crawlable**, with the timeline spine filling as
   you scroll.
2. `/cv-en.pdf` and `/cv-fr.pdf` — generated in CI by headless Chrome against
   the page's `@media print` stylesheet, so the PDF can never drift from the page.
3. The `/work` timeline on the homepage.

Workflow is YAML edit → commit → push. This retires the Canva link and its
lock-in.

### Where the content came from

Extracted from `CV - English.pdf` (exported from Canva) on 2026-08-11. Four
values were misread from a low-resolution Canva render before the PDF arrived
and are now corrected in `cv.yaml`: LSE ran to **2025** (not 2026), News reached
**150k+** monthly users (not 100k+), the C++ team moved to **JavaScript** (not
TypeScript), and ECE lists **215,000 alumni**.

The `BCC` prefix on the Symfony bundles is **Best Comparator** — Michel's own
2011–2013 company. The open-source work and the founder-CTO role are one chapter,
and the site says so.

### Contact and privacy

The page is crawlable, so email and phone are **PDF-only** — see the `privacy`
key in `cv.yaml`, which lists the fields each output is allowed to render. The
site's only contact route is the CV, by design.

## Tech

| Concern    | Decision                                                          |
| ---------- | ----------------------------------------------------------------- |
| Front end  | Hand-written HTML + CSS. **No React, no MUI**, ~10 lines of JS for the theme toggle |
| Motion     | CSS scroll-driven animations (`animation-timeline: view()`), zero JS, `@supports`-guarded, `prefers-reduced-motion` respected |
| Fonts      | Ubuntu Sans + Ubuntu Sans Mono, variable, self-hosted, subset to latin (61 KB + 28 KB woff2). Ubuntu Font Licence permits embedding |
| Hosting    | **Cloud Run, `us-central1`**, apex domain mapping — same pattern as `notion-tmdb` |
| Infra      | Terraform in `infra/`, own GCP project, GCS state bucket           |
| CI/CD      | GitHub Actions → Workload Identity Federation → Cloud Run          |
| Tooling    | Bun, Biome (2-space, 80 cols), matching `notion-tmdb`              |
| Analytics  | **None.** No trackers, no third-party scripts, no cookie banner    |
| Cost       | Effectively €0 — `min_instance_count = 0`, `cpu_idle = true`       |

### The CDN question, resolved

**Cloudflare sits in front of Cloud Run.** That retires the objection raised
earlier in this brief: the argument against `us-central1` was that Cloud Run
domain mappings have no CDN, so a Paris visitor pays ~110 ms RTT per asset. With
Cloudflare caching at a Paris PoP that only applies to cache misses, and cold
starts only reach the first visitor per PoP.

Consequences for the build:

- **No build-time compression.** Cloudflare compresses at the edge, so shipping
  `.br`/`.gz` beside every file would be dead weight the origin never serves.
- **Cache headers matter more, not less** — they are what Cloudflare obeys.
  Hashed assets are `immutable` for a year; HTML is `must-revalidate`.
- DNS lives at Cloudflare, proxied, pointing at Google's `ghs` addresses, SSL
  mode **Full (strict)**. The Cloud Run domain mappings are still required —
  `*.run.app` only answers to its own hostname.

A GCS bucket was considered and rejected: a bucket alone **cannot serve HTTPS on
a custom domain**, and the load balancer that fixes that costs ~€18/month for the
forwarding rule alone. Firebase Hosting would have been free and fast but breaks
the one-deploy-pattern rule.

## Anti-goals

- No heavy JS framework.
- No trackers or analytics.
- No self-promotional cringe: no "passionate about clean code", no skill-rating
  bars, no "Hire me!", no invented testimonials.

Motion was **not** forbidden — restrained, purposeful scroll animation is in
scope.

## Design direction

Editorial minimal with colourful flair. Violet-biased inky neutrals; the three
section hues form an analogous violet → magenta → cyan sweep (a nod to the 🦄,
deployed as hairlines, labels and hover states only — never fills, never
gradients). Dark and light, following the OS with a manual toggle.

## Design direction, resolved

Mockup **C** is the agreed hybrid: mockup A's layout and scroll motion, mockup
B's type treatment (Ubuntu Sans at normal width, weight 700, a restrained scale
— no condensed compression, no 128px display type).

Mockups, all published as artifacts:

| | Layout | Status |
| --- | --- | --- |
| A | Editorial index, condensed display type, domain-tree hero | superseded |
| B | Single measure, marginalia, no cards | superseded, but its type won |
| **C** | **Hybrid — A's layout, B's type, career-summary hero** | **agreed** |
| **D** | **`/cv` page — YAML-driven, scroll-filling timeline, print stylesheet** | **for review** |

## The current-role switch

Set `to: present` on any `experience` entry. That is the only edit needed — the
renderer then labels it "Currently", gives it the green *live* dot, prints
"2026 — now", and promotes it into the homepage hero panel. Every other entry
gets a closed year range and a hue dot rather than a live one.

Until such an entry exists, the hero panel reads **"Most recent · 2021 — 2025"**
with a violet dot, because LSE ended in 2025 and a live dot would claim something
the data does not support.

## Schema validation

`content/cv.schema.json` describes the data file, and `cv.yaml` points at it with
a `# yaml-language-server: $schema=` directive on line 1. That gives autocomplete
and validation while editing, and it immediately earned its keep: it caught a
line where an unquoted `: ` had turned a list item into a YAML map. CI should run
the same check before building.

## Still needed from Michel

1. **Two discrepancies between the EN and FR CVs.** Search `DISCREPANCY` in
   `cv.yaml`:
   - News Web Services team size — EN says **8** developers, FR says **9**.
     Currently using 8.
   - ECE tutoring range — EN says **L2 to M1**, FR says **L2 to M2**. Currently
     using M2.
2. **Your FR CV has untranslated English in it.** Three bullets under Top News,
   and "Technology sold to media group" under Best Comparator, are still English
   on the French PDF. I wrote proper French for them in `cv.yaml` — marked
   `FR-WAS-ENGLISH` — so a read-through of just those four lines is worth it.
3. **`Paris 13` vs `Paris, France`.** Your FR CV localises to the 13th
   arrondissement, the EN one does not. Encoded as-is; say if you want them the same.
4. **The 2025 → now gap.** Filling it is the `to: present` switch above.
