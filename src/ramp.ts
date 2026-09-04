/**
 * The character ramp, and the reel the masthead's flaps turn through.
 *
 * Its own module because both ends of the build need it and they cannot import
 * each other: src/ascii.ts renders the portrait with a decoder that has no
 * business in a browser bundle, and src/client/art.ts flips the characters into
 * place in the browser and must stay dependency-free. Same arrangement, and the
 * same reason, as src/format.ts.
 */

/**
 * Five steps, lightest first: bare paper, then the three shade blocks, then a
 * solid cell.
 *
 * The order is the whole contract — every consumer treats the index as a tone —
 * and it has to be monotonic in *ink coverage*, measured in the face that
 * renders it at the size the plate renders it, not in the abstract.
 *
 * Which the textbook ASCII ramp was not. Measured in Ubuntu Sans Mono,
 * ` .:-=+*#%@` steps backwards three times (`-` is lighter than `:`, `+` than
 * `=`, `%` than `#`) and then jumps 16.6 points of coverage between `*` and `#`
 * where an even step would be 4.0 — more than half the tonal range in one step,
 * which is why the beard used to come out as a flat slab.
 *
 * The blocks are monotonic, and they buy range: 0 to 100 percent of a cell,
 * against 0 to 36 for the densest character Ubuntu Sans Mono has. They are not
 * evenly spaced — 17.6, 48.1, 78.8, 100.3, so the two middle steps are 30 points
 * and the outer two are 18 and 22 — but the worst of that is 7 points off ideal
 * where the ASCII ramp was 12.6 off with three reversals. Inserting `▄`, which
 * is exactly half a cell, would halve the remaining error if it ever matters.
 *
 * They also cost a font: no Latin-1 subset carries them. See 00-fonts.css.
 */
export const RAMP = " ░▒▓█";

/**
 * The characters a cell turns through on its way to the one it lands on.
 *
 * Built out of the ramp, so every tone a cell can be asked for is somewhere on
 * the reel by construction rather than by a promise in a comment. The tail is
 * what makes it read as a board rather than as a photograph fading up: a cell
 * rolls forward only, wraps at the end, and on the way through the tail it shows
 * letters and digits, which is what a split-flap actually has on its flaps.
 *
 * Length decides how long the longest roll takes — see TICK in
 * src/client/art.ts — so the tail is as short as it can be and still read as
 * text. Filtered against the ramp rather than simply appended, because a ramp
 * whose own steps are letters would otherwise put a character on the reel twice,
 * and `indexOf` would send every cell wanting the second one to the first.
 */
const FLAPS = "AE8SR2NO4TM6";

export const REEL =
  RAMP + [...FLAPS].filter((flap) => !RAMP.includes(flap)).join("");
