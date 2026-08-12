/**
 * CV page behaviour: the timeline spine and the summary strip.
 *
 * Everything here exists because CSS has no primitive for it — measuring real
 * element offsets, and knowing which section the reader is currently in. The
 * scroll-driven fill itself is pure CSS; this only supplies the numbers.
 */

const BLEND = 190; // total px of cross-fade at each colour boundary
const SETTLE = 40; // px of scroll still to spare once the spine is full
const READ_LINE_RATIO = 0.5; // where down the viewport the colour boundary sits
const LIT_SPAN = 3; // half-width, in % of view progress, of a node's light-up

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

  // The rail ends a short run-out past the last node rather than at the foot of
  // its text — see --runout in 04-cv.css for why. Read from CSS so the run-out
  // and the end-cap that marks it stay one number.
  const runout =
    Number.parseFloat(
      getComputedStyle(timeline).getPropertyValue("--runout"),
    ) || 0;
  const end = (centres[centres.length - 1] as number) + runout;
  const span = end - head;

  // Pull the bar's start down to the first node, so the ring is not pierced.
  // Rounded to a whole pixel: a fractional top makes the 2px bar straddle two
  // device rows and read as off-centre against the ring.
  timeline.style.setProperty("--spine-top", `${Math.round(head)}px`);
  if (span <= 0) return;
  timeline.style.setProperty("--spine-h", `${Math.round(span)}px`);

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

  // The ideal end can still sit past the last scroll position the page can
  // reach, on a tall viewport or a short document. Without a clamp the bar tops
  // out short of 100% and the last employer stays grey. Clamping to SETTLE short
  // of the bottom rather than to the bottom itself matters: landing exactly on
  // maxScroll means the spine only completes on the final pixel of the page —
  // which reads as a spine frozen just shy of its own tip, because the reader
  // runs out of scroll at the same instant. The cost is that the boundary drifts
  // from the reading line over the clamped stretch, which is far less visible.
  if (to > maxScroll - SETTLE) to = maxScroll - SETTLE;
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

/**
 * Hands the reading line to the node light-up in CSS, so READ_LINE_RATIO stays
 * the only place that constant lives.
 *
 * A node's `view()` progress is a `cover` range of viewport + node height, so
 * with a 14px node it is just how far up the viewport the node has travelled —
 * and it runs the opposite way to the ratio, 0 being the bottom edge. Hence
 * 1 - ratio. The node-height term cancels exactly at 0.5 and is a fraction of a
 * percent either side of it, so this needs no remeasuring on resize.
 */
function primeLitRange(): void {
  const mid = (1 - READ_LINE_RATIO) * 100;
  const set = (name: string, value: number): void =>
    timeline?.style.setProperty(name, `${value.toFixed(1)}%`) as undefined;

  // A node lights as the front sweeps through it, so its range straddles the
  // line.
  set("--lit-a", mid - LIT_SPAN);
  set("--lit-b", mid + LIT_SPAN);

  // The end-cap is where the front stops rather than something it passes, so its
  // range ends on the line: it is finished the moment the fill lands on it,
  // instead of being caught half-lit with the spine already full.
  set("--cap-a", mid - 2 * LIT_SPAN);
  set("--cap-b", mid);
}

primeLitRange();
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
