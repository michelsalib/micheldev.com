/**
 * Builds the static site into dist/.
 *
 * Everything is content-addressed: CSS and JS filenames carry a hash of their
 * bytes, so they can be served immutable for a year and a deploy can never hand
 * a browser a stale stylesheet. HTML itself is never cached for long.
 */

import { cp, mkdir, rm } from "node:fs/promises";
import {
  type Content,
  LOCALES,
  type Locale,
  loadContent,
  statsSources,
} from "./content.ts";
import { cvPage } from "./pages/cv.ts";
import { homePage } from "./pages/home.ts";
import { notFoundPage } from "./pages/not-found.ts";
import { ogCard } from "./pages/og.ts";
import type { Assets } from "./partials.ts";

const OUT = "dist";

/**
 * Where the copies that headless Chrome prints from are written — deliberately
 * NOT inside dist/.
 *
 * These two files are the only ones that contain the email and phone. dist/ is
 * what the Dockerfile copies and Cloud Run serves, so anything in it is public;
 * keeping the print copies outside it means the contact details cannot reach the
 * origin by accident. Gitignored, and excluded by .dockerignore.
 */
const PRINT_OUT = ".print";

/** Concatenated verbatim — it carries url() paths the bundler cannot resolve. */
const FONT_CSS = "src/styles/00-fonts.css";

const SHARED_CSS = ["src/styles/01-tokens.css", "src/styles/02-base.css"];

/**
 * One stylesheet per page, rather than one for the site.
 *
 * The page sheets both style a bare `.tl` and the CV styles a bare `.lang`, so
 * concatenating them let the CV's rail geometry override the homepage's and put a
 * pill border around the archive table's language column. Splitting removes that
 * whole class of bug by construction: page rules never coexist. It costs the
 * shared tokens and base twice, which is a few KB behind an immutable cache.
 */
const PAGE_CSS = {
  home: [...SHARED_CSS, "src/styles/03-home.css"],
  cv: [...SHARED_CSS, "src/styles/04-cv.css"],
} as const;

/** Short, stable, content-addressed suffix. */
function fingerprint(content: string | Uint8Array): string {
  return Bun.hash(content).toString(36).slice(0, 8);
}

async function write(path: string, content: string | Uint8Array) {
  await Bun.write(`${OUT}/${path}`, content);
  return path;
}

/** Concatenates one page's stylesheets, minifies, and emits a hashed file. */
async function buildCss(label: keyof typeof PAGE_CSS): Promise<string> {
  const parts = await Promise.all(
    PAGE_CSS[label].map((file) => Bun.file(file).text()),
  );

  // Bun's CSS minifier is used through a temp entrypoint so the four sheets stay
  // separate and readable in source. Verified it preserves the theme guards
  // (`:root:not([data-theme="light"])`) and custom-property fallbacks.
  const tmp = `${OUT}/.${label}.css`;
  await Bun.write(tmp, parts.join("\n"));

  const result = await Bun.build({
    entrypoints: [tmp],
    minify: true,
    // Not in @types/bun yet, though Bun 1.3 supports it. Verified by hand that
    // it preserves the theme guards and custom-property fallbacks.
    experimentalCss: true,
  } as Bun.BuildConfig & { experimentalCss: boolean });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    throw new Error("CSS build failed");
  }

  const minified = await (result.outputs[0] as Bun.BuildArtifact).text();
  await rm(tmp, { force: true });

  // @font-face goes on the front, unbundled: its url() paths only resolve once
  // dist/ exists, and the bundler would try to read them at build time.
  const fonts = await Bun.file(FONT_CSS).text();
  const css = `${fonts}\n${minified}`;

  const name = `assets/${label}.${fingerprint(css)}.css`;
  await write(name, css);
  return `/${name}`;
}

/** Bundles and minifies one client entrypoint, returning its hashed href. */
async function buildScript(entry: string, label: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    minify: true,
    format: "esm",
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Failed to bundle ${entry}`);
  }

  const output = result.outputs[0];
  if (!output) throw new Error(`No output for ${entry}`);

  const code = await output.text();
  const name = `assets/${label}.${fingerprint(code)}.js`;
  await write(name, code);
  return `/${name}`;
}

/**
 * A unicorn, because that is his avatar and the site should look like him in a
 * browser tab. An SVG with the emoji as text keeps it to a few bytes and stays
 * sharp at any size.
 */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="88">🦄</text></svg>`;

// No build-time compression: Cloudflare sits in front and compresses at the
// edge, so precompressed .br/.gz variants next to every file would be dead
// weight the origin never serves.

function sitemap(site: Content["site"], paths: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths
    .map(
      (path) =>
        `  <url>\n    <loc>${site.origin}${path}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`,
    )
    .join("\n");
  // sitemaps.org, not w3.org. The wrong namespace was a plausible-looking
  // invention, and a sitemap in it is not a sitemap: Search Console rejects the
  // document rather than reading the URLs inside it, so all three pages were
  // being discovered by luck.
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/**
 * The section paths, mapped to the anchors they actually are.
 *
 * The rails label the homepage sections `/projects` and `/elsewhere`, in mono,
 * which reads as a route — so people typed them, and got the 404. They are one
 * page and always were, so the labels stay and the paths resolve.
 *
 * Emitted for the server rather than written into it, on the same grounds as
 * .hosts.json: the paths live in site.yaml, and the runtime has no YAML parser.
 */
function sectionRedirects(site: Content["site"]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(site.sections).map(([id, section]) => [
      section.path,
      `/#${id}`,
    ]),
  );
}

export async function build(): Promise<{ files: string[]; assets: Assets }> {
  await rm(OUT, { recursive: true, force: true });
  await rm(PRINT_OUT, { recursive: true, force: true });
  await mkdir(`${OUT}/assets/fonts`, { recursive: true });
  await mkdir(`${OUT}/assets/img`, { recursive: true });

  const content = await loadContent();
  const { site } = content;

  const [cssHome, cssCv, theme, cv, stats] = await Promise.all([
    buildCss("home"),
    buildCss("cv"),
    buildScript("src/client/theme.ts", "theme"),
    buildScript("src/client/cv.ts", "cv"),
    buildScript("src/client/stats.ts", "stats"),
  ]);

  // Same scripts, different stylesheet: each page links only its own.
  const homeAssets: Assets = { css: cssHome, theme, cv, stats };
  const cvAssets: Assets = { css: cssCv, theme, cv, stats };

  // Fonts are already subset and hashed by content only in the sense that they
  // never change; keep the readable names and rely on immutable caching.
  await cp("src/fonts", `${OUT}/assets/fonts`, { recursive: true });

  // The hero portrait, at the two widths the layout can ask for. Copied rather
  // than generated: there is no image tooling in this repo and adding an
  // encoder to build a file that changes once every few years is not a trade
  // worth making. Both are already re-encoded, resized and stripped of EXIF.
  await cp("src/images", `${OUT}/assets/img`, { recursive: true });

  const pdfHref = (locale: Locale) => `/michel-salib-cv-${locale}.pdf`;

  const files = [
    await write("index.html", homePage(content, homeAssets)),
    await write(
      "cv/index.html",
      cvPage(content, cvAssets, "en", pdfHref("en")),
    ),
    await write(
      "cv/fr/index.html",
      cvPage(content, cvAssets, "fr", pdfHref("fr")),
    ),
    await write("404.html", notFoundPage(content, homeAssets)),
    await write("assets/favicon.svg", FAVICON),
    // Read by the server at boot. Dot-prefixed so it is never served, which the
    // server enforces by refusing any path segment starting with a dot.
    await write(".hosts.json", JSON.stringify(site.hosts)),
    await write(".redirects.json", JSON.stringify(sectionRedirects(site))),
    // Same arrangement, for the same reason: /stats.json needs to know what to
    // count, that belongs in content/ with everything else, and the runtime
    // image has no YAML parser to read it with.
    await write(".stats-sources.json", JSON.stringify(statsSources(content))),
    await write("sitemap.xml", sitemap(site, ["/", "/cv", "/cv/fr"])),
    await write(
      "robots.txt",
      `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`,
    ),
    cssHome,
    cssCv,
    theme,
    cv,
  ];

  // The print copies: identical markup plus the contact line, written outside
  // dist/ so they are never served or containerised. scripts/pdf.ts points Chrome
  // at these, and resolves every asset from dist/ as normal.
  for (const locale of LOCALES) {
    await Bun.write(
      `${PRINT_OUT}/cv${locale === "en" ? "" : "/fr"}/index.html`,
      cvPage(content, cvAssets, locale, pdfHref(locale), true),
    );
  }

  // The link-preview card, in the same place and for a related reason: it is a
  // page only so that Chrome can photograph it. scripts/pdf.ts screenshots this
  // into dist/assets/img/og.png, which is the only form of it anything serves.
  await Bun.write(`${PRINT_OUT}/og/index.html`, ogCard(content));

  return { files, assets: homeAssets };
}

if (import.meta.main) {
  const started = Bun.nanoseconds();
  const { files } = await build();
  const ms = ((Bun.nanoseconds() - started) / 1e6).toFixed(0);

  console.log(`built ${files.length} entries into ${OUT}/ in ${ms}ms`);
  for (const locale of LOCALES) {
    console.log(`  /cv${locale === "en" ? "" : "/fr"}`);
  }
}
