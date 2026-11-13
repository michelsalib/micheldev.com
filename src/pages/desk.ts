/**
 * A product's page in the desk layout, at /<name>: the app itself is the
 * hero, drawn on a Windows desktop rather than shown in screenshots. Chosen by
 * a `desk` block in the product's YAML; audio-tray is the one page that has it.
 *
 * Same facts as the product layout, from the same block — headline, steps,
 * features, first launch, questions, the synced release and its installers:
 *
 * - The masthead is a desktop: the edge pill on its left edge, the flyout
 *   above the taskbar, and the taskbar buttons by the clock.
 * - A feature with `show` gets a scene (taskbar, pill, warnings, batteries,
 *   keyboards); the rest are cards.
 *
 * Everything the app draws is drawn here in HTML, to the app's own measures
 * (audio-tray's src/flyout/theme.rs, src/pill/draw.rs and the TAP's
 * decorate.rs): the 52-px pill column, the 3×16 selection bar, the 128×32
 * scroll readout, the banners' colours and wording. Its surfaces are dark in
 * both of the site's themes, as the app's are; the desktop behind them, the
 * taskbar and the page follow the site's theme.
 *
 * Motion is CSS (08-desk.css): an entrance on load, a few loops, and scroll-
 * driven timelines. Without them, under reduced motion or in print, every
 * element rests where its motion ends. No inline styles, which the CSP voids.
 */

import type {
  Content,
  DeskShow,
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
  SYSTEMS,
} from "./product.ts";

// Strokes in the spirit of Segoe Fluent Icons, which only Windows has.
const ICON = {
  volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/></svg>`,
  earbuds: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="13" r="4"/><circle cx="17" cy="13" r="4"/></svg>`,
  headset: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M4 3l16 18"/></svg>`,
  speakers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="7" r="1"/></svg>`,
  tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="1.5"/><path d="M8 21h8"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 4v16M19 4 8 12l11 8z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M19 4v16M5 4l11 8-11 8z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/></svg>`,
  hangUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V15l-3 1.5z"/></svg>`,
  wave: `<svg viewBox="0 0 56 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M2 12c6-14 12-14 18 0s12 14 18 0 12-14 16 0"/></svg>`,
  wheel: `<svg viewBox="0 0 22 32" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="1" y="1" width="20" height="30" rx="10"/><path class="tick" d="M11 8v6" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  keyboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>`,
  mouse: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v3"/></svg>`,
  batteryLow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M21.5 10.5v3"/><rect x="5" y="9.5" width="3" height="5" rx=".5" fill="currentColor" stroke="none"/></svg>`,
  laptop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>`,
} as const;

const icon = (name: keyof typeof ICON) => raw(ICON[name]);

/** The progress ring round a cover in the pill: the track, then the accent arc. */
const RING = raw(
  `<svg class="ring" viewBox="0 0 45 45" aria-hidden="true"><circle class="ring-bg" cx="22.5" cy="22.5" r="19.5"/><circle class="ring-fg" cx="22.5" cy="22.5" r="19.5" transform="rotate(-90 22.5 22.5)"/></svg>`,
);

/**
 * People in the call, invented. Initials on the pill's palette (draw.rs), the
 * first one talking.
 */
const CALL = [
  { initial: "A", name: "Alex", tone: 1 },
  { initial: "M", name: "Maya", tone: 5 },
  { initial: "J", name: "Jo", tone: 3 },
];

function faces(size: "s" | "m" | "l"): Renderable {
  return html`<span class="faces faces-${size}">
    ${CALL.map(
      (person, i) =>
        html`<span class="face tone-${String(person.tone)}${raw(i === 0 ? " lit" : " dim")}">${person.initial}</span>`,
    )}
  </span>`;
}

/** A round device button, as on the pill. */
function disc(name: keyof typeof ICON, live = false): Renderable {
  return html`<span class="disc">${icon(name)}${live ? html`<span class="live"></span>` : ""}</span>`;
}

/** The quiet column on the left edge: covers in rings, the call, the devices. */
function column({ call }: { call: boolean }): Renderable {
  return html`<div class="col">
    <div class="col-pill quiet">
      <span class="col-cover"><span class="cover cover-a"></span>${RING}</span>
      <span class="col-cover"
        ><span class="cover cover-b"></span><span class="badge">LIVE</span></span
      >
    </div>
    ${
      call
        ? html`<div class="col-call">
            <div class="col-pill normal">
              <span class="speaker"><span class="pulse"></span></span>
              ${faces("l")} ${disc("mic", true)}
            </div>
            <span class="tag normal">${CALL[0]?.name ?? ""}</span>
          </div>`
        : ""
    }
    <div class="col-pill quiet">
      ${disc(call ? "headset" : "earbuds")} ${disc("mic", call)}
    </div>
  </div>`;
}

/** The flyout, top to bottom in the order the app lays it out (layout.rs). */
function flyout(): Renderable {
  const slider = (glyph: keyof typeof ICON, level: number) =>
    html`<div class="fl-slider">
      ${icon(glyph)}
      <span class="track"><span class="fill v${String(level)}"></span></span>
      <span class="val">${String(level)}</span>
    </div>`;
  const app = (name: string, tone: string, level: number) =>
    html`<div class="fl-app">
      <span class="app-ic ${tone}"></span><span class="app-name">${name}</span>
      <span class="track"><span class="fill v${String(level)}"></span></span>
      <span class="val">${String(level)}</span>
    </div>`;
  return html`<div class="flyout acrylic">
    <div class="fl-now">
      <span class="cover cover-a"></span>
      <span class="fl-text"><b>Night Drive</b><small>Low Orbit</small></span>
      <span class="fl-btns">${icon("prev")}${icon("pause")}${icon("next")}</span>
    </div>
    <div class="fl-voice">
      ${faces("s")}
      <span class="fl-text"><b>Discord · General</b><small>Alex talking</small></span>
      ${disc("mic")}
    </div>
    <div class="fl-hdr"><span>Output</span><small>2 devices ⌄</small></div>
    ${slider("volume", 30)}
    <div class="fl-row sel">
      ${icon("earbuds")}<span class="fl-name">Casque (WF-1000XM5)</span
      ><small>100%</small>
    </div>
    <div class="fl-hdr"><span>Input</span></div>
    ${slider("mic", 100)}
    <div class="fl-row sel">
      ${icon("mic")}<span class="fl-name">Microphone array (Intel® Smart Sound)</span>
    </div>
    <div class="fl-hdr"><span>Apps</span></div>
    ${app("Spotify", "app-green", 100)} ${app("Discord", "app-blurple", 70)}
    <div class="fl-foot">
      ${icon("close")}<span>Quit Audio Tray</span
      ><span class="fl-gear">${icon("gear")}</span>
    </div>
  </div>`;
}

/** The two taskbar buttons on the accent, the input's recording dot lit. */
function strip({ hover, rec }: { hover: boolean; rec: boolean }): Renderable {
  return html`<span class="strip">
    <span class="seg${raw(hover ? " hover" : "")}">${icon("earbuds")}</span>
    <span class="seg">${icon("mic")}${rec ? html`<span class="rec"></span>` : ""}</span>
  </span>`;
}

function desktop(title: string): Renderable {
  return html`<figure
    class="desk-screen"
    role="img"
    aria-label="${title} on a Windows desktop: the edge pill on the left edge with a song, a call and the devices, the flyout open above the taskbar, and the two taskbar buttons by the clock."
  >
    <div class="wall">
      <div class="in-pill">${column({ call: true })}</div>
      <div class="in-flyout">${flyout()}</div>
      <div class="taskbar">
        ${strip({ hover: false, rec: true })}
        <span class="clock">22:48<br />07/11/2026</span>
      </div>
    </div>
  </figure>`;
}

/** The pictures the `show` scenes are drawn with. Decoration: the text says it. */
const SCENES: Record<DeskShow, () => Renderable> = {
  taskbar: () => html`<div class="stage stage-taskbar wall" aria-hidden="true">
    <p class="stage-label">Click → next device</p>
    <div class="cycle acrylic">
      <span class="fl-row sel cyc">${icon("earbuds")}<span class="fl-name">Casque (WF-1000XM5)</span></span>
      <span class="fl-row sel cyc">${icon("speakers")}<span class="fl-name">Speakers (Realtek)</span></span>
      <span class="fl-row sel cyc">${icon("tv")}<span class="fl-name">LG TV (HDMI)</span></span>
    </div>
    <span class="wheel">${icon("wheel")}</span>
    <div class="osd acrylic">
      ${icon("earbuds")}
      <span class="osd-track"><span class="osd-fill"></span></span>
      <span class="osd-num"></span>
    </div>
    <div class="taskbar">${strip({ hover: true, rec: false })}<span class="clock">22:48<br />07/11/2026</span></div>
  </div>`,
  pill: () => html`<div class="stage stage-pill wall" aria-hidden="true">
    <div class="stage-col">${column({ call: false })}</div>
    <div class="card normal edge-in">
      <div class="card-row">
        <span class="cover cover-a"></span>
        <span class="card-text"
          ><b>Night Drive</b><span>Low Orbit</span><small>YouTube Music</small
          ><span class="card-btns">${icon("prev")}${icon("pause")}${icon("next")}</span></span
        >
        <span class="card-bar"><span class="bar-fill"></span></span>
      </div>
      <div class="card-row">
        <span class="cover cover-b">${icon("wave")}</span>
        <span class="card-text"
          ><b>Building a synth from scratch</b><span>Workbench</span
          ><small>Twitch <span class="badge">LIVE</span></small
          ><span class="card-btns"
            ><span class="off">${icon("prev")}</span>${icon("pause")}<span class="off"
              >${icon("next")}</span
            ></span
          ></span
        >
        <span class="card-bar live-bar"><span class="bar-fill"></span></span>
      </div>
      <div class="card-call">
        ${faces("m")}
        <span class="fl-text"><b>Discord · General</b><small>Alex talking</small></span>
        <span class="disc leave">${icon("hangUp")}</span>${disc("mic")}
      </div>
      <div class="card-devs">
        ${disc("earbuds")}<span>Casque (WF-1000…</span>${disc("mic")}<span
          >Microphone arr…</span
        >
      </div>
    </div>
    <p class="stage-note">the quiet column on the edge<br />point at it → the card</p>
  </div>`,
  warnings: () => html`<div class="stage stage-warn wall" aria-hidden="true">
    <span class="banner warn edge-in d1">${icon("micOff")}You're muted in Teams · click to unmute</span>
    <span class="banner warn edge-in d2">${icon("speakers")}Now on Speakers · Casque (WF-1000XM5) disconnected</span>
    <span class="banner alert edge-in d3">${icon("mic")}Chrome is listening · click to mute</span>
  </div>`,
  batteries: () => html`<div class="stage stage-batt wall" aria-hidden="true">
    <span class="banner warn edge-in d1">${icon("batteryLow")}BlackShark V2 Pro battery low · 12%</span>
    <div class="card normal batt-card edge-in d2">
      <div class="card-devs">
        ${disc("headset")}<span>BlackShark V2 Pro</span>${disc("mic")}<span
          >BlackShark V2 Pro</span
        >
      </div>
      <div class="batt-lines">
        ${BATTERIES.map(
          (b) =>
            html`<span class="batt${raw(b.low ? " low" : "")}"
              >${icon(b.icon)}<span class="batt-name">${b.name}</span
              ><b>${String(b.level)}%</b></span
            >`,
        )}
      </div>
    </div>
    <div class="toast acrylic edge-in d3">
      <span class="toast-app"><span class="toast-ic">${icon("headset")}</span>Audio Tray</span>
      <b>BlackShark V2 Pro battery low</b>
      <span>12% left. Time to charge it.</span>
    </div>
  </div>`,
  keyboards: () => html`<div class="stage stage-keys wall" aria-hidden="true">
    <div class="kb-banners">
      <span class="banner normal kb kb-a">${icon("keyboard")}Built-in keyboard · French</span>
      <span class="banner normal kb kb-b">${icon("keyboard")}MX Keys · US</span>
    </div>
    <div class="kb-desk">
      <span class="kb-dev kb-a">${icon("laptop")}<small>Built-in keyboard</small><b>AZERTY</b></span>
      <span class="kb-dev kb-b">${icon("keyboard")}<small>MX Keys</small><b>QWERTY</b></span>
    </div>
    <p class="stage-note">type on a keyboard → its layout</p>
  </div>`,
};

/**
 * Batteries on the pill's card, two to a line, amber when low (draw.rs's
 * battery_lines). Devices of the kinds it reads: Bluetooth, a Logitech
 * receiver's, a Razer headset's.
 */
const BATTERIES: {
  name: string;
  icon: keyof typeof ICON;
  level: number;
  low?: boolean;
}[] = [
  { name: "MX Master 3S", icon: "mouse", level: 82 },
  { name: "MX Keys", icon: "keyboard", level: 64 },
  { name: "WF-1000XM5", icon: "earbuds", level: 70 },
  { name: "BlackShark V2 Pro", icon: "headset", level: 12, low: true },
];

function scene(feature: ProductFeature, index: number): Renderable {
  const draw = SCENES[feature.show as DeskShow];
  if (!draw) {
    throw new Error(
      `"${feature.title}": the desk layout draws no ${feature.show} scene`,
    );
  }
  return html`<div class="desk-scene${raw(index % 2 ? " flip" : "")}">
    <div class="desk-copy reveal">
      <p class="desk-eyebrow">${feature.eyebrow ?? ""}</p>
      <h2 class="desk-h2">${feature.headline ?? feature.title}</h2>
      <p>${feature.text}</p>
    </div>
    <div class="reveal">${draw()}</div>
  </div>`;
}

export function deskPage(
  content: Content,
  assets: Assets,
  project: ProductProject,
  release: DocsRelease,
): string {
  const { site } = content;
  const { product } = project;
  const desk = product.desk;
  if (!desk) throw new Error(`${project.name}: no desk block`);
  const repo = project.repo.replace(/\/$/, "");
  const repoName = repo.split("/").pop() ?? "";
  const downloads = productDownloads(project, release);
  const systems = downloads.map((download) => download.label).join(" and ");
  const vendors = downloads
    .map((download) => SYSTEMS[download.os].vendor)
    .sort()
    .join(" or ");
  const scenes = product.features.filter((feature) => feature.show);
  const cards = product.features.filter((feature) => !feature.show);
  const lines = desk.headline;

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
    <main id="main" class="desk hue-${product.hue}">
      <section class="desk-hero">
        <span class="desk-glow" aria-hidden="true"></span>
        <div class="desk-hero-copy">
          <a class="desk-new rise d1" href="${repo}/releases/tag/${release.tag}"
            ><b>new</b
            ><span class="live-stat" data-project="${repoName}"
              >${release.tag} · released ${released(release.published_at)}</span
            ><span class="more">what's new &rarr;</span></a
          >
          <h1 class="desk-title rise d2">
            ${lines.map(
              (line, i) =>
                html`<span${raw(i === lines.length - 1 ? ' class="lit"' : "")}>${line}</span>`,
            )}
          </h1>
          <p class="desk-lede rise d3">${product.lede}</p>
          <div class="rise d4">${downloadBox(project, release, downloads)}</div>
          <p class="desk-meta rise d5">
            free · no account · no ads ·
            <a href="${repo}">open source</a>
          </p>
        </div>
        <div class="desk-hero-pic">${desktop(product.title)}</div>
      </section>

      <ul class="desk-works" aria-label="Works with">
        ${desk.works_with.map((name) => html`<li>${name}</li>`)}
      </ul>

      <section class="desk-steps" id="how-it-works">
        <p class="desk-eyebrow">How it works</p>
        <ol>
          ${product.steps.map(
            (step, i) =>
              html`<li class="reveal">
                <span class="k">${String(i + 1)}</span>
                <h3>${step.title}</h3>
                <p>${step.text}</p>
              </li>`,
          )}
        </ol>
      </section>

      <section class="desk-scenes" id="features">
        ${scenes.map((feature, i) => scene(feature, i))}
      </section>

      <section class="desk-rest">
        <h2 class="desk-h2 reveal">And the rest of it.</h2>
        <ul class="desk-cards">
          ${cards.map(
            (feature) =>
              html`<li class="desk-card reveal">
                <h3>${feature.title}</h3>
                <p>${feature.text}</p>
              </li>`,
          )}
        </ul>
      </section>

      <section class="desk-first" id="first-launch">
        <p class="desk-eyebrow">First launch</p>
        <h2 class="desk-h2">One click to confirm.</h2>
        <p class="desk-first-lede">
          ${product.title} is not signed with a paid certificate from
          ${vendors}, so the first time, your computer asks you
          to confirm. It is a one-time thing.
        </p>
        <div class="desk-systems">
          ${product.first_run.map(
            (system) =>
              html`<div class="desk-system reveal">
                <h3>${system.title}</h3>
                <ol>
                  ${system.points.map((point) => html`<li>${point}</li>`)}
                </ol>
              </div>`,
          )}
        </div>
      </section>

      <section class="desk-faq" id="questions">
        <p class="desk-eyebrow">Questions</p>
        <h2 class="desk-h2">Asked before.</h2>
        <div class="desk-faq-list">
          ${product.questions.map(
            (question) =>
              html`<details>
                <summary>${question.q}</summary>
                <p>${question.a}</p>
              </details>`,
          )}
        </div>
      </section>

      <section class="desk-cta-wrap">
        <div class="desk-cta reveal">
          <span class="desk-glow" aria-hidden="true"></span>
          <h2>${desk.cta.map((line) => html`<span>${line}</span>`)}</h2>
          ${downloadBox(project, release, downloads, { anchor: false })}
          <p class="desk-meta">
            ${release.tag} · released ${released(release.published_at)} ·
            <a href="${repo}/releases/tag/${release.tag}">what's new</a>
          </p>
        </div>
      </section>

      <p class="desk-source">
        ${product.title} is free, made by Michel Salib ·
        <a href="${repo}">source code</a> ·
        <a href="${repo}/releases">all versions</a> ·
        <a href="${repo}/issues">report a problem</a>
      </p>
    </main>
    ${footer(site)}`,
  );
}
