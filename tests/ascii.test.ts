import { describe, expect, test } from "bun:test";
import { ART, portraitArt } from "../src/ascii.ts";
import { RAMP, REEL } from "../src/ramp.ts";

const art = await portraitArt();

/** Every character the ramp can emit, and nothing else. */
const ALLOWED = new Set(RAMP);

describe("the portrait, as characters", () => {
  test.each([
    ["wide", art.wide, ART.wide],
    ["narrow", art.narrow, ART.narrow],
  ])(
    "%s is exactly the grid the stylesheet is sized for",
    (_name, text, at) => {
      const lines = text.split("\n");
      expect(lines).toHaveLength(at.rows);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(at.cols);
        // Trailing spaces are stripped, so a line may be short but never long.
        expect(line).not.toMatch(/\s$/);
      }
    },
  );

  test.each([
    ["wide", art.wide],
    ["narrow", art.narrow],
  ])("%s draws from the ramp and nothing else", (_name, text) => {
    for (const character of text.replace(/\n/g, "")) {
      expect(ALLOWED.has(character)).toBe(true);
    }
  });

  // The reason the partial can interpolate the art through `html` and the built
  // page can still be compared against this output character for character.
  test("the ramp needs no HTML escaping", () => {
    for (const character of ALLOWED) expect(character).not.toMatch(/[&<>"']/);
  });

  test.each([
    ["wide", art.wide],
    ["narrow", art.narrow],
  ])("%s has a face in it, not a rectangle of ink", (_name, text) => {
    // The top third of the ramp and its lightest step, whatever they happen to
    // be — this used to name `#%@` and a space, which quietly stopped meaning
    // anything the day the ramp became blocks.
    const dark = new Set([...RAMP].slice(-Math.ceil(RAMP.length / 3)));
    const blank = RAMP[0] as string;
    const glyphs = [...text.replace(/\n/g, "")];
    // He is a head against a blank wall: both have to be well represented, or
    // the wall segmentation has either failed to fire or eaten the subject.
    expect(
      glyphs.filter((c) => dark.has(c)).length / glyphs.length,
    ).toBeGreaterThan(0.08);
    expect(
      glyphs.filter((c) => c === blank).length / glyphs.length,
    ).toBeGreaterThan(0.15);
  });

  test("the wall is gone, not merely faint", () => {
    // The crop's top-left corner is paint in every framing of this photograph,
    // and a single global threshold cannot blank it without blanking his cheek —
    // which is the whole reason src/ascii.ts segments rather than thresholds.
    const [first = "", second = ""] = art.wide.split("\n");
    for (const line of [first, second]) {
      expect(line.slice(0, 12).trim()).toBe("");
    }
  });

  // The invariant the stylesheet's `line-height: 2ch` depends on: cells are
  // twice as tall as they are wide, so cols / (rows × 2) has to come out at the
  // crop's own aspect ratio or the face arrives stretched. Change one of the two
  // numbers in ART without the other and this is what says so.
  test.each([
    ["wide", ART.wide],
    ["narrow", ART.narrow],
  ])("%s keeps the crop's aspect ratio", (_name, at) => {
    const drawn = at.cols / (at.rows * 2);
    // The crop, from src/ascii.ts. Stated rather than imported: a test that
    // reads the same constant as the code under test asserts nothing.
    const crop = 0.779 / 0.673;
    expect(Math.abs(drawn / crop - 1)).toBeLessThan(0.05);
  });

  test("it is a pure function of the photograph", async () => {
    // Also the cache: the second call must not merely be equal, it must be the
    // same object, or the dev server pays 160ms on every keystroke.
    const again = await portraitArt();
    expect(again).toBe(art);
  });
});

/**
 * The reel is what src/client/art.ts turns the characters through on load and
 * every so often afterwards. It is built out of the ramp so it cannot fail to
 * carry it, and these are the properties the client actually leans on.
 */
describe("the reel the flaps turn through", () => {
  test("carries every character a cell can be asked to land on", () => {
    for (const ch of RAMP) expect(REEL).toContain(ch);
  });

  test("has exactly one space, at the start", () => {
    // Two things read index 0 as "blank": the ramp, where it is the lightest
    // tone, and the client, which uses it to tell a cell inside the picture from
    // one out in the bare plate — the plate's cells are left out of the idle
    // flicker, because a glyph appearing out there reads as dirt. A second space
    // anywhere on the reel would quietly turn that off.
    expect(REEL.indexOf(" ")).toBe(0);
    expect(REEL.lastIndexOf(" ")).toBe(0);
  });

  test("spends no character twice", () => {
    // A repeat would give a cell two resting places for one tone, and
    // `indexOf` would always pick the first — so some cells would roll to a
    // character they were not asked for.
    expect(new Set(REEL).size).toBe(REEL.length);
    expect(new Set(RAMP).size).toBe(RAMP.length);
  });

  test("is short enough to finish, and small enough to count in a byte", () => {
    // The longest roll is (length - 1) turns at 55ms, and the client keeps its
    // state in Uint8Arrays.
    expect((REEL.length - 1) * 55).toBeLessThan(1500);
    expect(REEL.length).toBeLessThan(256);
  });
});
