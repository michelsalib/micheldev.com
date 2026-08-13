/**
 * The homepage: a hub index. Projects lead, career follows, links close.
 *
 * The work timeline and the hero metrics come from cv.yaml, so the homepage can
 * never disagree with the CV.
 */

import {
  type Content,
  type Employment,
  featured,
  hueClass,
  isCurrent,
  liveServices,
  metricValue,
  t,
  tl,
  totalStars,
  years,
} from "../content.ts";
import { html, htmlLines, join, type Renderable, raw } from "../html.ts";
import { type Assets, documentHead, footer, topBarHome } from "../partials.ts";

const LOCALE = "en" as const;

/** One-line summary of an employer for the homepage timeline. */
function summarise(job: Employment): string {
  const parts: string[] = [];
  for (const role of job.roles) {
    for (const project of role.projects) {
      const lead = t(project.lead, LOCALE).trim();
      if (lead) parts.push(lead);
    }
  }
  return parts.join(" ");
}

/** Every technology named across an employer's projects, de-duplicated. */
function stackOf(job: Employment): string[] {
  const seen = new Set<string>();
  for (const role of job.roles) {
    for (const project of role.projects) {
      for (const item of project.stack ?? []) seen.add(item);
    }
  }
  return [...seen];
}

function roleTitles(job: Employment): string {
  const titles = job.roles.map((r) => t(r.title, LOCALE));
  if (titles.length <= 1) return titles[0] ?? "";
  // Reverse-chronological in the data; read as a progression on the page.
  return [...titles].reverse().join(" → ");
}

function workSection({ cv, site }: Content): Renderable {
  const section = site.sections.work;
  return html`<section class="zone hue-work" id="work">
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
          <ul class="tl">
            ${cv.experience.map(
              (job, i) => html`<li
                class="reveal ${hueClass(job, i)}${raw(
                  i === 0 || isCurrent(job) ? " now" : "",
                )}"
              >
                <span class="when"
                  >${years(job, LOCALE)}${
                    job.location ? ` · ${job.location.toUpperCase()}` : ""
                  }</span
                >
                <p class="who">
                  ${job.employer} <span class="t">${roleTitles(job)}</span>
                </p>
                <p class="b">${summarise(job)}</p>
                <div class="stack">
                  ${stackOf(job).map(
                    (item, n) =>
                      html`<span class="tag${raw(n === 0 ? " hue" : "")}"
                        >${item.toLowerCase()}</span
                      >`,
                  )}
                </div>
              </li>`,
            )}
          </ul>
        </div>
      </div>
    </div>
  </section>`;
}

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

function heroPanels(content: Content): Renderable {
  const { cv, projects } = content;
  const job = featured(cv);
  const current = isCurrent(job);
  const role = job.roles[0];
  const project = role?.projects[0];

  // Up to three highlights, from the featured role's first project.
  const highlights = [
    ...(project?.lead ? [t(project.lead, LOCALE)] : []),
    ...tl(project?.points, LOCALE).slice(-2),
  ].slice(0, 3);

  const liveCount = liveServices(projects);

  return html`<div class="panels">
    <div
      class="panel ph-projects"
      aria-label="Open source running now"
    >
      <div class="panel-head">
        <span class="dot is-live" aria-hidden="true"></span>
        <span>Open source, live</span>
        <span class="yrs">${liveCount} up</span>
      </div>
      <div class="panel-body">
        <ul class="oss">
          ${projects.active.map(
            (project) => html`<li>
              <a href="${project.url}">
                <span class="n"
                  >${
                    project.live
                      ? html`<span class="ld" aria-hidden="true"></span>`
                      : ""
                  }${project.name}</span
                >
                <span class="m">${project.meta}</span>
                ${
                  project.hero_blurb
                    ? html`<span class="d">${project.hero_blurb}</span>`
                    : ""
                }
              </a>
            </li>`,
          )}
        </ul>
      </div>
      <div class="panel-foot">
        <a href="#projects"
          >All projects — ${totalStars(projects)} stars
          <span class="ar">&rarr;</span></a
        >
      </div>
    </div>

    <div
      class="panel ph-work"
      aria-label="${current ? "Current role" : "Most recent role"}"
    >
      <div class="panel-head">
        <span
          class="dot${raw(current ? " is-live" : "")}"
          aria-hidden="true"
        ></span>
        <span>${current ? "Currently" : "Most recent"}</span>
        <span class="yrs">${years(job, LOCALE)}</span>
      </div>
      <div class="panel-body">
        <p class="co">${t(job.employer_full, LOCALE) || job.employer}</p>
        <p class="ti">${t(role?.title, LOCALE)}</p>
        ${job.context ? html`<p class="cx">${t(job.context, LOCALE)}</p>` : ""}
        <ul class="hi">
          ${highlights.map((item) => html`<li><span>${item}</span></li>`)}
        </ul>
      </div>
      <div class="panel-foot">
        <a href="/cv">Full CV — page and PDF <span class="ar">&rarr;</span></a>
      </div>
    </div>
  </div>`;
}

export function homePage(content: Content, assets: Assets): string {
  const { cv, site } = content;

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
              <ul class="metrics in">
                ${(cv.metrics ?? []).map(
                  (metric) => html`<li>
                    <span class="n">${metricValue(metric, content)}</span
                    ><span class="l">${t(metric.label, LOCALE)}</span>
                  </li>`,
                )}
              </ul>
            </div>
            ${heroPanels(content)}
          </div>
        </div>
      </section>
      ${projectsSection(content)} ${workSection(content)}
      ${elsewhereSection(content)}
    </main>
    ${footer(site)}`,
  );
}
