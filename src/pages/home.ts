/**
 * The homepage: a hub index. Projects lead, links close.
 *
 * The career is the CV's job, not this page's — the hero states it in a
 * sentence and links out. Everything the page counts is open source, and it
 * counts it from projects.yaml rather than repeating a number.
 */

import { type Content, totalStars } from "../content.ts";
import { html, htmlLines, join, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  figureTiles,
  footer,
  topBarHome,
} from "../partials.ts";

const LOCALE = "en" as const;

function projectsSection({ site, projects }: Content): Renderable {
  const section = site.sections.projects;
  const stars = totalStars(projects);
  return html`<section
    class="zone hue-projects"
    id="projects"
  >
    <div class="wrap">
      <div class="zone-grid">
        <div class="rail">
          <span class="path">${section.path}</span>
          <div class="rule"></div>
          <p class="note">${htmlLines(section.note_html)}</p>
        </div>
        <div>
          <div class="reveal">
            <h2>${section.heading}</h2>
            <p class="lede">${raw(section.lede_html)}</p>
          </div>

          <p class="sub-h reveal">Running now</p>
          <div class="rows">
            ${projects.active.map(
              (project) => html`<a class="row reveal" href="${project.url}">
                <span class="name"
                  >${project.name} <span class="arrow">&nearr;</span></span
                >
                <span class="desc"
                  >${project.blurb}${
                    project.subdomains
                      ? html`<span class="subs"
                        >${join(project.subdomains, " · ")}</span
                      >`
                      : ""
                  }</span
                >
                <span class="tags">
                  ${
                    project.live
                      ? html`<span class="tag live"
                        >${project.subdomains?.length ?? 1} live</span
                      >`
                      : ""
                  }
                  ${project.tags.map(
                    (tag, n) =>
                      html`<span class="tag${raw(n === 0 ? " hue" : "")}"
                        >${tag}</span
                      >`,
                  )}
                </span>
              </a>`,
            )}
          </div>

          <p class="sub-h reveal">${projects.archive.heading}</p>
          <p class="lede reveal lede-tight">
            ${projects.archive.lede}
          </p>
          <div class="archive-scroll reveal">
            <table class="archive">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>What it did</th>
                  <th>Lang</th>
                  <th class="num">Stars</th>
                </tr>
              </thead>
              <tbody>
                ${projects.archive.repos.map(
                  (repo) => html`<tr>
                    <td class="repo">${repo.name}</td>
                    <td>${repo.what}</td>
                    <td class="lang">${repo.lang}</td>
                    <td class="num">${repo.stars}</td>
                  </tr>`,
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="3">
                    ${projects.archive.repos.length} of
                    ${projects.archive.total_repos} repositories
                  </td>
                  <td class="num">${stars}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function elsewhereSection({ site, projects }: Content): Renderable {
  const section = site.sections.elsewhere;
  return html`<section
    class="zone hue-elsewhere"
    id="elsewhere"
  >
    <div class="wrap">
      <div class="zone-grid">
        <div class="rail">
          <span class="path">${section.path}</span>
          <div class="rule"></div>
          <p class="note">${htmlLines(section.note_html)}</p>
        </div>
        <div>
          <div class="reveal">
            <h2>${section.heading}</h2>
            <p class="lede">${raw(section.lede_html)}</p>
          </div>
          <div class="links reveal">
            ${projects.links.map(
              (link) => html`<a class="link" href="${link.url}">
                <span class="k"
                  >${link.name} <span class="ext">&nearr;</span></span
                >
                <span class="h">${link.host}<br />${link.note}</span>
              </a>`,
            )}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

export function homePage(content: Content, assets: Assets): string {
  const { cv, site, projects } = content;

  return String(
    html`${documentHead({
      site,
      assets,
      title: site.meta.title,
      description: site.meta.description,
      path: "/",
      locale: LOCALE,
      scripts: [assets.theme],
    })}
    ${topBarHome()}
    <main id="main">
      <section class="hero">
        <div class="field"></div>
        <div class="wrap">
          <div class="hero-grid">
            <div>
              <p class="eyebrow in">${site.hero.eyebrow}</p>
              <h1 class="in">${cv.person.name}</h1>
              <p class="role in">${raw(site.hero.role_html)}</p>
              <p class="thesis in">${raw(site.hero.thesis_html)}</p>
            </div>
            ${figureTiles(content, LOCALE, projects.metrics)}
          </div>
        </div>
      </section>
      ${projectsSection(content)} ${elsewhereSection(content)}
    </main>
    ${footer(site)}`,
  );
}
