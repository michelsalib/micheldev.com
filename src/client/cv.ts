/**
 * CV page behaviour: the timeline spine and the summary strip.
 *
 * Everything here exists because CSS has no primitive for it — measuring real
 * element offsets, and knowing which section the reader is currently in. The
 * scroll-driven fill itself is pure CSS; this only supplies the numbers.
 */

const BLEND = 190; // total px of cross-fade at each colour boundary
const TAIL = 6; // matches the bar's bottom inset in CSS
const READ_LINE_RATIO = 0.5; // where down the viewport the colour boundary sits

const timeline = document.querySelector<HTMLElement>(".tl");
const jobs = Array.from(document.querySelectorAll<HTMLElement>(".job"));
const toc = document.querySelector<HTMLElement>(".toc");
const strip = document.querySelector<HTMLElement>(".toc-in");
const chips = Array.from(
  document.querySelectorAll<HTMLAnchorElement>(".toc a"),
);

let currentId: string | null = null;

/**
 * Measured from the node element rather than assumed, so the spine stays locked
 * to the rings if their size, offset or the type scale ever changes. `.job` is
 * positioned, so the node's offsetTop is relative to it.
 */
function nodeCentre(job: HTMLElement): number {
  const node = job.querySelector<HTMLElement>(".node");
  if (!node) return job.offsetTop + 12;
  return job.offsetTop + node.offsetTop + node.offsetHeight / 2;
}

function layoutSpine(): void {
  if (!timeline || jobs.length === 0) return;

  const centres = jobs.map(nodeCentre);
  const head = centres[0] as number;
  const end = timeline.offsetHeight - TAIL;
  const span = end - head;

  // Pull the bar's start down to the first node, so the ring is not pierced.
  // Rounded to a whole pixel: a fractional top makes the 2px bar straddle two
  // device rows and read as off-centre against the ring.
  timeline.style.setProperty("--spine-top", `${Math.round(head)}px`);
  if (span <= 0) return;

  // Each boundary gets its own fade, capped at 40% of the shorter neighbour so
  // a short band always keeps a solid core instead of being washed out.
  const halfFade = (i: number): number => {
    const prev = (centres[i] as number) - (centres[i - 1] as number);
    const next =
      (i + 1 < centres.length ? (centres[i + 1] as number) : end) -
      (centres[i] as number);
    return Math.min(BLEND / 2, prev * 0.4, next * 0.4);
  };

  const pct = (px: number): number => ((px - head) / span) * 100;
  const stops: string[] = [];

  jobs.forEach((job, i) => {
    const hue = getComputedStyle(job).getPropertyValue("--hue").trim();
    const isLast = i === jobs.length - 1;
    const from = i === 0 ? 0 : pct((centres[i] as number) + halfFade(i));
    const to = isLast ? 100 : pct((centres[i + 1] as number) - halfFade(i + 1));

    stops.push(`${hue} ${from.toFixed(2)}%`);
    stops.push(`${hue} ${Math.max(from, to).toFixed(2)}%`);
  });

  timeline.style.setProperty("--spine", `linear-gradient(${stops.join(", ")})`);

  // Scroll offsets at which the fill is empty and full. Sized to the spine's own
  // height so it advances 1:1 with scrolling, which keeps the colour boundary at
  // a fixed line down the viewport rather than sweeping across it.
  const spineTopDoc = timeline.getBoundingClientRect().top + scrollY + head;
  const readLine = Math.round(innerHeight * READ_LINE_RATIO);
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - innerHeight,
  );

  const from = Math.round(spineTopDoc - readLine);
  let to = Math.round(spineTopDoc - readLine + span);

  // The ideal end can sit past the last scroll position the page can reach — the
  // spine runs almost to the bottom of the document, so its final stretch is
  // only ever seen low in the viewport. Without this clamp the bar tops out
  // short of 100% and the last employer stays grey at the bottom of the page.
  if (to > maxScroll) to = maxScroll;
  if (to <= from) to = from + 1;

  timeline.style.setProperty("--fill-from", `${from}px`);
  timeline.style.setProperty("--fill-to", `${to}px`);
}

/** Shows a fade + chevron on whichever side still has chips hidden. */
function paintEdges(): void {
  if (!toc || !strip) return;
  const max = strip.scrollWidth - strip.clientWidth;
  toc.classList.toggle("can-left", strip.scrollLeft > 2);
  toc.classList.toggle("can-right", max > 2 && strip.scrollLeft < max - 2);
}

/**
 * Brings the active chip into view, centred where there is room. Only called
 * when the active section actually changes, so it never fights a reader who is
 * scrolling the strip by hand.
 */
function revealChip(chip: HTMLElement): void {
  if (!strip) return;
  const max = strip.scrollWidth - strip.clientWidth;
  if (max <= 0) return;
  const target = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
  strip.scrollLeft = Math.max(0, Math.min(max, target));
}

/**
 * Marks the chip for the section being read. Derived from scroll position rather
 * than intersection: the tall employers overlap any sensible observer band, and
 * "topmost visible" then picks the wrong one after a jump-link. The last job
 * whose heading has crossed the reading line is unambiguous.
 */
function trackActive(): void {
  if (jobs.length === 0) return;

  const line = 132; // just below the sticky header + summary bar
  let active = jobs[0] as HTMLElement;
  for (const job of jobs) {
    if (job.getBoundingClientRect().top <= line) active = job;
  }

  if (active.id === currentId) return;
  currentId = active.id;

  for (const chip of chips) {
    if (chip.getAttribute("href") === `#${active.id}`) {
      chip.setAttribute("aria-current", "true");
      revealChip(chip);
    } else {
      chip.removeAttribute("aria-current");
    }
  }
}

function relayout(): void {
  layoutSpine();
  trackActive();
  paintEdges();
}

relayout();
// Fonts land after first paint and shift every offset.
document.fonts?.ready.then(relayout);
addEventListener("resize", relayout);
addEventListener("themechange", layoutSpine);
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  layoutSpine,
);
strip?.addEventListener("scroll", paintEdges, { passive: true });

// One rAF-coalesced read per frame, so scrolling stays cheap.
let queued = false;
addEventListener(
  "scroll",
  () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      trackActive();
    });
  },
  { passive: true },
);
