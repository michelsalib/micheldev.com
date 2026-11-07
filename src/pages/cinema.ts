/**
 * A product's page in the cinema layout, at /<name>: the TV is the hero, and
 * the page moves as it scrolls. Chosen by a `cinema` block in the product's
 * YAML; media-cast is the one page that has it, and /audio-tray keeps the
 * product layout (src/pages/product.ts).
 *
 * Same facts as that layout, from the same block — headline, steps, features,
 * first launch, questions, the synced release and its installers — dressed for
 * people who came to watch a film rather than to read about an app:
 *
 * - The masthead puts the app, playing, inside a TV that straightens up and
 *   lights as it scrolls into view.
 * - The steps are a pinned tour: the section holds still while the reader
 *   scrolls through it, each step lighting in turn beside what the app shows
 *   at that step. A step's `screen` is a screenshot, or one of the two app
 *   views drawn here in HTML (`empty`, `drop`) for states with no screenshot.
 * - A feature with `show` gets a scene drawn to match; the rest are cards.
 *
 * All motion is CSS scroll-driven timelines (07-cinema.css). Without them, or
 * under prefers-reduced-motion, every element rests where the motion would have
 * left it: the tour is a plain section with every step lit. No inline styles,
 * which the CSP voids — every varying value is a class.
 */

import type {
  CinemaShow,
  Content,
  DocsRelease,
  ProductFeature,
} from "../content.ts";
import { html, type Renderable, raw } from "../html.ts";
import {
  type Assets,
  documentHead,
  footer,
  topBarProject,
} from "../partials.ts";
import {
  downloadBox,
  type ProductProject,
  productDownloads,
  released,
  type ShotSizes,
  SYSTEMS,
} from "./product.ts";

const COUNT = ["", "One", "Two", "Three", "Four"];

// Material icons, as the app draws them (MUI's outlined set).
const ICON = {
  movie: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 6.47 5.76 10H20v8H4V6.47M22 4h-4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>`,
  cast: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 21H7v-1h10v1zm0-3H7V6h10v12zm0-14H7V3h10v1z"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59 7 11l5 5 5-5z"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>`,
  // Not the app's: the page's own, for the trip and the phone.
  laptop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`,
  magnet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 3v8a6 6 0 0 0 12 0V3M6 7h4M14 7h4"/></svg>`,
} as const;

const icon = (name: keyof typeof ICON) => raw(ICON[name]);

/**
 * A screenshot's light and dark copies; the stylesheet shows the one matching
 * the site's theme. Lazy, so the hidden one is never fetched.
 */
function shotImages(
  project: ProductProject,
  name: string,
  sizes: ShotSizes,
): Renderable {
  const shot = project.product.screenshots.find((s) => s.shot === name);
  if (!shot) throw new Error(`${project.name}: no screenshot named ${name}`);
  const size = sizes[name] ?? { width: 0, height: 0 };
  return html`${(["light", "dark"] as const).map(
    (theme) =>
      html`<img
        class="${theme}"
        src="/assets/img/${project.name}/${name}-${theme}.webp"
        alt="${shot.alt}"
        width="${String(size.width)}"
        height="${String(size.height)}"
        loading="lazy"
        decoding="async"
      />`,
  )}`;
}

/**
 * The app's window with nothing picked yet, as Dropper.tsx draws it: the drop
 * card and the screens found. Sized off the screenshots' width (07-cinema.css,
 * `--u`), so it lines up with the screenshot layers above it.
 */
function appEmpty(project: ProductProject): Renderable {
  return html`<div class="app">
    <div class="app-bar">
      <img src="/${project.name}/${project.product.logo}" alt="" />
      ${project.product.title}
      <span class="app-gear">${icon("gear")}</span>
    </div>
    <div class="app-body">
      <div class="app-card">
        <span class="app-badge">${icon("movie")}</span>
        <span class="app-h">Drop a video here</span>
        <span class="app-p"
          >A movie or an episode, in MP4, MKV or AVI, or a torrent to stream
          (paste a magnet link anywhere). Drop its subtitle file along with it,
          or find subtitles online afterwards.</span
        >
        <span class="app-btn">${icon("folder")} Choose a video</span>
      </div>
      <div class="app-row">
        <span class="app-label">Play on</span>
        <span class="app-link">Look again</span>
        <span class="app-link">${icon("phone")} Phone remote</span>
      </div>
      <div class="app-tiles">
        <span class="app-tile"
          >${icon("cast")}<span><b>Living room</b><small>Chromecast</small></span></span
        >
        <span class="app-tile"
          >${icon("tv")}<span><b>Bedroom TV</b><small>TV</small></span></span
        >
      </div>
    </div>
  </div>`;
}

/** The overlay the app puts over its window while a file is dragged over it. */
function appDrop(): Renderable {
  return html`<div class="app app-drop">
    <span class="app-drop-icon">${icon("download")}</span>
    <span class="app-drop-h">Drop it here</span>
    <span class="app-ghost">${icon("movie")} Big.Buck.Bunny.2008.1080p.mkv</span>
  </div>`;
}

/** What the tour shows for one step, lit while that step is (`t-<n>`). */
function tourLayer(
  project: ProductProject,
  screen: string,
  index: number,
  steps: ProductProject["product"]["steps"],
  sizes: ShotSizes,
): Renderable {
  const n = index + 1;
  if (screen === "empty") {
    // The drop overlay is see-through, so the empty window stays lit under it.
    const under = steps[index + 1]?.screen === "drop";
    return html`<div
      class="cine-layer t-${String(n)}${raw(under ? String(n + 1) : "")}"
      role="img"
      aria-label="${project.product.title} with nothing picked yet: drop a video, or choose one, and the screens it found."
    >
      ${appEmpty(project)}
    </div>`;
  }
  if (screen === "drop") {
    return html`<div
      class="cine-layer t-${String(n)}"
      role="img"
      aria-label="A video dragged over the window: Drop it here."
    >
      ${appDrop()}
    </div>`;
  }
  return html`<div class="cine-layer t-${String(n)}">
    ${shotImages(project, screen, sizes)}
  </div>`;
}

/** The pinned tour: the steps on the left, the app at that step on the right. */
function tour(project: ProductProject, sizes: ShotSizes): Renderable {
  const { steps } = project.product;
  if (steps.length !== 4) {
    throw new Error(`${project.name}: the cinema tour paces exactly 4 steps`);
  }
  return html`<section class="cine-tour" id="how-it-works">
    <div class="cine-tour-pin">
      <div class="cine-tour-head">
        <p class="cine-eyebrow">How it works</p>
        <h2 class="cine-h2">${COUNT[steps.length]} steps.<br />Zero setup.</h2>
      </div>
      <div class="cine-steps">
        <span class="cine-bar" aria-hidden="true"></span>
        <ol>
          ${steps.map(
            (step, i) =>
              html`<li class="cine-step t-${String(i + 1)}">
                <span class="k">${String(i + 1)}</span>
                <div>
                  <h3>${step.title}</h3>
                  <p>${step.text}</p>
                </div>
              </li>`,
          )}
        </ol>
      </div>
      <div class="cine-screen">
        <div class="cine-screen-in">
          ${steps.map((step, i) => {
            if (!step.screen) {
              throw new Error(
                `${project.name}: step "${step.title}" has no screen`,
              );
            }
            return tourLayer(project, step.screen, i, steps, sizes);
          })}
        </div>
      </div>
    </div>
  </section>`;
}

/** The pictures the `show` scenes are drawn with. Decoration: the text says it. */
const SCENES: Record<Exclude<CinemaShow, "trip">, () => Renderable> = {
  subtitles: () => html`<div class="cine-subs slide" aria-hidden="true">
    <p class="cue">— Do you think he'll come?<br />— He always does.</p>
    <span class="cine-timing"><span>Timing</span> <b>−1.2 s</b></span>
  </div>`,
  remote: () => html`<div class="cine-phone-stage" aria-hidden="true">
    <div class="cine-phone">
      <span class="art"></span>
      <b>Big Buck Bunny</b>
      <small>Living room · 4:24 / 9:56</small>
      <span class="track"><span></span></span>
      <span class="ctl">
        <span>−10</span><span class="play">${icon("pause")}</span><span>+10</span>
      </span>
    </div>
  </div>`,
  torrents: () => {
    // Read so far (h), being read (m), asked for (l), the rest not yet.
    const pieces = [..."..............hhhhhhmml.................h"].slice(
      0,
      40,
    );
    return html`<div class="cine-torrent slide" aria-hidden="true">
      <span class="magnet">${icon("magnet")} magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c</span>
      <span class="pieces">
        ${pieces.map((p) => html`<span class="${p === "." ? "" : p}"></span>`)}
      </span>
      <span class="stats"><span>Watching from 35%</span><span>14 peers · 6.2 MB/s</span></span>
    </div>`;
  },
};

function scene(feature: ProductFeature, index: number): Renderable {
  const draw = SCENES[feature.show as keyof typeof SCENES];
  if (!draw) {
    throw new Error(
      `"${feature.title}": the cinema layout draws no ${feature.show} scene`,
    );
  }
  return html`<div class="cine-scene${raw(index % 2 ? " flip" : "")}">
    <div class="cine-copy reveal">
      <p class="cine-eyebrow">${feature.eyebrow ?? ""}</p>
      <h2 class="cine-h2">${feature.headline ?? feature.title}</h2>
      <p>${feature.text}</p>
    </div>
    <div class="cine-vis">${draw()}</div>
  </div>`;
}

/** The computer, the beam to the TV, and the TV lighting when it arrives. */
function trip(feature: ProductFeature): Renderable {
  return html`<section class="cine-trip">
    <p class="cine-eyebrow">${feature.eyebrow ?? ""}</p>
    <h2 class="cine-h2">${feature.headline ?? feature.title}</h2>
    <div class="trip-row" aria-hidden="true">
      <div class="trip-end">
        <span class="trip-box">${icon("laptop")}</span>
        <p>Your computer</p>
      </div>
      <div class="trip-line">
        <span class="trip-beam"></span>
        <span class="trip-dot"></span>
        <small>your Wi-Fi only</small>
      </div>
      <div class="trip-end trip-tv">
        <span class="trip-box"><span class="trip-screen">${icon("play")}</span></span>
        <p>Your TV</p>
      </div>
    </div>
    <p class="cine-trip-text">${feature.text}</p>
  </section>`;
}

export function cinemaPage(
  content: Content,
  assets: Assets,
  project: ProductProject,
  release: DocsRelease,
  sizes: ShotSizes,
): string {
  const { site } = content;
  const { product } = project;
  const cinema = product.cinema;
  if (!cinema) throw new Error(`${project.name}: no cinema block`);
  const repo = project.repo.replace(/\/$/, "");
  const repoName = repo.split("/").pop() ?? "";
  const downloads = productDownloads(project, release);
  const systems = downloads.map((download) => download.label).join(" and ");
  const vendors = downloads
    .map((download) => SYSTEMS[download.os].vendor)
    .sort()
    .join(" or ");
  // The TV shows the app playing: the last screenshot, which the tour ends on.
  const hero = product.screenshots.at(-1)?.shot ?? "";
  const scenes = product.features.filter(
    (feature) => feature.show && feature.show !== "trip",
  );
  const tripFeature = product.features.find((f) => f.show === "trip");
  const cards = product.features.filter((feature) => !feature.show);
  const lines = cinema.headline;

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
    <main id="main" class="cine hue-${product.hue}">
      <section class="cine-hero">
        <a class="cine-pill rise d1" href="${repo}/releases/tag/${release.tag}"
          ><b>new</b
          ><span class="live-stat" data-project="${repoName}"
            >${release.tag} · released ${released(release.published_at)}</span
          ><span class="more">what's new &rarr;</span></a
        >
        <h1 class="cine-title rise d2">
          ${lines.map(
            (line, i) =>
              html`<span${raw(i === lines.length - 1 ? ' class="lit"' : "")}>${line}</span>`,
          )}
        </h1>
        <p class="cine-lede rise d3">${product.lede}</p>
        <div class="rise d4">${downloadBox(project, release, downloads)}</div>
        <p class="cine-meta rise d5">
          free · no account ·
          <a href="${repo}">open source</a>
        </p>

        <figure class="cine-tv">
          <span class="cine-glow" aria-hidden="true"></span>
          <div class="cine-frame">${shotImages(project, hero, sizes)}</div>
          <span class="cine-stand" aria-hidden="true"></span>
        </figure>
      </section>

      <ul class="cine-works reveal" aria-label="Plays on">
        ${cinema.works_with.map((name) => html`<li>${name}</li>`)}
      </ul>

      ${tour(project, sizes)}

      <section class="cine-scenes" id="features">
        ${scenes.map((feature, i) => scene(feature, i))}
      </section>

      ${tripFeature ? trip(tripFeature) : ""}

      <section class="cine-promise">
        <h2>
          ${cinema.promise.map((line) => html`<span class="line">${line}</span>`)}
        </h2>
        <p class="reveal">${cinema.promise_text}</p>
      </section>

      <ul class="cine-cards">
        ${cards.map(
          (feature) =>
            html`<li class="cine-card">
              <h3>${feature.title}</h3>
              <p>${feature.text}</p>
            </li>`,
        )}
      </ul>

      <section class="cine-cta-wrap">
        <div class="cine-cta">
          <h2>${cinema.cta.map((line) => html`<span>${line}</span>`)}</h2>
          ${downloadBox(project, release, downloads, { anchor: false })}
        </div>
      </section>

      <section class="cine-first" id="first-launch">
        <p class="cine-eyebrow">First launch</p>
        <h2 class="cine-h2">One click to confirm.</h2>
        <p class="cine-first-lede">
          ${product.title} is not signed with a paid certificate from
          ${vendors}, so the first time, your computer asks you
          to confirm. It is a one-time thing.
        </p>
        <div class="cine-systems">
          ${product.first_run.map(
            (system) =>
              html`<div class="cine-system">
                <h3>${system.title}</h3>
                <ol>
                  ${system.points.map((point) => html`<li>${point}</li>`)}
                </ol>
              </div>`,
          )}
        </div>
      </section>

      <section class="cine-faq" id="questions">
        <p class="cine-eyebrow">Questions</p>
        <h2 class="cine-h2">Asked before.</h2>
        <div class="cine-faq-list">
          ${product.questions.map(
            (question) =>
              html`<details>
                <summary>${question.q}</summary>
                <p>${question.a}</p>
              </details>`,
          )}
        </div>
      </section>

      <p class="cine-source">
        ${product.title} is free, made by Michel Salib ·
        <a href="${repo}">source code</a> ·
        <a href="${repo}/releases">all versions</a> ·
        <a href="${repo}/issues">report a problem</a>
      </p>
    </main>
    ${footer(site)}`,
  );
}
