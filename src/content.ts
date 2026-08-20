/**
 * Loads and types the YAML in `content/`.
 *
 * Translatable prose is a `{ en, fr }` map; anything factual is a bare value.
 * `t()` collapses either shape for a given locale, so templates never branch on
 * which form a field happens to use.
 */

import { parse } from "yaml";
import { formatCount } from "./format.ts";
import type { StatsSources } from "./stats.ts";

export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export type Text = string | Record<Locale, string>;
export type TextList = string[] | Record<Locale, string[]>;

/** Resolves a translatable value for one locale. */
export function t(value: Text | undefined, locale: Locale): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : (value[locale] ?? value.en);
}

/** Same, for lists. Missing entries collapse to empty rather than throwing. */
export function tl(value: TextList | undefined, locale: Locale): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value[locale] ?? value.en ?? [];
}

// ── cv.yaml ──────────────────────────────────────────────────────────────────

/** One chip in a project's `figures` row: a magnitude and what it measures. */
export type Figure = { label: Text; value: string | number };

/**
 * A masthead/hero figure. Either a literal `value`, or a `derive` key counted at
 * render time — see `metricValue`.
 */
export type MetricSource =
  | "years"
  | "employers"
  | "projects"
  | "live_services"
  | "stars"
  | "repos"
  | "oss_years"
  | "downloads";
export type Metric = { value?: string; derive?: MetricSource; label: Text };

/**
 * The derive keys that /stats.json can improve on.
 *
 * A tile built from one of these carries a `data-stat` attribute, which is the
 * only handle the client script has — so this set is what decides whether a
 * figure is live or fixed, and the CV's career metrics are absent from it on
 * purpose. See src/client/stats.ts.
 */
export const LIVE_METRICS = new Set<MetricSource>([
  "stars",
  "repos",
  "downloads",
]);

/**
 * Field order matches render order: name, lead, figures, points, extra, stack.
 *
 * `extra` is a second bullet list with its own lead-in sentence, nested rather
 * than two flat siblings. As `scale` + `points_extra` the pairing was invisible
 * and unenforceable, and four of six employers ended up with a lead-in and no
 * list after it — a colon pointing at nothing. Both keys are required together.
 */
export type Project = {
  name: Text;
  lead?: Text;
  figures?: Figure[];
  points?: TextList;
  extra?: { lead: Text; points: TextList };
  /**
   * The long version, in paragraphs, behind a fold — and absent from the PDF,
   * which the print stylesheet handles. A bullet says what was done; this is the
   * only field with room for how it went.
   */
  story?: TextList;
  stack?: string[];
};

export type Role = { title: Text; projects: Project[] };

/** `to: "present"` is the single switch that marks the current role. */
export type Employment = {
  employer: string;
  employer_full?: Text;
  from: number;
  to: number | "present";
  location?: string;
  hue?: string;
  context?: Text;
  open_source_prefix?: string;
  roles: Role[];
};

export type Cv = {
  person: {
    name: string;
    location?: Text;
    email?: string;
    phone?: string;
    links?: Record<string, string>;
  };
  privacy?: { page?: string[]; pdf?: string[] };
  headline: Text;
  summary: Text;
  experience: Employment[];
  education?: { institution: Text; year: number; award?: Text }[];
  skills?: { group: Text; items: string[] }[];
  skills_current?: { label?: Text; items: string[] };
  languages?: { name: Text; level: Text }[];
  interests?: TextList;
  metrics?: Metric[];
};

// ── site.yaml ────────────────────────────────────────────────────────────────

export type SectionConfig = {
  path: string;
  hue: string;
  note_html: string;
  heading: string;
  lede_html: string;
};

export type Site = {
  origin: string;
  repo: string;
  hosts: { canonical: string; redirect: string[] };
  meta: { title: string; description: string; locale: string };
  hero: { eyebrow: string; role_html: string; thesis_html: string };
  sections: Record<"projects" | "elsewhere", SectionConfig>;
  footer: { note: string };
};

// ── projects.yaml ────────────────────────────────────────────────────────────

/**
 * One running service under the apex.
 *
 * `host` is the bare label; the apex is added at render time from
 * `site.hosts.canonical`, so a domain move is one line in site.yaml rather than
 * six strings here. `what` is what the endpoint tracks — these are listed a row
 * each on the lead plate, and a host with nothing beside it is a URL, not a
 * service.
 */
export type Subdomain = { host: string; what: string };

export type ActiveProject = {
  name: string;
  url: string;
  repo?: string;
  live?: boolean;
  tags: string[];
  blurb: string;
  subdomains?: Subdomain[];
};

export type Projects = {
  /** Year of the first public repository. Only `oss_years` reads it. */
  since: number;
  /**
   * What the runtime counts, plus the floor the build renders until it answers.
   * `statsSources` turns this and `active` into dist/.stats-sources.json.
   */
  stats: Omit<StatsSources, "projects"> & { downloads_floor: number };
  /** The four hero tiles. */
  metrics: Metric[];
  active: ActiveProject[];
  archive: {
    heading: string;
    lede: string;
    total_repos: number;
    repos: { name: string; what: string; lang: string; stars: number }[];
  };
  links: { name: string; url: string; host: string; note: string }[];
};

// ── Loading ──────────────────────────────────────────────────────────────────

export type Content = { cv: Cv; site: Site; projects: Projects };

async function load<T>(path: string): Promise<T> {
  const text = await Bun.file(path).text();
  return parse(text) as T;
}

/**
 * Email and phone come from the environment, never from cv.yaml.
 *
 * The repository is public, so anything in content/ is public — and GitHub code
 * search indexes it, which is a well-known harvesting surface for exactly these
 * two fields. They are supplied as CV_EMAIL and CV_PHONE (repository secrets in
 * CI) and reach only the PDFs, which are built from the copies under .print/.
 *
 * cv.schema.json forbids both keys under `person`, so re-adding one to the YAML
 * fails validation rather than quietly publishing it.
 *
 * Unset is a supported state: the PDFs simply print without a contact line, so a
 * clone with no secrets still builds. CI has them, so the published PDFs do too.
 */
function withContact(cv: Cv): Cv {
  const email = process.env["CV_EMAIL"]?.trim();
  const phone = process.env["CV_PHONE"]?.trim();
  return {
    ...cv,
    person: {
      ...cv.person,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
  };
}

export async function loadContent(dir = "content"): Promise<Content> {
  const [cv, site, projects] = await Promise.all([
    load<Cv>(`${dir}/cv.yaml`),
    load<Site>(`${dir}/site.yaml`),
    load<Projects>(`${dir}/projects.yaml`),
  ]);
  return { cv: withContact(cv), site, projects };
}

// ── Derived helpers ──────────────────────────────────────────────────────────

export function isCurrent(job: Employment): boolean {
  return job.to === "present";
}

/** "2021 — 2025", or "2021 — now" for the current role. */
export function years(job: Employment, locale: Locale): string {
  const end =
    job.to === "present" ? (locale === "fr" ? "auj." : "now") : job.to;
  return `${job.from} — ${end}`;
}

/**
 * Maps a `hue: work-3` key onto the class that sets --hue.
 *
 * A class, not an inline style: the CSP blocks style attributes, which made every
 * accent fall back to --ink.
 */
export function hueClass(job: Employment, index: number): string {
  const n = job.hue?.match(/^work-(\d)$/)?.[1] ?? String(index + 1);
  return `hue-${n}`;
}

/** The same mapping as a var() reference, for contexts that need the value. */
export function hueVar(job: Employment, index: number): string {
  const n = job.hue?.match(/^work-(\d)$/)?.[1] ?? String(index + 1);
  return `var(--w${n})`;
}

/**
 * The repository slug a project's live figures come back under, or undefined for
 * one with no repository to measure.
 *
 * The slug, not the URL, because it is what both the GitHub API and the
 * `data-project` attribute on the card use — one identifier from `repo` rather
 * than a third field in the YAML that could disagree with it.
 */
export function repoSlug(project: ActiveProject): string | undefined {
  return project.repo?.split("/").filter(Boolean).pop();
}

/**
 * What /stats.json is told to count: the `stats` block, with the per-project
 * list built from `active` rather than written out a second time.
 *
 * Hostnames are qualified here for the same reason they are at render time —
 * the YAML keeps bare labels so a domain move stays one line in site.yaml.
 */
export function statsSources(content: Content): StatsSources {
  const { projects, site } = content;
  const { downloads_floor: _floor, ...sources } = projects.stats;

  return {
    ...sources,
    projects: projects.active.flatMap((project) => {
      const repo = repoSlug(project);
      if (!repo) return [];
      const hosts = (project.subdomains ?? []).map(
        (service) => `${service.host}.${site.hosts.canonical}`,
      );
      return [{ repo, hosts }];
    }),
  };
}

/** Total stars across the archive, so the figure on the page is never stale. */
export function totalStars(projects: Projects): number {
  return projects.archive.repos.reduce((sum, r) => sum + r.stars, 0);
}

/** Years since the earliest `from`. Rolls over on 1 January by itself. */
export function careerYears(cv: Cv): number {
  return (
    new Date().getFullYear() - Math.min(...cv.experience.map((j) => j.from))
  );
}

/** Every project across every role, in file order. */
export function allProjects(cv: Cv): Project[] {
  return cv.experience.flatMap((job) => job.roles.flatMap((r) => r.projects));
}

/** Live services under this domain. A project with subdomains counts as each. */
export function liveServices(projects: Projects): number {
  return projects.active
    .filter((p) => p.live)
    .reduce((sum, p) => sum + (p.subdomains?.length ?? 1), 0);
}

// ── Figures quoted in prose ──────────────────────────────────────────────────

/**
 * A figure named inside authored copy: `{stars}` in a lede, in a link note or in
 * the meta description resolves to the number the tiles carry.
 *
 * Why it exists: those numbers used to be typed out. The page read
 * "50 repos · 510 stars" in three places while the tile beside them fetched 51
 * and 541 from GitHub — the one thing content/ is supposed to make impossible.
 * A brace is a quotation of a figure rather than a copy of it.
 *
 * The key is a `derive` key, so the set of things quotable in a sentence and the
 * set of things a tile can show are the same set, by construction.
 */
const QUOTED_FIGURE = /\{([a-z_]+)\}/g;

/** Copy, split into its literal runs and the figures quoted between them. */
export type CopyPart = string | { figure: MetricSource; value: string };

export function splitFigures(text: string, content: Content): CopyPart[] {
  const parts: CopyPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(QUOTED_FIGURE)) {
    const at = match.index ?? 0;
    const key = match[1] as MetricSource;
    const value = metricValue({ derive: key, label: "" }, content);
    // Not a derive key — some other author's braces. Left exactly as written.
    if (!value) continue;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push({ figure: key, value });
    cursor = at + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * The same substitution, flattened to a string — for a `<meta>` tag or an
 * attribute, where there is nowhere to hang the live span.
 */
export function resolveFigures(text: string, content: Content): string {
  return splitFigures(text, content)
    .map((part) => (typeof part === "string" ? part : part.value))
    .join("");
}

/**
 * The figure to print for one metric.
 *
 * `15 years shipping` used to be the literal string "15", which was correct on
 * the day it was written and silently wrong every 1 January after. Anything
 * countable from content/ is now counted here instead — same reasoning as
 * `totalStars`. Only figures that genuinely cannot be derived (peak throughput,
 * team sizes, outage counts) stay as literals in the YAML.
 */
export function metricValue(metric: Metric, content: Content): string {
  if (metric.value !== undefined) return metric.value;
  switch (metric.derive) {
    case "years":
      return String(careerYears(content.cv));
    case "employers":
      return String(content.cv.experience.length);
    case "projects":
      return String(allProjects(content.cv).length);
    case "live_services":
      return String(liveServices(content.projects));
    case "stars":
      return String(totalStars(content.projects));
    case "repos":
      return String(content.projects.archive.total_repos);
    case "oss_years":
      return String(new Date().getFullYear() - content.projects.since);
    // Not countable from content/ — nothing here knows what npm and Packagist
    // have served. The floor stands in until /stats.json replaces it in the
    // browser, and is formatted by the same function the client uses so the
    // figure does not change shape when it changes source.
    case "downloads":
      return formatCount(content.projects.stats.downloads_floor);
    default:
      return "";
  }
}
