/**
 * The link-preview card, as a page that gets photographed.
 *
 * Every platform that unfurls a link wants a raster image, so this is the one
 * thing on the site that cannot be HTML at the end. It is still HTML at the
 * start: scripts/pdf.ts screenshots it at 1200×630 with the same headless Chrome
 * that prints the PDFs, which means the card is rendered from cv.yaml and can
 * never describe a job I no longer have.
 *
 * Written to .print/, never to dist/ — like the CV print copies, for the same
 * reason: nothing here needs to be a public URL. The only artefact that reaches
 * dist/ is the PNG.
 *
 * Self-contained on purpose. It links no stylesheet and reuses no token: at this
 * size the composition is four objects and a portrait, the palette is fixed
 * because a preview card has no reader and therefore no theme, and it must
 * render identically whatever the site's CSS is doing this month. The @font-face
 * rules point into dist/ because the print server resolves everything but the
 * card itself from there.
 */

import { type Content, careerYears } from "../content.ts";
import { html, type Renderable, raw } from "../html.ts";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The 45° cut, echoing the one on the CV masthead. */
const CUT = 92;

const STYLE = `
  @font-face {
    font-family: "USans";
    src: url("/assets/fonts/ubuntu-sans.woff2") format("woff2-variations");
    font-weight: 100 800;
    font-display: block;
  }
  @font-face {
    font-family: "USansMono";
    src: url("/assets/fonts/ubuntu-sans-mono.woff2") format("woff2-variations");
    font-weight: 100 800;
    font-display: block;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: ${OG_WIDTH}px;
    height: ${OG_HEIGHT}px;
    overflow: hidden;
  }

  body {
    position: relative;
    background: #0d0b14;
    color: #efedf7;
    font-family: "USans", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* The same faint grid the homepage hero carries, so a card and the page it
     links to look like one place. */
  .field {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(to right, #241f33 1px, transparent 1px),
      linear-gradient(to bottom, #241f33 1px, transparent 1px);
    background-size: 76px 76px;
    opacity: 0.5;
  }

  .glow {
    position: absolute;
    top: -180px;
    right: 120px;
    width: 620px;
    height: 620px;
    border-radius: 50%;
    background: radial-gradient(circle, rgb(160 140 255 / 0.22), transparent 68%);
  }

  .card { position: relative; height: 100%; display: flex; }

  .copy {
    padding: 76px 0 76px 76px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 26px;
    width: 700px;
  }

  .eyebrow {
    font-family: "USansMono", ui-monospace, monospace;
    font-size: 22px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #a6a1bb;
  }

  h1 {
    font-size: 96px;
    line-height: 0.98;
    font-weight: 700;
    letter-spacing: -0.03em;
  }

  .role {
    font-size: 42px;
    font-weight: 600;
    letter-spacing: -0.015em;
    color: #a08cff;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 8px;
    font-family: "USansMono", ui-monospace, monospace;
    font-size: 24px;
    color: #efedf7;
  }
  .foot .rule { width: 96px; height: 2px; background: #a08cff; }
  .foot .dim { color: #a6a1bb; }

  /* Bleeds off the right edge and is cut on its upper-left at 45°, which is the
     one geometric rule the CV masthead is built on. */
  .portrait {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 470px;
    clip-path: polygon(${CUT}px 0, 100% 0, 100% 100%, 0 100%, 0 ${CUT}px);
  }
  .portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: 50% 22%;
  }
  /* Ties the photograph to the plate instead of letting it sit on top of it. */
  .portrait .tint {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to right, #0d0b14 0%, rgb(13 11 20 / 0.35) 34%, transparent 62%),
      linear-gradient(to top, rgb(13 11 20 / 0.55), transparent 55%);
  }
`;

export function ogCard(content: Content): string {
  const { cv, site } = content;

  return String(
    html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${cv.person.name} — link preview card</title>
    <style>
      ${raw(STYLE)}
    </style>
  </head>
  <body>
    <div class="field"></div>
    <div class="glow"></div>
    <div class="card">
      <div class="copy">
        <p class="eyebrow">${cv.person.location ? locationLine(content) : ""}</p>
        <h1>${cv.person.name}</h1>
        <p class="role">${headlineLine(content)}</p>
        <!-- The domain, and the one claim worth putting under a name on a card
             someone is deciding whether to click. Counted, not written. -->
        <p class="foot">
          <span class="rule"></span>
          <span>${site.hosts.canonical}</span>
          <span class="dim">·</span>
          <span class="dim">${careerYears(cv)} years shipping</span>
        </p>
      </div>
      <div class="portrait">
        <img src="/assets/img/portrait-1040.webp" alt="" />
        <span class="tint"></span>
      </div>
    </div>
  </body>
</html>`,
  );
}

/** English only: a preview card is served to whoever pasted the link. */
function locationLine({ cv }: Content): Renderable {
  return typeof cv.person.location === "string"
    ? cv.person.location
    : (cv.person.location?.en ?? "");
}

function headlineLine({ cv }: Content): Renderable {
  return typeof cv.headline === "string" ? cv.headline : cv.headline.en;
}
