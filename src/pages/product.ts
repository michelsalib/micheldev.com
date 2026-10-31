/**
 * A product's page, at /<name>: an application, presented to the people who
 * will use it rather than to the people who build it.
 *
 * The README pages (src/pages/project.ts) show a developer tool through its own
 * documentation, because its users read READMEs. A desktop app's users do not:
 * they want to know what it does, where to click Download and what their
 * computer will ask the first time. So the copy is written in projects.yaml
 * (`product`), and only facts that change with a release — the version, the
 * installers, the icon — are synced from the repository.
 *
 * Same plate, tiles, notch, release line and contents rail as a README page,
 * from the same stylesheet; 06-product.css adds the download buttons, the
 * screenshots and the sections a README page has no use for.
 */

import type {
  ActiveProject,
  Content,
  DocsRelease,
  ProductDownload,
  ProductPage,
} from "../content.ts";
import { html, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  footer,
  topBarProject,
} from "../partials.ts";

type ProductProject = ActiveProject & { product: ProductPage; repo: string };

/** A download, resolved against the release: the file it serves, and where. */
export type ResolvedDownload = ProductDownload & {
  file: string;
  size: number;
  url: string;
};

/**
 * Each download's installer in the synced release.
 *
 * A pattern that matches nothing fails the build. A release is only published
 * once every platform's job has uploaded (media-cast's release workflow keeps it
 * a draft until then), so a missing installer means the pattern is wrong, and
 * a page with a button to nowhere is worse than a failed deploy.
 */
export function productDownloads(
  project: ProductProject,
  release: DocsRelease,
): ResolvedDownload[] {
  const repo = project.repo.replace(/\/$/, "");
  return project.product.downloads.map((download) => {
    const pattern = new RegExp(download.asset);
    const asset = release.assets?.find(({ name }) => pattern.test(name));
    if (!asset) {
      throw new Error(
        `${project.name}: no asset of ${release.tag} matches ${download.asset} (${download.label})`,
      );
    }
    return {
      ...download,
      file: asset.name,
      size: asset.size,
      url: `${repo}/releases/download/${release.tag}/${encodeURIComponent(asset.name)}`,
    };
  });
}

/** "31 Oct 2026", or "31 Oct" for a tile whose label carries the year. */
function released(iso: string, parts: "full" | "day" = "full"): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(parts === "full" ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Decimal megabytes, as both systems' file managers count them. */
function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`;
}

/**
 * The download buttons. Without JS they are equals, in the YAML's order;
 * src/client/product.ts puts the reader's own system first and quietens the
 * rest, or says so when the reader is on a phone or on Linux.
 */
function downloadBox(
  project: ProductProject,
  release: DocsRelease,
  downloads: ResolvedDownload[],
): Renderable {
  return html`<div class="get" id="download" data-downloads>
      ${downloads.map(
        (download) =>
          html`<a
            class="get-btn"
            href="/${project.name}/download/${download.os}"
            data-os="${download.os}"
            ><span class="get-l">Download for ${download.label}</span
            ><span class="get-n"
              >${release.tag} · ${megabytes(download.size)} ·
              ${download.note}</span
            ></a
          >`,
      )}
    </div>
    <p class="get-other" data-other="mobile" hidden>
      ${project.product.title} runs on a computer: open this page on a Windows
      PC or a Mac to download it.
    </p>
    <p class="get-other" data-other="linux" hidden>
      There is no Linux version yet — see
      <a href="#questions">the questions</a>.
    </p>`;
}

/** Image sizes, read from the files by the build. Keyed by the shot's name. */
export type ShotSizes = Record<string, { width: number; height: number }>;

/**
 * One screenshot, in the light and the dark app, of which the stylesheet shows
 * the one matching the site's theme. Lazy, so the hidden one is never fetched:
 * a lazy image with no box is not loaded at all.
 */
function screenshot(
  project: ProductProject,
  shot: ProductPage["screenshots"][number],
  sizes: ShotSizes,
): Renderable {
  const base = `/assets/img/${project.name}/${shot.shot}`;
  const size = sizes[shot.shot] ?? { width: 0, height: 0 };
  return html`<figure class="shot">
    <div class="frame">
      ${(["light", "dark"] as const).map(
        (theme) =>
          html`<img
            class="${theme}"
            src="${base}-${theme}.webp"
            alt="${shot.alt}"
            width="${String(size.width)}"
            height="${String(size.height)}"
            loading="lazy"
            decoding="async"
          />`,
      )}
    </div>
    ${shot.caption ? html`<figcaption>${shot.caption}</figcaption>` : ""}
  </figure>`;
}

function tiles(release: DocsRelease): Renderable {
  const facts: [string, string][] = [
    [release.tag, "latest version"],
    [
      released(release.published_at, "day"),
      `released ${release.published_at.slice(0, 4)}`,
    ],
    ["free", "no account · no ads"],
  ];
  return html`<ul class="tiles">
    ${facts.map(
      ([n, l], i) =>
        html`<li class="tile${raw(i === 0 ? " hue" : "")}">
          <span class="n">${n}</span><span class="l">${l}</span>
        </li>`,
    )}
  </ul>`;
}

const SECTIONS = [
  { id: "how-it-works", title: "How it works" },
  { id: "features", title: "What it does" },
  { id: "first-launch", title: "First launch" },
  { id: "questions", title: "Questions" },
] as const;

function rail(id: (typeof SECTIONS)[number]["id"]): Renderable {
  const index = SECTIONS.findIndex((section) => section.id === id);
  const title = SECTIONS[index]?.title ?? "";
  return html`<p class="rail-l">
      ${String(index + 1).padStart(2, "0")} · ${title.toLowerCase()}
    </p>
    <h2>${title}</h2>`;
}

export function productPage(
  content: Content,
  assets: Assets,
  project: ProductProject,
  release: DocsRelease,
  sizes: ShotSizes,
): string {
  const { site } = content;
  const { product } = project;
  const repo = project.repo.replace(/\/$/, "");
  const repoName = repo.split("/").pop() ?? "";
  const downloads = productDownloads(project, release);
  const [lead, ...more] = product.screenshots;
  const systems = downloads.map((download) => download.label).join(" and ");

  return String(
    html`${documentHead({
      site,
      assets,
      title: `${product.title} — ${product.headline.replace(/\.$/, "")}`,
      description: `${product.lede.split(". ")[0]}. Free, for ${systems}.`,
      path: `/${project.name}`,
      locale: "en",
      scripts: [assets.theme, assets.stats, assets.product],
    })}
    ${topBarProject(
      project.name,
      project.repo,
      [
        { href: "#features", label: "features" },
        { href: "#questions", label: "questions" },
      ],
      product.hue,
      { href: "#download", label: raw("download&nbsp;&darr;") },
    )}
    <main id="main" class="project product hue-${product.hue}">
      <section class="band">
        <div class="plate">
          <div class="wrap proj-mast">
            <div class="proj-copy">
              <div class="proj-id in">
                <img
                  src="/${project.name}/${product.logo}"
                  alt=""
                  width="56"
                  height="56"
                />
                <div>
                  <p class="eyebrow">
                    free · ${downloads.map((d) => d.label.toLowerCase()).join(" · ")}
                  </p>
                  <p class="name">${product.title}</p>
                </div>
              </div>
              <h1 class="in">${product.headline}</h1>
              <p class="tagline in">${product.lede}</p>
              ${downloadBox(project, release, downloads)}
            </div>
            ${lead ? screenshot(project, lead, sizes) : ""}
          </div>
          <div class="wrap proj-figures">${tiles(release)}</div>
        </div>
        <p class="notch"><span>tour</span></p>
      </section>

      <div class="wrap">
        <p class="rel">
          <span class="live-stat" data-project="${repoName}"
            >${release.tag} · released ${released(release.published_at)}</span
          >
          <a href="${repo}/releases/tag/${release.tag}">what's new</a>
          <a href="${repo}/releases">all versions</a>
        </p>

        <div class="doc">
          <nav class="toc" aria-label="On this page">
            <p class="toc-h">on this page</p>
            <ol>
              ${SECTIONS.map(
                (section) =>
                  html`<li><a href="#${section.id}">${section.title.toLowerCase()}</a></li>`,
              )}
            </ol>
            <p class="out">
              <a href="#download">download &uarr;</a>
              <a href="${repo}">source code &nearr;</a>
            </p>
          </nav>

          <div class="readme">
            <section class="sec" id="how-it-works">
              ${rail("how-it-works")}
              <ol class="steps">
                ${product.steps.map(
                  (step, i) =>
                    html`<li>
                      <span class="k">${String(i + 1)}</span>
                      <h3>${step.title}</h3>
                      <p>${step.text}</p>
                    </li>`,
                )}
              </ol>
              ${more.map((shot) => screenshot(project, shot, sizes))}
            </section>

            <section class="sec" id="features">
              ${rail("features")}
              <ul class="features">
                ${product.features.map(
                  (feature) =>
                    html`<li>
                      <h3>${feature.title}</h3>
                      <p>${feature.text}</p>
                    </li>`,
                )}
              </ul>
            </section>

            <section class="sec" id="first-launch">
              ${rail("first-launch")}
              <p>
                ${product.title} is not signed with a paid certificate from
                Apple or Microsoft, so the first time, your computer asks you
                to confirm. It is a one-time thing.
              </p>
              <div class="systems">
                ${product.first_run.map(
                  (system) =>
                    html`<div class="system">
                      <h3>${system.title}</h3>
                      <ol>
                        ${system.points.map((point) => html`<li>${point}</li>`)}
                      </ol>
                    </div>`,
                )}
              </div>
            </section>

            <section class="sec" id="questions">
              ${rail("questions")}
              <div class="faq">
                ${product.questions.map(
                  (question) =>
                    html`<details>
                      <summary>${question.q}</summary>
                      <p>${question.a}</p>
                    </details>`,
                )}
              </div>
            </section>

            <p class="source">
              ${product.title} is free, made by Michel Salib ·
              <a href="${repo}">source code</a> ·
              <a href="${repo}/issues">report a problem</a>
            </p>
          </div>
        </div>
      </div>
    </main>
    ${footer(site)}`,
  );
}
