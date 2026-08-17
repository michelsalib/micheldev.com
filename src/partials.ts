/**
 * Shared chrome: document head, top bar, footer.
 */

import {
  type Content,
  LIVE_METRICS,
  type Locale,
  type Metric,
  metricValue,
  type Site,
  t,
} from "./content.ts";
import { html, type Renderable, raw } from "./html.ts";

export type Assets = { css: string; theme: string; cv: string; stats: string };

/**
 * The headline figures as tiles.
 *
 * Four of them, because the block is two tiles wide and a fifth would wrap to a
 * lonely third row. Rendered on the homepage beside the hero copy and on the CV
 * masthead plate; only the palette differs, and that is set in CSS.
 *
 * Which four is the caller's business, because the two pages are about
 * different things: the CV leads with the career (`cv.metrics`), the homepage
 * with the open source (`projects.metrics`).
 *
 * A tile whose derive key is in `LIVE_METRICS` is marked `data-stat`, which is
 * how src/client/stats.ts finds it to write the live figure over the rendered
 * one. The value here is never a placeholder — it is the real build-time figure,
 * so the tile is correct before the fetch, correct if the fetch fails, and
 * correct without JS at all.
 */
export function figureTiles(
  content: Content,
  locale: Locale,
  source: Metric[],
): Renderable {
  const metrics = source.slice(0, 4);
  return html`<ul class="tiles">
    ${metrics.map((metric, i) => {
      const live =
        metric.derive && LIVE_METRICS.has(metric.derive) ? metric.derive : "";
      const attr = live ? ` data-stat="${live}"` : "";
      return html`<li class="tile${raw(i === 0 ? " hue" : "")}">
        <span class="n"${raw(attr)}>${metricValue(metric, content)}</span
        ><span class="l">${t(metric.label, locale)}</span>
      </li>`;
    })}
  </ul>`;
}

/**
 * The portrait on the CV masthead — bleeding off the right of the plate, cut on
 * its upper-left by the same 45° as the plate itself, and running into the
 * corner notch.
 *
 * Two widths and no `<picture>`: the source is one square image and the only
 * variable is how many of its pixels the display wants. `sizes` mirrors the CSS
 * — capped at 520 under the breakpoint, `min(37vw, 450px)` above it.
 */
export const PORTRAIT_SIZES = "(max-width: 900px) 520px, min(37vw, 450px)";
export const PORTRAIT_SRCSET =
  "/assets/img/portrait-560.webp 560w, /assets/img/portrait-1040.webp 1040w";

export function portrait(alt: string): Renderable {
  return html`<div class="portrait">
    <img
      src="/assets/img/portrait-1040.webp"
      srcset="${PORTRAIT_SRCSET}"
      sizes="${PORTRAIT_SIZES}"
      width="1040"
      height="1040"
      alt="${alt}"
      fetchpriority="high"
      decoding="async"
    />
    <span class="tint" aria-hidden="true"></span>
    <span class="sink" aria-hidden="true"></span>
  </div>`;
}

/**
 * The theme-restore snippet. Deliberately inline and deliberately first: a
 * deferred script would paint the wrong theme before it ran.
 */
const THEME_RESTORE = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

const SUN = `<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>`;
const MOON = `<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`;

export function themeToggle() {
  return html`<button
    class="toggle"
    id="theme"
    type="button"
    aria-label="Switch colour theme"
  >
    ${raw(MOON)}${raw(SUN)}
  </button>`;
}

export type HeadOptions = {
  site: Site;
  assets: Assets;
  title: string;
  description: string;
  /** Path of this page, for the canonical URL. */
  path: string;
  locale: Locale;
  /** hreflang alternates, as locale → path. */
  alternates?: Partial<Record<Locale, string>>;
  /** Page-specific scripts, in addition to the theme toggle. */
  scripts?: string[];
  robots?: string;
  /**
   * Preloads the masthead portrait. /cv only — it is the largest paint on that
   * page, and without this the browser cannot discover it until the stylesheet
   * has arrived and laid the plate out.
   */
  preloadPortrait?: boolean;
};

export function documentHead(o: HeadOptions): Renderable {
  const url = `${o.site.origin}${o.path}`;
  return html`<!doctype html>
<html lang="${o.locale}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      ${raw(THEME_RESTORE)}
    </script>
    <title>${o.title}</title>
    <meta name="description" content="${o.description}" />
    <link rel="canonical" href="${url}" />
    ${o.robots ? html`<meta name="robots" content="${o.robots}" />` : ""}
    ${Object.entries(o.alternates ?? {}).map(
      ([loc, path]) =>
        html`<link
          rel="alternate"
          hreflang="${loc}"
          href="${o.site.origin}${path}"
        />`,
    )}
    <meta name="author" content="Michel Salib" />
    <meta name="theme-color" content="#fbfafd" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0d0b14" media="(prefers-color-scheme: dark)" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="${o.title}" />
    <meta property="og:description" content="${o.description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:site_name" content="micheldev.com" />
    <meta name="twitter:card" content="summary" />

    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/assets/favicon.svg" />

    <link
      rel="preload"
      href="/assets/fonts/ubuntu-sans.woff2"
      as="font"
      type="font/woff2"
      crossorigin="anonymous"
    />
    <link
      rel="preload"
      href="/assets/fonts/ubuntu-sans-mono.woff2"
      as="font"
      type="font/woff2"
      crossorigin="anonymous"
    />
    ${
      o.preloadPortrait
        ? html`<link
            rel="preload"
            href="/assets/img/portrait-1040.webp"
            as="image"
            type="image/webp"
            imagesrcset="${PORTRAIT_SRCSET}"
            imagesizes="${PORTRAIT_SIZES}"
            fetchpriority="high"
          />`
        : ""
    }
    <link rel="stylesheet" href="${o.assets.css}" />
    ${(o.scripts ?? []).map((src) => html`<script src="${src}" defer></script>`)}
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>`;
}

/**
 * @param live How many services are running, counted by `liveServices`. The
 * homepage passes it so the page's strongest fact is on screen before any
 * scroll; the 404 omits it, having nothing below to back the claim up.
 */
export function topBarHome(live?: number): Renderable {
  return html`<header class="bar">
    <div class="bar-in">
      <a class="wordmark" href="/"><b>micheldev</b><span>.com</span></a>
      <nav>
        <a href="#projects" class="nav-link hide-s"
          >projects${
            live ? html`<span class="live-n">${live} live</span>` : ""
          }</a
        >
        <a href="#elsewhere" class="nav-link hide-s">elsewhere</a>
        <a href="/cv" class="nav-link cv">cv&nbsp;&rarr;</a>
        ${themeToggle()}
      </nav>
    </div>
  </header>`;
}

export function topBarCv(locale: Locale, pdf: string): Renderable {
  return html`<header class="bar">
    <div class="bar-in">
      <a class="wordmark" href="/"
        ><span class="back">&larr;</span><b>micheldev</b><span>.com</span></a
      >
      <span class="here">/cv</span>
      <nav>
        <span class="lang-switch">
          <a href="/cv" ${raw(locale === "en" ? 'aria-current="true"' : "")}>EN</a>
          <a href="/cv/fr" ${raw(locale === "fr" ? 'aria-current="true"' : "")}
            >FR</a
          >
        </span>
        <a class="dl" href="${pdf}" download
          >&darr; <span class="t">PDF</span></a
        >
        ${themeToggle()}
      </nav>
    </div>
  </header>`;
}

const SOURCE_LABEL: Record<Locale, string> = {
  en: "Source on GitHub",
  fr: "Code source sur GitHub",
};

/**
 * Identical on every page.
 *
 * It used to take an `extra` slot so /cv could substitute its own note, which
 * meant the home and 404 footers advertised "michelsalib.com redirects here" —
 * a fact about DNS that no reader of a footer needs — while /cv advertised the
 * name of a YAML file. Both are now one link to the repository, which is the
 * only thing in that slot a visitor might actually want to open.
 */
export function footer(site: Site, locale: Locale = "en"): Renderable {
  return html`<footer>
      <div class="foot-in">
        <span>micheldev.com</span>
        <span>&middot;</span>
        <a href="${site.repo}">${SOURCE_LABEL[locale]}</a>
        <span class="sp">${site.footer.note}</span>
      </div>
    </footer>
  </body>
</html>`;
}
