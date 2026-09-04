/**
 * Turns the masthead portrait's characters, like the flaps on a station board.
 *
 * Two phases. On load every cell starts somewhere random on the reel, turns
 * forward only — a flap cannot go backwards — and stops on the character the
 * build rendered for it; cells owing more turns land later, which is where the
 * cascade comes from, and nothing here schedules it. After that the board never
 * quite stops: a few flaps at a time wake up and turn a full revolution, so they
 * come back to the character they were already showing and the picture is never
 * degraded by its own idling.
 *
 * The picture is already correct in the HTML, so all of this is decoration on
 * top of a finished page and every path out of it leaves the art as it arrived.
 * There is no DOM per character either: the whole grid is one `<pre>` whose text
 * is rewritten each turn, which is one string of a few thousand characters and
 * cheaper than the 2 800 spans the obvious implementation wants.
 */

import { REEL } from "../ramp.ts";

/** Milliseconds a flap is held before it turns. Mechanical, so no easing. */
const TICK = 55;

/**
 * How late is too late to start.
 *
 * The scripts are deferred, so on any normal load this runs before the first
 * paint and the reader never sees the settled picture it is about to scramble.
 * On a slow enough connection the parser can paint the body first, and then
 * scrambling would rewind something the reader is already looking at. This is an
 * entrance; if the entrance has been missed, there is nothing to make up for.
 */
const TOO_LATE = 1200;

/**
 * Ticks between idle batches, and the share of the grid each one wakes.
 *
 * A batch every 32 ticks and a revolution taking 22 of them leaves the board
 * genuinely still between batches, which is what makes the idling read as a few
 * flaps turning now and then rather than as a permanent shimmer. At 16 there was
 * something moving in 66 frames out of 67.
 */
const IDLE_EVERY = 32;
const IDLE_SHARE = 0.0012;

type Board = {
  el: HTMLElement;
  cols: number;
  rows: number;
  /** Where each cell is on the reel now. */
  at: Uint8Array;
  /** How many turns it still owes. */
  left: Uint8Array;
  /** Where it has to come to rest. */
  target: Uint8Array;
  /** Flaps woken per idle batch, from this grid's size. */
  batch: number;
};

/**
 * Reads one `<pre>` into a board.
 *
 * The rendered art has its trailing spaces stripped — they would be a third of
 * the payload — so the lines are ragged, and a ragged board is not a board. The
 * grid is squared back up to `data-cols` here, where it costs nothing: the
 * stylesheet gives the element its width, so trailing spaces change no layout.
 */
function read(el: HTMLElement): Board | null {
  const cols = Number(el.dataset["cols"]);
  const lines = (el.textContent ?? "").split("\n");
  if (!cols || lines.length < 2) return null;

  const rows = lines.length;
  const cells = cols * rows;
  const at = new Uint8Array(cells);
  const left = new Uint8Array(cells);
  const target = new Uint8Array(cells);

  for (let row = 0; row < rows; row++) {
    const line = lines[row] as string;
    for (let col = 0; col < cols; col++) {
      const rest = REEL.indexOf(line[col] ?? " ");
      if (rest < 0) return null; // a ramp character the reel does not carry
      const i = row * cols + col;
      const start = Math.floor(Math.random() * REEL.length);
      at[i] = start;
      target[i] = rest;
      // A cell that happens to start on its target takes the long way round
      // rather than sitting still while everything around it moves.
      left[i] = (rest - start + REEL.length) % REEL.length || REEL.length;
    }
  }

  return {
    el,
    cols,
    rows,
    at,
    left,
    target,
    batch: Math.max(2, Math.round(cells * IDLE_SHARE)),
  };
}

function paint(board: Board): void {
  const lines: string[] = [];
  for (let row = 0; row < board.rows; row++) {
    let line = "";
    for (let col = 0; col < board.cols; col++) {
      line += REEL[board.at[row * board.cols + col] as number];
    }
    lines.push(line);
  }
  board.el.textContent = lines.join("\n");
}

/** One turn of every flap that still owes one. Returns false when all have. */
function turn(board: Board): boolean {
  let moved = false;
  for (let i = 0; i < board.left.length; i++) {
    const owed = board.left[i] as number;
    if (owed === 0) continue;
    board.at[i] = ((board.at[i] as number) + 1) % REEL.length;
    board.left[i] = owed - 1;
    moved = true;
  }
  if (moved) paint(board);
  return moved;
}

/**
 * Wakes a few settled flaps for a full revolution.
 *
 * A whole revolution because a flap only turns one way: anything short of the
 * full round would leave the cell on a tone it was not asked for, and a picture
 * that drifts as it idles is a worse picture. Blank cells are left alone — the
 * flicker belongs to the face, and a stray glyph out in the bare plate reads as
 * dirt rather than as machinery.
 */
function wake(board: Board): void {
  for (let n = 0; n < board.batch; n++) {
    const i = Math.floor(Math.random() * board.left.length);
    if (board.left[i] === 0 && board.target[i] !== 0) {
      board.left[i] = REEL.length;
    }
  }
}

if (
  !matchMedia("(prefers-reduced-motion: reduce)").matches &&
  performance.now() < TOO_LATE
) {
  const boards = [...document.querySelectorAll<HTMLElement>(".art")]
    .map(read)
    .filter((board): board is Board => board !== null);

  if (boards.length) {
    // Scrambled in the same task that read them, so no frame is ever painted
    // between the settled picture and the start of the roll.
    for (const board of boards) paint(board);

    // The idle phase runs for as long as the page is open, so it stops while the
    // plate is scrolled off it. A Set rather than a flag because the callback
    // only reports the entries that changed, and because the rendering the width
    // is not showing is `display: none` and never intersects at all.
    const onScreen = new Set<Element>();
    const observed = "IntersectionObserver" in window;
    if (observed) {
      const watch = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target);
          else onScreen.delete(entry.target);
        }
      });
      for (const board of boards) watch.observe(board.el);
    }

    let ticks = 0;
    let revealing = true;
    setInterval(() => {
      // The reveal is not gated on the observer: it has nothing to report yet
      // when the first tick runs, and holding the scrambled board for a frame
      // waiting for it is worse than painting one nobody is looking at.
      if (!revealing && observed && !onScreen.size) return;
      ticks++;
      let moving = false;
      for (const board of boards) moving = turn(board) || moving;
      if (!moving) revealing = false;
      if (!revealing && ticks % IDLE_EVERY === 0) {
        for (const board of boards) wake(board);
      }
    }, TICK);
  }
}
