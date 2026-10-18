import { beforeAll, describe, expect, test } from "bun:test";
import { build } from "../src/build.ts";
import { loadContent, pageProjects } from "../src/content.ts";
import {
  localImages,
  parseReadme,
  type ReadmeContext,
  slug,
} from "../src/readme.ts";
import { handle } from "../src/server.ts";

// A README shaped like nethound's and envhound's: a centred HTML header with a
// logo, a tagline and badges, then Markdown. Written here rather than read from
// content/docs, so a new release of either tool cannot change what is asserted.
const README = `<p align="center">
  <img src="assets/logo.svg" width="128" height="128" alt="tool logo">
</p>

<h1 align="center">tool</h1>

<p align="center">Find which file sets each variable, audit your <code>PATH</code>, and fix it.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@me/tool"><img src="https://img.shields.io/npm/v/@me/tool" alt="npm"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@me/tool" alt="MIT"></a>
</p>

Why is it set twice? tool answers that.

<p align="center">
  <img src="docs/demo.gif" width="860" alt="a demo" onload="alert(1)" style="border:0">
</p>

\`\`\`sh
npx @me/tool
\`\`\`

\`\`\`
$ tool blame PATH
(initial)  +/usr/bin
\`\`\`

## Install

\`\`\`sh
curl -fsSL https://github.com/me/tool/releases/latest/download/install.sh | sh
\`\`\`

See [Shell completion](#shell-completion) and [SECURITY.md](SECURITY.md#verifying).

<script>alert(1)</script>

## Commands

| Command | What it shows |
|---|---|
| \`tool\` | everything |
| \`tool blame VAR\` | who set it |

\`\`\`sh
# ## not a heading, inside a fence
\`\`\`

## Shell completion

Press <kbd>Tab</kbd>.

## The pack

| Tool | What |
|---|---|
| **[sibling](https://github.com/me/sibling)** | the other one |

## Development

\`\`\`sh
bun test
\`\`\`
`;

const CTX: ReadmeContext = {
  name: "tool",
  repo: "https://github.com/me/tool",
  tag: "v1.2.3",
  origin: "https://micheldev.com",
  drop: ["Development"],
  releaseFiles: ["install.sh"],
  siblings: { "https://github.com/me/sibling": "/sibling" },
};

const readme = parseReadme(README, CTX);
const body = readme.intro + readme.sections.map((s) => s.html).join("");

describe("a README, taken apart for its page", () => {
  test("the header's logo and tagline go to the masthead", () => {
    expect(readme.logo).toEqual({ src: "assets/logo.svg", alt: "tool logo" });
    expect(readme.tagline).toBe(
      "Find which file sets each variable, audit your <code>PATH</code>, and fix it.",
    );
  });

  test("the badges are gone: third-party images the CSP would refuse", () => {
    expect(body).not.toContain("shields.io");
    expect(body).not.toMatch(/<img[^>]+src="https?:/);
  });

  test("the first transcript is lifted out for the masthead, once", () => {
    expect(readme.demo).toBe("$ tool blame PATH\n(initial)  +/usr/bin");
    expect(body).not.toContain("tool blame PATH");
  });

  test("sections split at ##, never at a ## inside a code block", () => {
    expect(readme.sections.map((s) => s.title)).toEqual([
      "Install",
      "Commands",
      "Shell completion",
      "The pack",
    ]);
    expect(body).toContain("# ## not a heading, inside a fence");
  });

  test("a dropped section is not rendered at all", () => {
    expect(body).not.toContain("bun test");
  });

  test("section ids are GitHub's anchors, so the README's own links land", () => {
    expect(readme.sections.map((s) => s.id)).toContain("shell-completion");
    expect(body).toContain('href="#shell-completion"');
    expect(slug("How it works")).toBe("how-it-works");
    expect(slug("The `--json` flag!")).toBe("the---json-flag");
  });

  test("repository links point at the release the page documents", () => {
    expect(body).toContain(
      'href="https://github.com/me/tool/blob/v1.2.3/SECURITY.md#verifying"',
    );
  });

  test("a sibling with a page of its own is linked there, not to GitHub", () => {
    expect(body).toContain('href="/sibling"');
  });

  test("its images are served beside the page", () => {
    expect(body).toContain('src="/tool/docs/demo.gif"');
    expect(localImages(README)).toEqual(["assets/logo.svg", "docs/demo.gif"]);
  });

  test("the long install URL becomes the short one the server redirects", () => {
    expect(body).toContain("https://micheldev.com/tool/install.sh");
    expect(body).not.toContain("releases/latest/download");
  });

  test("script, handlers and style attributes do not survive", () => {
    expect(body).not.toContain("<script");
    expect(body).not.toContain("onload");
    expect(body).not.toMatch(/\sstyle=/);
  });

  test("tables scroll in their own box, and the Commands rows are counted", () => {
    expect(body).toContain('<div class="table"><table>');
    expect(readme.commands).toBe(2);
  });
});

describe("the built project pages", () => {
  const pages: { name: string; html: string }[] = [];

  beforeAll(async () => {
    await build();
    for (const project of pageProjects((await loadContent()).projects)) {
      pages.push({
        name: project.name,
        html: await Bun.file(`dist/${project.name}/index.html`).text(),
      });
    }
  });

  test("every project with a page gets one", () => {
    expect(pages.map((page) => page.name).sort()).toEqual([
      "envhound",
      "nethound",
    ]);
  });

  test("they are in the sitemap", async () => {
    const sitemap = await Bun.file("dist/sitemap.xml").text();
    for (const { name } of pages) {
      expect(sitemap).toContain(`<loc>https://micheldev.com/${name}</loc>`);
    }
  });

  test("every image they show is served from this origin, and exists", async () => {
    for (const { html } of pages) {
      const sources = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map(
        (match) => match[1] as string,
      );
      expect(sources.length).toBeGreaterThan(0);
      for (const src of sources) {
        expect(src.startsWith("/")).toBe(true);
        expect(await Bun.file(`dist${src}`).exists()).toBe(true);
      }
    }
  });

  test("every in-page link has somewhere to land", () => {
    for (const { html } of pages) {
      const ids = new Set(
        [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
      );
      for (const [, anchor] of html.matchAll(/href="#([^"]+)"/g)) {
        expect(ids.has(anchor)).toBe(true);
      }
    }
  });

  test("no inline style attributes, which the CSP would void", () => {
    for (const { html } of pages) expect(html).not.toMatch(/\sstyle="/);
  });

  test("the install box lists every method without JS, and no dead buttons", () => {
    for (const { html } of pages) {
      expect(html).toContain('role="tablist" aria-label="Install with" hidden');
      expect(html).not.toContain('class="copy"');
      expect(html).toContain("https://micheldev.com/");
    }
  });

  test("the release line carries the handle the live figures fill", () => {
    for (const { name, html } of pages) {
      expect(html).toContain(`data-project="${name}"`);
    }
  });

  test("the homepage links each one here, with an arrow that stays on site", async () => {
    const home = await Bun.file("dist/index.html").text();
    for (const { name } of pages) {
      expect(home).toMatch(
        new RegExp(
          `href="/${name}"[^>]*>\\s*<span class="h">${name} <span class="ext">&rarr;`,
        ),
      );
    }
  });
});

describe("the short install URLs", () => {
  const get = (path: string) =>
    handle(
      new Request(`https://micheldev.com${path}`, {
        headers: { host: "micheldev.com" },
      }),
    );

  beforeAll(async () => {
    await build();
  });

  test.each([
    ["/nethound/install.sh", "nethound", "install.sh"],
    ["/nethound/install.ps1", "nethound", "install.ps1"],
    ["/envhound/install.sh", "envhound", "install.sh"],
    ["/envhound/install.ps1", "envhound", "install.ps1"],
  ])("%s 302s to the latest release", async (path, repo, file) => {
    const response = await get(path);
    // Not a 301: "latest" moves with every release, and a cached permanent
    // redirect would keep handing out the old one.
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://github.com/michelsalib/${repo}/releases/latest/download/${file}`,
    );
  });

  test("the page itself is served, and the section redirects still 301", async () => {
    expect((await get("/nethound")).status).toBe(200);
    expect((await get("/projects")).status).toBe(301);
  });
});
