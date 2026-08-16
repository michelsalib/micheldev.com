/**
 * Number and date shapes shared by the build and the browser.
 *
 * Its own module, and a deliberately tiny one, because it is the only code the
 * client bundle needs from the stats path. Importing it from src/stats.ts would
 * pull the registry fetchers — and the Cloudflare query — into a script served
 * to every visitor, to use one pure function.
 */

/**
 * A magnitude short enough for a tile: 22654765 → "22.6M", 541 → "541".
 *
 * One function for both sides, so the figure cannot change shape when it changes
 * source: the build renders the floor from projects.yaml through this, and the
 * client renders the live total through it a moment later. Without that, the
 * tile would visibly reformat itself on load even when the number barely moved.
 */
export function formatCount(value: number): string {
  const scale = (n: number, suffix: string) =>
    `${n < 100 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}${suffix}`;

  if (value < 1_000) return String(value);
  if (value < 1_000_000) return scale(value / 1_000, "k");
  return scale(value / 1_000_000, "M");
}

/**
 * An ISO timestamp as "today", "yesterday", "3 days ago", "2 months ago".
 *
 * `numeric: "auto"` is what buys the first two words rather than "0 days ago",
 * and the unit steps up so a release from 2019 does not read as "2,431 days
 * ago". Rounds toward the past: a release published four hours ago is "today",
 * not "in 0 days".
 */
export function formatAgo(iso: string, locale = "en"): string {
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  if (days < 30) return relative.format(-days, "day");
  if (days < 365) return relative.format(-Math.floor(days / 30), "month");
  return relative.format(-Math.floor(days / 365), "year");
}
