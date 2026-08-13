/**
 * Shared chrome: document head, top bar, footer.
 */

import type { Locale, Site } from "./content.ts";
import { html, type Renderable, raw } from "./html.ts";

export type Assets = { css: string; theme: string; cv: string };

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
    <link rel="stylesheet" href="${o.assets.css}" />
    ${(o.scripts ?? []).map((src) => html`<script src="${src}" defer></script>`)}
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>`;
}

export function topBarHome(): Renderable {
  return html`<header class="bar">
    <div class="bar-in">
      <a class="wordmark" href="/"><b>micheldev</b><span>.com</span></a>
      <nav>
        <a href="#projects" class="nav-link hide-s">projects</a>
        <a href="#work" class="nav-link hide-s">work</a>
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
