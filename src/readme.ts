/**
 * A project's README, taken apart for the page at /<name>.
 *
 * GitHub is a README's first reader, so it carries things a page on this site
 * must not: a centred HTML header holding the logo, the tagline and a row of
 * shields.io badges — third-party images, which `img-src 'self'` refuses and
 * which the site's no-third-party-requests rule would refuse anyway — links
 * relative to the repository, and sections written for contributors. This
 * lifts the header into the masthead, drops what the page should not carry, and
 * renders the rest with Bun's own Markdown: no dependency, and build time only.
 *
 * Pure: README text in, HTML out. scripts/sync-docs.ts is what fetches it.
 */

export type ReadmeSection = {
  /** GitHub's anchor for the heading, so `#shell-completion` links still land. */
  id: string;
  title: string;
  html: string;
};

export type Readme = {
  /** The header's image, as a path in the repository. */
  logo?: { src: string; alt: string };
  /** The header's one-line description. Markup, but only ever `<code>`. */
  tagline: string;
  /** The first `$ command` transcript, lifted out for the masthead. */
  demo?: string;
  /** Everything before the first `##`. */
  intro: string;
  sections: ReadmeSection[];
  /** Rows in the Commands table; 0 when there is none. */
  commands: number;
};

export type ReadmeContext = {
  /** The page's path segment, which is also where its images are served. */
  name: string;
  /** https://github.com/<owner>/<repo> */
  repo: string;
  /** The release tag the README was read at; repository links point there. */
  tag: string;
  origin: string;
  /** `##` titles to leave out. */
  drop: string[];
  /** Release files with a short URL at /<name>/<file>. */
  releaseFiles: string[];
  /** Repository URL → page path, for sibling projects that have a page too. */
  siblings: Record<string, string>;
};

const FENCE = /^\s*(```|~~~)/;

/** Blank-line-separated blocks, with a fenced code block never split. */
function blocks(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) fenced = !fenced;
    if (!fenced && line.trim() === "" && current.length) {
      out.push(current.join("\n"));
      current = [];
    } else if (fenced || line.trim() !== "") {
      current.push(line);
    }
  }
  if (current.length) out.push(current.join("\n"));
  return out;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

/** Relative to the repository: not a URL, not rooted, not an anchor. */
const isRelative = (url: string) => !/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url);

/**
 * Every image the README names by a path in its own repository — what the
 * sync has to copy next to the page, since the page can load nothing else.
 */
export function localImages(markdown: string): string[] {
  const found = new Set<string>();
  for (const match of markdown.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) {
    found.add(match[1] as string);
  }
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    found.add(match[1] as string);
  }
  return [...found].filter(isRelative).filter((path) => !path.includes(".."));
}

/** GitHub's heading anchor: lower case, punctuation gone, spaces to hyphens. */
export function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .replace(/ /g, "-");
}

/**
 * The README's own HTML, kept to what a document needs. Our READMEs are ours,
 * but the CSP allows inline script for the theme snippet, so a stray `<script>`
 * or `onclick` in one would run — and a `style` attribute would silently do
 * nothing under `style-src 'self'`.
 */
function sanitize(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)\b[\s\S]*?(<\/\1>|\/>)/gi, "")
    .replace(/\s(on[a-z]+|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function rewrite(html: string, ctx: ReadmeContext): string {
  let out = sanitize(html)
    .replace(/<img\b([^>]*)>/g, (_tag, attrs: string) => {
      const fixed = attrs.replace(/\ssrc="([^"]+)"/, (whole, src: string) =>
        isRelative(src) ? ` src="/${ctx.name}/${src}"` : whole,
      );
      return `<img${fixed.replace(/\s*\/$/, "")} loading="lazy" decoding="async" />`;
    })
    .replace(/\shref="([^"]+)"/g, (whole, href: string) => {
      const sibling = ctx.siblings[href.replace(/\/$/, "")];
      if (sibling) return ` href="${sibling}"`;
      if (isRelative(href))
        return ` href="${ctx.repo}/blob/${ctx.tag}/${href}"`;
      return whole;
    })
    // A wide table scrolls in its own box rather than widening the page.
    .replace(/<table>/g, '<div class="table"><table>')
    .replace(/<\/table>/g, "</table></div>");

  // The long release URL, wherever the README spells it, becomes the short one
  // the server redirects — in prose and in code blocks alike.
  for (const file of ctx.releaseFiles) {
    out = out
      .split(`${ctx.repo}/releases/latest/download/${file}`)
      .join(`${ctx.origin}/${ctx.name}/${file}`);
  }
  return out;
}

function render(markdown: string, ctx: ReadmeContext): string {
  return rewrite(Bun.markdown.html(markdown, { headings: { ids: true } }), ctx);
}

/** The header: logo, title, tagline and badges, as consecutive HTML blocks. */
function header(parts: string[]): {
  logo?: Readme["logo"];
  tagline: string;
  rest: string[];
} {
  let logo: Readme["logo"];
  let tagline = "";
  let i = 0;
  for (
    ;
    i < parts.length && (parts[i] as string).trimStart().startsWith("<");
    i++
  ) {
    const block = parts[i] as string;
    const img = block.match(/<img\b[^>]*>/)?.[0];
    if (/^\s*<h1/i.test(block)) continue;
    if (img && !logo && !/<a\b/.test(block)) {
      const src = attr(img, "src");
      if (src && isRelative(src)) logo = { src, alt: attr(img, "alt") ?? "" };
      continue;
    }
    if (!img && !tagline) {
      tagline = block
        .replace(/<(?!\/?code>)[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }
  return { logo, tagline, rest: parts.slice(i) };
}

/** The first fenced block with no language that opens on a `$ ` prompt. */
function liftDemo(parts: string[]): { demo?: string; rest: string[] } {
  const at = parts.findIndex((block) => /^```\s*\n\$ /.test(block));
  if (at < 0) return { rest: parts };
  const demo = (parts[at] as string)
    .replace(/^```\s*\n/, "")
    .replace(/\n```\s*$/, "");
  return { demo, rest: parts.filter((_, i) => i !== at) };
}

function countRows(markdown: string): number {
  const rows = markdown.split("\n").filter((line) => /^\s*\|/.test(line));
  return Math.max(0, rows.length - 2);
}

export function parseReadme(markdown: string, ctx: ReadmeContext): Readme {
  const top = header(blocks(markdown.replace(/\r\n/g, "\n")));

  // Split the body at each `##`, which `blocks` has already kept apart from
  // anything fenced.
  const chunks: { title?: string; parts: string[] }[] = [{ parts: [] }];
  for (const block of top.rest) {
    const heading = block.match(/^## (.+)$/m);
    if (heading && !FENCE.test(block)) {
      const [before, after] = block.split(heading[0]) as [string, string];
      if (before.trim()) chunks.at(-1)?.parts.push(before);
      chunks.push({ title: (heading[1] as string).trim(), parts: [] });
      if (after.trim()) chunks.at(-1)?.parts.push(after);
    } else {
      chunks.at(-1)?.parts.push(block);
    }
  }

  const [intro, ...rest] = chunks as [(typeof chunks)[0], ...typeof chunks];
  const lifted = liftDemo(intro.parts);
  const kept = rest.filter((chunk) => !ctx.drop.includes(chunk.title ?? ""));
  const commands = kept.find((chunk) => chunk.title === "Commands");

  return {
    logo: top.logo,
    tagline: top.tagline,
    demo: lifted.demo,
    intro: render(lifted.rest.join("\n\n"), ctx),
    sections: kept.map((chunk) => ({
      id: slug(chunk.title ?? ""),
      title: chunk.title ?? "",
      html: render(chunk.parts.join("\n\n"), ctx),
    })),
    commands: commands ? countRows(commands.parts.join("\n")) : 0,
  };
}

/** For anything that needs the tagline as text: a title, a description. */
export function plainText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
