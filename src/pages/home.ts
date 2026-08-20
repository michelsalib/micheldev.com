/**
 * The homepage: a hub index. Projects lead, links close.
 *
 * The career is the CV's job, not this page's — the hero states it in a
 * sentence and links out. Everything the page counts is open source, and it
 * counts it from projects.yaml rather than repeating a number.
 */

import {
  type ActiveProject,
  type Content,
  liveServices,
  metricValue,
  repoSlug,
  resolveFigures,
  t,
  totalStars,
} from "../content.ts";
import { html, htmlLines, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  figuresIn,
  figuresInHtml,
  figureTiles,
  footer,
  topBarHome,
} from "../partials.ts";

const LOCALE = "en" as const;

/**
 * The lead project: a plate, with its running services listed a row each.
 *
 * The first entry in `active` gets this treatment — same convention as the
 * accent tile taking the first metric, so reordering the YAML moves it and
 * nothing in here needs a flag to read.
 *
 * Not one big anchor: the plate holds several destinations — the service, each
 * endpoint, the repository — and nesting those inside an outer `<a>` is invalid
 * markup that browsers recover from by unnesting it. The name is the link.
 */
function leadPlate(project: ActiveProject, apex: string): Renderable {
  const services = project.subdomains ?? [];
  return html`<div class="lead reveal">
    <div class="lead-grid">
      <div>
        <p class="flag">
          Flagship${services.length ? ` · ${services.length} services` : ""}
        </p>
        <h3>
          <a href="${project.url}"
            >${project.name} <span class="arrow">&nearr;</span></a
          >
        </h3>
        <p class="blurb">${project.blurb}</p>
        <div class="meta">
          ${
            project.live
              ? html`<span class="tag live"
                >${services.length || 1} live</span
              >`
              : ""
          }
          ${project.tags.map(
            (tag, n) =>
              html`<span class="tag${raw(n === 0 ? " hue" : "")}">${tag}</span>`,
          )}
        </div>
        ${
          project.repo
            ? html`<p class="repo-line">
                <a href="${project.repo}"
                  >${project.repo.replace(/^https:\/\//, "")}</a
                >
              </p>`
            : ""
        }
      </div>
      ${
        services.length
          ? html`<div>
              <ul class="svcs">
                ${services.map(
                  (service) => html`<li>
                    <a class="svc" href="https://${service.host}.${apex}">
                      <span class="dot" aria-hidden="true"></span>
                      <span class="host"
                        >${service.host}<span class="tld">.${apex}</span></span
                      >
                      <span class="what">${service.what}</span>
                    </a>
                  </li>`,
                )}
              </ul>
              <p class="svcs-cap">Free to use, no install, no account</p>
              <!-- Traffic across all six hosts, as one figure. It lives in this
                   column because it is what these services served, and this
                   column only exists when there are services to have served
                   it. -->
              <p
                class="live-stat"
                data-project="${repoSlug(project) ?? ""}"
                hidden
              ></p>
            </div>`
          : ""
      }
    </div>
  </div>`;
}

/**
 * Every other active project: name, blurb, tags, one destination.
 *
 * The last line is the released version, how long ago it shipped and how many
 * times it has been downloaded — written by src/client/stats.ts and hidden
 * until it is. These three are desktop applications, so a version and a date
 * are what they have to say for themselves; the lead is a hosted service, and
 * says it in traffic instead.
 */
function projectCard(project: ActiveProject): Renderable {
  const repo = repoSlug(project);
  return html`<a class="card" href="${project.url}">
    <span class="h">${project.name} <span class="ext">&nearr;</span></span>
    <p class="b">${project.blurb}</p>
    <div class="meta">
      ${project.tags.map(
        (tag, n) =>
          html`<span class="tag${raw(n === 0 ? " hue" : "")}">${tag}</span>`,
      )}
    </div>
    ${repo ? html`<p class="live-stat" data-project="${repo}" hidden></p>` : ""}
  </a>`;
}

/**
 * The career, as one rule of figures pointing at /cv.
 *
 * The page's thesis is the open source and stays that way — this is not the
 * timeline coming back. It is the smallest thing that stops the paid work from
 * living entirely behind a link: four figures from `cv.metrics`, the same four
 * the CV masthead leads with, and one sentence saying where they come from.
 *
 * Deliberately not a second block of tiles. The hero already counts the open
 * source in four tiles, and eight tiles in two grids read as one grid of eight
 * — so this is a rule with numbers on it, in the mono the rest of the page uses
 * for facts about itself.
 */
function proofBand(content: Content): Renderable {
  const metrics = content.cv.metrics ?? [];
  if (!metrics.length) return "";

  return html`<section class="proof">
    <div class="wrap">
      <div class="proof-in reveal">
        <ul class="figs">
          ${metrics.map(
            (metric) => html`<li>
              <span class="fig-n">${metricValue(metric, content)}</span
              ><span class="fig-l">${t(metric.label, LOCALE)}</span>
            </li>`,
          )}
        </ul>
        <a class="proof-link" href="/cv"
          >the paid work is on the CV &rarr;</a
        >
      </div>
    </div>
  </section>`;
}

function projectsSection(content: Content): Renderable {
  const { site, projects } = content;
  const section = site.sections.projects;
  const stars = totalStars(projects);
  const [lead, ...rest] = projects.active;
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
            <p class="lede">${figuresInHtml(section.lede_html, content)}</p>
          </div>

          <!-- The ship line is filled by src/client/stats.ts and hidden until
               it is: there is no build-time equivalent to fall back to, and an
               empty slot promising a date is worse than no slot. -->
          <p class="sub-h reveal">
            Running now
            <span class="count">· ${projects.active.length} projects</span>
            <time class="count ship" data-ship hidden></time>
          </p>
          ${
            // `active` is minItems: 1 in the schema, but that guarantee does
            // not survive into the type.
            lead ? leadPlate(lead, site.hosts.canonical) : ""
          }
          <div class="cards reveal">${rest.map(projectCard)}</div>

          <!-- Folded, and closed by default: the archive is the reason the live
               work used to be the smaller half of this section. The summary
               keeps its totals on screen, which is all most visitors read. -->
          <details class="fold reveal">
            <summary>
              <span class="chev" aria-hidden="true">&rsaquo;</span>
              <span class="t">${projects.archive.heading}</span>
              <!-- The summary is a claim about the whole account, so both
                   figures are live: the repo count and the star total the tiles
                   fetch, not the seven rows folded underneath. -->
              <span class="d"
                ><span data-stat="repos">${projects.archive.total_repos}</span>
                repos · <span data-stat="stars">${stars}</span> stars</span
              >
            </summary>
            <p class="lede lede-tight">
              ${projects.archive.lede}
            </p>
            <div class="archive-scroll">
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
                      <span data-stat="repos"
                        >${projects.archive.total_repos}</span
                      >
                      repositories
                    </td>
                    <!-- Deliberately not live: this is the total of the column
                         above it, and the live figure counts stars on
                         repositories this table does not list. A foot that
                         disagrees with its own column is just wrong. -->
                    <td class="num">${stars}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </div>
      </div>
    </div>
  </section>`;
}

function elsewhereSection(content: Content): Renderable {
  const { site, projects } = content;
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
            <p class="lede">${figuresInHtml(section.lede_html, content)}</p>
          </div>
          <div class="links reveal">
            ${projects.links.map(
              (link) => html`<a class="link" href="${link.url}">
                <span class="k"
                  >${link.name} <span class="ext">&nearr;</span></span
                >
                <span class="h"
                  >${link.host}<br />${figuresIn(link.note, content)}</span
                >
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
      // Quoted figures resolve to their build-time value here: a <meta> tag
      // has nowhere to hang a live span, and a crawler reads the source.
      description: resolveFigures(site.meta.description, content),
      path: "/",
      locale: LOCALE,
      scripts: [assets.theme, assets.stats],
    })}
    ${topBarHome(liveServices(projects))}
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
            <div class="figures">
              ${figureTiles(content, LOCALE, projects.metrics)}
              <!-- Dormant until the zone token is configured; see stats.ts. -->
              <p class="pulse" data-visits hidden></p>
            </div>
          </div>
        </div>
      </section>
      ${proofBand(content)} ${projectsSection(content)}
      ${elsewhereSection(content)}
    </main>
    ${footer(site)}`,
  );
}
