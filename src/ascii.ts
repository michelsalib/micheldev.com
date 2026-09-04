/**
 * The portrait, as characters.
 *
 * The homepage masthead does not serve the photograph — it renders it as an
 * 80 × 35 grid of ASCII, generated here at build time from the very file /cv
 * serves. That is the whole point of doing it in the build rather than checking
 * a .txt into the repository: replace the photograph and both pages change
 * together, with nothing to remember.
 *
 * Which is what put an image decoder in the build, against the note that used to
 * sit in build.ts saying there was no image tooling here and no reason to add
 * any. The reason is this file. sharp is a devDependency, so it is installed by
 * CI and by a local build and is absent from the runtime image, which copies
 * dist/ and two modules and still has no node_modules at all.
 *
 * The hard part is not the ramp, it is the wall. The photograph is lit from the
 * left, so the paint runs from near-white at the top left to a mid grey on the
 * right, and the lit side of his face sits inside that same range — any single
 * threshold that blanks the wall also blanks his cheek, and the first few
 * attempts all produced a face with a hole in it. So the wall is found rather
 * than thresholded: a quadratic is least-squares fitted to the border ring,
 * pixels near that surface are wall candidates, a flood fill from the border
 * keeps only the ones actually connected to it, and the ramp is then normalised
 * over what is left. The face gets the whole ramp; the wall gets spaces.
 */

import sharp from "sharp";
import { RAMP } from "./ramp.ts";

/**
 * The photograph the CV masthead serves, at its largest width. One source for
 * both pages, so they cannot drift.
 */
const SOURCE = "src/images/portrait-1040.webp";

/**
 * The framing, as fractions of the source rather than pixels, so re-exporting
 * the photograph at a different size changes nothing here.
 *
 * It is tight, and deliberately tighter than the crop the CV's `object-position`
 * takes. A character cell is about 11px on a desktop masthead, and below roughly
 * 6px the ramp stops resolving into a face at all — so where the photograph can
 * afford a comfortable margin of wall, the art spends it on his head instead.
 * The crop cuts a little off the crown, which the mask in the stylesheet then
 * fades into the plate.
 *
 * These four numbers are a judgement about *this* photograph. A genuinely
 * different one — further away, off-centre, a different aspect — will want them
 * looked at again; everything else in this file will not.
 */
const CROP = { x: 0.192, y: 0.058, w: 0.779, h: 0.673 };

/**
 * The resolution the mask and the ramp are computed at, before the cells are
 * averaged down.
 *
 * Well above the 80 columns that come out, because the flood fill has to be able
 * to follow the soft edge between hair and wall. Run at cell resolution it leaks
 * through that edge and eats half his head.
 */
const RES = 480;

/** Lifts the midtones a little; the beard is otherwise a solid block of @. */
const GAMMA = 1.05;

/**
 * How the wall is decided.
 *
 * `tol` is how far a pixel may sit from the fitted surface and still count as
 * wall. `creep` is the extra licence the fill has to step into a pixel that
 * merely matches the wall pixel it came from, which is what lets it follow the
 * soft cast shadow behind his shoulder that no quadratic fits. `slack` is the
 * leash on that: without it the creep walks down the shadow's gradient, out onto
 * his temple, and keeps going.
 */
const WALL = { tol: 0.05, creep: 0.012, slack: 0.22 };

/** Percentiles of the *subject* clipped to black and to white. */
const CLIP = { low: 0.02, high: 0.985 };

/**
 * The two renderings, and why there are two.
 *
 * Not one scaled: 80 columns inside a phone's 330px column puts the cells around
 * 4px, where the ramp is mush. The narrow one is a coarser render of the same
 * crop, and the stylesheet swaps them at the same 880px breakpoint that moves
 * the figures out from under the picture.
 *
 * The row counts are not free either — the cells are twice as tall as they are
 * wide (see `line-height: 2ch` in the stylesheet), so cols / (rows × 2) has to
 * come out at the crop's own aspect ratio or the face arrives stretched.
 */
export const ART = {
  wide: { cols: 80, rows: 35 },
  narrow: { cols: 54, rows: 24 },
} as const;

export type Art = { wide: string; narrow: string };

/** Gauss-Jordan on a tiny dense system — six unknowns, once per build. */
function solve(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i] as number]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      const candidate = Math.abs((m[row] as number[])[col] as number);
      if (candidate > Math.abs((m[pivot] as number[])[col] as number)) {
        pivot = row;
      }
    }
    [m[col], m[pivot]] = [m[pivot] as number[], m[col] as number[]];

    const lead = (m[col] as number[])[col] as number;
    if (lead === 0) continue;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = ((m[row] as number[])[col] as number) / lead;
      for (let k = col; k <= n; k++) {
        (m[row] as number[])[k] =
          ((m[row] as number[])[k] as number) -
          factor * ((m[col] as number[])[k] as number);
      }
    }
  }

  return m.map((row, i) => (row[n] as number) / (row[i] as number));
}

/**
 * Decodes the crop to greyscale, separates wall from subject, and returns one
 * value per pixel: 1 where the paper shows through, and the subject's own
 * luminance normalised over the subject alone everywhere else.
 */
async function analyse(): Promise<{ value: Float64Array; size: number }> {
  const source = sharp(SOURCE);
  const meta = await source.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error(`${SOURCE}: no dimensions`);

  const { data, info } = await source
    .extract({
      left: Math.round(CROP.x * width),
      top: Math.round(CROP.y * height),
      width: Math.round(CROP.w * width),
      height: Math.round(CROP.h * height),
    })
    .greyscale()
    .resize(RES, RES, { fit: "fill", kernel: "lanczos3" })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // `fit: "fill"` guarantees the square the indexing below assumes; assert it
  // rather than trust it, because every loop in this file is `y * size + x`.
  if (info.width !== info.height) {
    throw new Error(
      `${SOURCE}: expected a square sample, got ${info.width}×${info.height}`,
    );
  }
  const size = info.width;
  const lum = new Float64Array(size * size);
  for (let i = 0; i < lum.length; i++) {
    lum[i] = (data[i * info.channels] as number) / 255;
  }

  // ── Fit a quadratic to the border ring ──────────────────────────────────
  // Left, right and top only: the bottom edge of the crop is his collar, not
  // paint, and feeding it to the fit tilts the whole surface.
  const ring = Math.max(3, Math.round(size * 0.02));
  const basis = (x: number, y: number) => {
    const u = x / size - 0.5;
    const v = y / size - 0.5;
    return [1, u, v, u * u, u * v, v * v];
  };

  const normal = Array.from({ length: 6 }, () => new Array(6).fill(0));
  const rhs = new Array(6).fill(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x >= ring && x < size - ring && y >= ring) continue;
      const f = basis(x, y);
      const l = lum[y * size + x] as number;
      for (let i = 0; i < 6; i++) {
        const row = normal[i] as number[];
        for (let j = 0; j < 6; j++) {
          row[j] = (row[j] as number) + (f[i] as number) * (f[j] as number);
        }
        rhs[i] = (rhs[i] as number) + (f[i] as number) * l;
      }
    }
  }
  const coefficients = solve(normal, rhs);
  const wallAt = (x: number, y: number) =>
    basis(x, y).reduce((sum, f, i) => sum + f * (coefficients[i] as number), 0);

  // ── Flood the wall in from the border ───────────────────────────────────
  const isWall = new Uint8Array(size * size);
  const stack: number[] = [];
  const visit = (x: number, y: number, from: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * size + x;
    if (isWall[i]) return;
    const value = lum[i] as number;
    const offFit = Math.abs(value - wallAt(x, y));
    const local =
      from < 0
        ? Number.POSITIVE_INFINITY
        : Math.abs(value - (lum[from] as number));
    if (offFit > WALL.tol && !(local <= WALL.creep && offFit <= WALL.slack)) {
      return;
    }
    isWall[i] = 1;
    stack.push(i);
  };

  for (let x = 0; x < size; x++) {
    visit(x, 0, -1);
    visit(x, size - 1, -1);
  }
  for (let y = 0; y < size; y++) {
    visit(0, y, -1);
    visit(size - 1, y, -1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % size;
    const y = (i - x) / size;
    visit(x + 1, y, i);
    visit(x - 1, y, i);
    visit(x, y + 1, i);
    visit(x, y - 1, i);
  }

  // ── Normalise over the subject alone ────────────────────────────────────
  const subject: number[] = [];
  for (let i = 0; i < lum.length; i++) {
    if (!isWall[i]) subject.push(lum[i] as number);
  }
  if (!subject.length) throw new Error(`${SOURCE}: the fill found no subject`);
  subject.sort((a, b) => a - b);
  const at = (p: number) =>
    subject[Math.floor(p * (subject.length - 1))] as number;
  const low = at(CLIP.low);
  const high = at(CLIP.high);
  const span = high - low || 1;

  const value = new Float64Array(lum.length);
  for (let i = 0; i < lum.length; i++) {
    value[i] = isWall[i]
      ? 1
      : Math.min(1, Math.max(0, ((lum[i] as number) - low) / span));
  }

  return { value, size };
}

/** Box-averages the analysed pixels into cells and maps each to the ramp. */
function draw(
  value: Float64Array,
  size: number,
  cols: number,
  rows: number,
): string {
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * size) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * size) / rows));
    let line = "";
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col * size) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * size) / cols));

      let sum = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += value[y * size + x] as number;
          n++;
        }
      }

      const lit = (sum / n) ** GAMMA;
      const step = Math.round((1 - lit) * (RAMP.length - 1));
      line += RAMP[Math.min(RAMP.length - 1, step)];
    }
    // Trailing spaces are invisible and would be a third of the payload.
    lines.push(line.replace(/\s+$/, ""));
  }
  return lines.join("\n");
}

/**
 * Cached on the photograph's own bytes.
 *
 * The dev server rebuilds the whole site on every keystroke under src/, and this
 * is the only step in the build that is not microseconds. Keying the cache on the
 * file rather than on a flag means replacing the photograph still invalidates it.
 */
let cache: { key: string; art: Art } | undefined;

export async function portraitArt(): Promise<Art> {
  const key = Bun.hash(await Bun.file(SOURCE).arrayBuffer()).toString(36);
  if (cache?.key === key) return cache.art;

  const { value, size } = await analyse();
  const art: Art = {
    wide: draw(value, size, ART.wide.cols, ART.wide.rows),
    narrow: draw(value, size, ART.narrow.cols, ART.narrow.rows),
  };

  cache = { key, art };
  return art;
}
