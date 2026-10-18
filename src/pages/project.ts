/**
 * A project's own page, at /<name>: its README, in the site's design.
 *
 * The masthead is the plate both other pages open on, carrying what the README's
 * GitHub header carried — logo, name, tagline — plus the install box and the
 * README's first transcript where the other pages put a picture. Below it, the
 * README itself, section by section, with a contents rail.
 *
 * Everything here comes from the README at the latest release's tag (see
 * src/readme.ts and scripts/sync-docs.ts) or from the project's entry in
 * projects.yaml. Nothing about the tool is written in this file.
 */

import type {
  ActiveProject,
  Content,
  DocsRelease,
  ProjectPage,
} from "../content.ts";
import { html, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  footer,
  topBarProject,
} from "../partials.ts";
import { plainText, type Readme } from "../readme.ts";

export type ProjectDocs = { readme: Readme; release: DocsRelease };

type PageProject = ActiveProject & { page: ProjectPage; repo: string };

/**
 * "18 Oct 2026". Fixed at build time, so a date rather than "3 days ago" — the
 * client replaces it with that, live, once /stats.json answers.
 */
function released(iso: string, parts: "full" | "day" = "full"): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(parts === "full" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * The install box. Without JS every method is listed, one under the other;
 * src/client/project.ts turns the list into tabs and adds the copy buttons, so
 * nothing on the page is a control that does nothing.
 */
function installBox(project: PageProject, origin: string): Renderable {
  const methods = project.page.install;
  return html`<div class="install" data-install>
    <div class="tabs" role="tablist" aria-label="Install with" hidden>
      ${methods.map(
        (method, i) =>
          html`<button
            type="button"
            role="tab"
            id="install-tab-${i}"
            aria-controls="install-${i}"
            aria-selected="${i === 0 ? "true" : "false"}"
          >
            ${method.label}
          </button>`,
      )}
    </div>
    ${methods.map(
      (method, i) =>
        html`<div
          class="method"
          role="tabpanel"
          id="install-${i}"
          aria-labelledby="install-tab-${i}"
        >
          <p class="label">${method.label}</p>
          <pre><code>${method.cmd.replaceAll("{origin}", origin)}</code></pre>
          <p class="note">${method.note}</p>
        </div>`,
    )}
  </div>`;
}

/** Two or three tiles, each a fact the release or the README states. */
function tiles(readme: Readme, release: DocsRelease): Renderable {
  const facts: [string, string][] = [
    [release.tag, "latest release"],
    [
      released(release.published_at, "day"),
      `released ${release.published_at.slice(0, 4)}`,
    ],
  ];
  if (readme.commands) facts.push([String(readme.commands), "commands"]);
  return html`<ul class="tiles">
    ${facts.map(
      ([n, l], i) =>
        html`<li class="tile${raw(i === 0 ? " hue" : "")}">
          <span class="n">${n}</span><span class="l">${l}</span>
        </li>`,
    )}
  </ul>`;
}

export function projectPage(
  content: Content,
  assets: Assets,
  project: PageProject,
  docs: ProjectDocs,
): string {
  const { site } = content;
  const { readme, release } = docs;
  const repoName = project.repo.replace(/\/$/, "").split("/").pop() ?? "";
  const toc = [
    { id: "overview", title: "Overview" },
    ...readme.sections.map(({ id, title }) => ({ id, title })),
  ];
  const navLinks = ["install", "commands"]
    .filter((id) => readme.sections.some((section) => section.id === id))
    .map((id) => ({ href: `#${id}`, label: id }));
  const [prompt, ...output] = (readme.demo ?? "").split("\n");

  return String(
    html`${documentHead({
      site,
      assets,
      title: `${project.name} — ${plainText(readme.tagline)}`,
      description: project.blurb,
      path: `/${project.name}`,
      locale: "en",
      scripts: [assets.theme, assets.stats, assets.project],
    })}
    ${topBarProject(project.name, project.repo, navLinks, project.page.hue)}
    <main id="main" class="project hue-${project.page.hue}">
      <section class="band">
        <div class="plate">
          <div class="wrap proj-mast">
            <div class="proj-copy">
              <div class="proj-id in">
                ${
                  readme.logo
                    ? html`<img
                        src="/${project.name}/${readme.logo.src}"
                        alt="${readme.logo.alt}"
                        width="72"
                        height="72"
                      />`
                    : ""
                }
                <div>
                  <p class="eyebrow">open source · ${project.tags.join(" · ")}</p>
                  <h1>${project.name}</h1>
                </div>
              </div>
              <p class="tagline in">${raw(readme.tagline)}</p>
              ${installBox(project, site.origin)}
            </div>
            ${
              readme.demo
                ? html`<figure class="demo" aria-label="Example: ${prompt?.replace(/^\$ /, "")}">
                    <figcaption>${prompt}</figcaption>
                    <pre>${output.join("\n")}</pre>
                  </figure>`
                : ""
            }
          </div>
          <div class="wrap proj-figures">${tiles(readme, release)}</div>
        </div>
        <p class="notch"><span>readme</span></p>
      </section>

      <div class="wrap">
        <p class="rel">
          <span class="live-stat" data-project="${repoName}"
            >${release.tag} · released ${released(release.published_at)}</span
          >
          <a href="${project.repo}/blob/${release.tag}/CHANGELOG.md">changelog</a>
          <a href="${project.repo}/releases">all releases</a>
        </p>

        <div class="doc">
          <nav class="toc" aria-label="On this page">
            <p class="toc-h">on this page</p>
            <ol>
              ${toc.map(
                (entry) =>
                  html`<li><a href="#${entry.id}">${entry.title.toLowerCase()}</a></li>`,
              )}
            </ol>
            <p class="out">
              <a href="${project.repo}">github &nearr;</a>
              ${
                project.npm?.[0]
                  ? html`<a href="https://www.npmjs.com/package/${project.npm[0]}"
                      >npm &nearr;</a
                    >`
                  : ""
              }
            </p>
          </nav>

          <div class="readme">
            <section class="sec" id="overview">
              <p class="rail-l">01 · overview</p>
              ${raw(readme.intro)}
            </section>
            ${readme.sections.map(
              (section, i) =>
                html`<section class="sec" id="${section.id}">
                  <p class="rail-l">
                    ${String(i + 2).padStart(2, "0")} ·
                    ${section.title.toLowerCase()}
                  </p>
                  <h2>${section.title}</h2>
                  ${raw(section.html)}
                </section>`,
            )}
            <p class="source">
              Rendered from
              <a href="${project.repo}/blob/${release.tag}/README.md"
                >README.md at ${release.tag}</a
              >
              ·
              <a href="${project.repo}/edit/main/README.md">edit on GitHub</a>
            </p>
          </div>
        </div>
      </div>
    </main>
    ${footer(site)}`,
  );
}
