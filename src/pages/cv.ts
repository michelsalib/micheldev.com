/**
 * /cv and /cv/fr — rendered from cv.yaml, crawlable, and the exact document CI
 * prints to PDF via the @media print block.
 */

import {
  type Content,
  careerYears,
  type Employment,
  hueClass,
  isCurrent,
  type Locale,
  type Project,
  t,
  tl,
  years,
} from "../content.ts";
import { html, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  figureTiles,
  footer,
  portrait,
  topBarCv,
} from "../partials.ts";

const COPY = {
  en: {
    eyebrow: "Curriculum vitae",
    experience: "Professional experience",
    jumpTo: "Jump to",
    skills: "Skills",
    education: "Education",
    languages: "Languages",
    elsewhere: "Elsewhere",
    interests: "Interests",
    contact: "Contact",
    privacy:
      "Email and phone are in the PDF only — this page is crawlable, so they stay off it.",
    note: (n: number, e: number) => `${n} years · ${e} employers · Paris`,
  },
  fr: {
    eyebrow: "Curriculum vitae",
    experience: "Expériences professionnelles",
    jumpTo: "Aller à",
    skills: "Compétences",
    education: "Formations",
    languages: "Langues",
    elsewhere: "Ailleurs",
    interests: "Activités",
    contact: "Contact",
    privacy:
      "L'e-mail et le téléphone ne figurent que dans le PDF — cette page est indexable.",
    note: (n: number, e: number) => `${n} ans · ${e} employeurs · Paris`,
  },
} as const;

/** A stable anchor id per employer, for the summary strip. */
export function slug(job: Employment): string {
  return job.employer
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function shortYears(job: Employment, locale: Locale): string {
  const from = String(job.from).slice(-2);
  const to =
    job.to === "present"
      ? locale === "fr"
        ? "auj."
        : "now"
      : String(job.to).slice(-2);
  return `${from}–${to}`;
}

/**
 * Order is deliberate: name, one-line lead, then the magnitudes, then the
 * detail. `figures` sits above the bullets because it is the only part of the
 * block that is scannable — a reader who reads nothing else should still leave
 * with the numbers. Which also means the numbers belong there and nowhere else:
 * `lead` states what was done and the chips state how big it was.
 *
 * `extra` closes the block with a second list behind its own lead-in sentence.
 */
function projectBlock(project: Project, locale: Locale): Renderable {
  const points = tl(project.points, locale);
  const extra = tl(project.extra?.points, locale);
  return html`<div class="proj">
    <p class="pn">${t(project.name, locale)}</p>
    ${project.lead ? html`<p class="pl">${t(project.lead, locale)}</p>` : ""}
    ${
      project.figures?.length
        ? html`<div class="pf">
          ${project.figures.map(
            (figure) => html`<span class="kv"
              ><span class="v">${String(figure.value)}</span
              ><span class="k">${t(figure.label, locale)}</span></span
            >`,
          )}
        </div>`
        : ""
    }
    ${
      points.length
        ? html`<ul>
          ${points.map((point) => html`<li>${point}</li>`)}
        </ul>`
        : ""
    }
    ${
      project.extra
        ? html`<p class="extra-lead">${t(project.extra.lead, locale)}</p>`
        : ""
    }
    ${
      extra.length
        ? html`<ul>
          ${extra.map((point) => html`<li>${point}</li>`)}
        </ul>`
        : ""
    }
    ${
      project.stack?.length
        ? html`<div class="stack">
          ${project.stack.map(
            (item, n) =>
              html`<span class="tag${raw(n === 0 ? " hue" : "")}">${item}</span>`,
          )}
        </div>`
        : ""
    }
  </div>`;
}

function timeline(content: Content, locale: Locale): Renderable {
  return html`<ol class="tl">
    ${content.cv.experience.map(
      (job, i) => html`<li
        class="job ${hueClass(job, i)}${raw(
          isCurrent(job) || i === 0 ? " current" : "",
        )}"
        id="${slug(job)}"
      >
        <span class="node" aria-hidden="true"></span>
        <div class="job-head">
          <span class="co">${t(job.employer_full, locale) || job.employer}</span>
          <span class="yrs">${years(job, locale)}</span>
          ${job.location ? html`<span class="loc">${job.location}</span>` : ""}
        </div>
        ${
          job.context
            ? html`<p class="ctx">
              ${t(job.context, locale)}${
                job.open_source_prefix
                  ? raw(
                      ` · <span class="mono">${job.open_source_prefix}</span>`,
                    )
                  : ""
              }
            </p>`
            : ""
        }
        ${job.roles.map(
          (role) => html`<div class="role-blk">
            <p class="rt">${t(role.title, locale)}</p>
            ${role.projects.map((project) => projectBlock(project, locale))}
          </div>`,
        )}
      </li>`,
    )}
  </ol>`;
}

function sidebar(content: Content, locale: Locale): Renderable {
  const { cv } = content;
  const copy = COPY[locale];
  const links = cv.person.links ?? {};

  return html`<aside>
    ${
      cv.skills?.length
        ? html`<div class="blk">
          <span class="h">${copy.skills}</span>
          <dl>
            ${cv.skills.map(
              (group) => html`<div>
                <dt>${t(group.group, locale)}</dt>
                <dd>${group.items.join(", ")}</dd>
              </div>`,
            )}
          </dl>
        </div>`
        : ""
    }
    ${
      cv.skills_current
        ? html`<div class="blk">
          <span class="h">${t(cv.skills_current.label, locale)}</span>
          <!-- Two-up: short tool names, and one per line leaves the block mostly
               white space. Interests stays a single column — those are phrases,
               not names, and they wrap. -->
          <ul class="plain two-up">
            ${cv.skills_current.items.map((item) => html`<li>${item}</li>`)}
          </ul>
        </div>`
        : ""
    }
    ${
      cv.education?.length
        ? html`<div class="blk">
          <span class="h">${copy.education}</span>
          <ul class="edu">
            ${cv.education.map(
              (entry) => html`<li>
                <span class="yr">${entry.year}</span>
                <span class="inst">${t(entry.institution, locale)}</span>
                ${
                  entry.award
                    ? html`<span class="aw">${t(entry.award, locale)}</span>`
                    : ""
                }
              </li>`,
            )}
          </ul>
        </div>`
        : ""
    }
    ${
      cv.languages?.length
        ? html`<div class="blk">
          <span class="h">${copy.languages}</span>
          <ul class="plain">
            ${cv.languages.map(
              (lang) =>
                html`<li>${t(lang.name, locale)} — ${t(lang.level, locale)}</li>`,
            )}
          </ul>
        </div>`
        : ""
    }
    <div class="blk">
      <span class="h">${copy.elsewhere}</span>
      <div class="links-list">
        ${Object.entries(links).map(
          ([, url]) => html`<a href="${url}"
            >${url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            <span class="ext">&nearr;</span></a
          >`,
        )}
      </div>
    </div>
    ${
      cv.interests
        ? html`<div class="blk">
          <span class="h">${copy.interests}</span>
          <ul class="plain">
            ${tl(cv.interests, locale).map((item) => html`<li>${item}</li>`)}
          </ul>
        </div>`
        : ""
    }
    <p class="privacy">${copy.privacy}</p>
  </aside>`;
}

/**
 * `contact` decides whether email and phone are in the markup at all.
 *
 * It defaults to false, and the deployed pages must keep it that way. The
 * original design put the contact line in every copy of the page and relied on
 * `display: none` from the print stylesheet to keep it off screen — which hides
 * it from readers and from nobody else. `display: none` does not remove text
 * from the document: it ships in the HTML, and every crawler, scraper and
 * "view source" gets it verbatim. Both values were live on the public /cv for
 * exactly as long as the site was up.
 *
 * Only the copy that headless Chrome prints from sets this, and that copy is
 * written outside dist/ so it cannot be deployed. See scripts/pdf.ts.
 */
export function cvPage(
  content: Content,
  assets: Assets,
  locale: Locale,
  pdfHref: string,
  contact = false,
): string {
  const { cv, site } = content;
  const copy = COPY[locale];
  const path = locale === "en" ? "/cv" : "/cv/fr";
  const spanYears = careerYears(cv);
  // No location here: the eyebrow above already carries it, and printing it
  // twice in the same masthead is just noise. Empty when CV_EMAIL and CV_PHONE
  // are both unset — a local build with no secrets, which prints no line at all
  // rather than an empty one.
  const contactLine = contact
    ? [cv.person.email, cv.person.phone].filter(Boolean).join("  ·  ")
    : "";

  return String(
    html`${documentHead({
      site,
      assets,
      title: `${cv.person.name} — ${t(cv.headline, locale)}`,
      description: t(cv.summary, locale),
      path,
      locale,
      alternates: { en: "/cv", fr: "/cv/fr" },
      scripts: [assets.theme, assets.cv],
      preloadPortrait: true,
    })}
    ${topBarCv(locale, pdfHref)}
    <nav class="toc" aria-label="${copy.jumpTo}">
      <div class="toc-in">
        <span class="lbl">${copy.jumpTo}</span>
        ${cv.experience.map(
          (job, i) => html`<a
            href="#${slug(job)}"
            class="${hueClass(job, i)}"
            ><span class="pip" aria-hidden="true"></span>${job.employer}
            <span class="yr">${shortYears(job, locale)}</span></a
          >`,
        )}
      </div>
    </nav>
    <main id="main">
      <section class="band">
        <div class="plate">
          <div class="wrap">
            <div class="mast">
              <p class="eyebrow in">
                ${copy.eyebrow}${
                  cv.person.location
                    ? ` · ${t(cv.person.location, locale)}`
                    : ""
                }
              </p>
              <h1 class="in">${cv.person.name}</h1>
              <p class="headline in">${t(cv.headline, locale)}</p>
              <p class="summary in">${t(cv.summary, locale)}</p>
              <!-- Absent entirely unless this is the copy being printed to PDF.
                   Not hidden with CSS: hidden text is still in the HTML. -->
              ${
                contactLine
                  ? html`<p class="print-contact">${contactLine}</p>`
                  : ""
              }
            </div>
          </div>
          <div class="plate-lower">
            ${figureTiles(content, locale)} ${portrait(cv.person.name)}
          </div>
        </div>
        <p class="notch"><span>scroll</span></p>
      </section>
      <div class="wrap">
        <div class="cols">
          <section class="exp">
            <h2>${copy.experience}</h2>
            <p class="sect-note">
              ${copy.note(spanYears, cv.experience.length)}
            </p>
            ${timeline(content, locale)}
          </section>
          ${sidebar(content, locale)}
        </div>
      </div>
    </main>
    ${footer(site, locale)}`,
  );
}
