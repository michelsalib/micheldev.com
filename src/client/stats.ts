/**
 * Writes the live figures from /stats.json over the ones the build rendered.
 *
 * Strictly an upgrade, never a dependency: every tile already holds a real
 * number before this runs — the star and repo counts derived from projects.yaml,
 * the downloads floor measured by hand — so a reader with no JS, a blocked
 * request or a cold origin sees a correct page that is merely a little behind.
 * Every failure path here therefore does nothing at all, on purpose.
 *
 * The two elements that have no build-time equivalent (the last release, the
 * visit count) ship `hidden` and are revealed only once there is something to
 * put in them, so nothing on the page reserves space for a number that may never
 * arrive.
 */

import { formatAgo, formatCount } from "../format.ts";
import type { ProjectStat, Stats } from "../stats.ts";

const tiles = document.querySelectorAll<HTMLElement>("[data-stat]");
const ship = document.querySelector<HTMLElement>("[data-ship]");
const visits = document.querySelector<HTMLElement>("[data-visits]");
const projects = document.querySelectorAll<HTMLElement>("[data-project]");

/**
 * One project's line, from whichever figures it has.
 *
 * A hosted service reports traffic and no releases; a desktop application
 * reports releases and no traffic. Rather than branch on which kind a project
 * is — the page would then have to be told, and could be told wrong — the line
 * is assembled from whatever came back, and a project with nothing to say gets
 * no line at all.
 *
 * Zero is treated as nothing on purpose: "0 downloads" is a worse thing to print
 * than silence, and it is what a service with no release assets returns.
 */
function projectLine(stat: ProjectStat): string {
  const parts: string[] = [];
  if (stat.tag) parts.push(stat.tag);
  if (stat.at) parts.push(formatAgo(stat.at));
  if (stat.downloads) parts.push(`${formatCount(stat.downloads)} downloads`);
  if (stat.requests) {
    parts.push(`${formatCount(stat.requests)} requests · 7 days`);
  }
  return parts.join(" · ");
}

function apply(stats: Stats) {
  for (const tile of tiles) {
    const value =
      stats[tile.dataset["stat"] as "downloads" | "stars" | "repos"];
    if (typeof value === "number") tile.textContent = formatCount(value);
  }

  if (ship && stats.last_ship) {
    const { repo, tag, at } = stats.last_ship;
    ship.textContent = `· shipped ${repo} ${tag} ${formatAgo(at)}`;
    // "3 days ago" is the readable form but not a checkable one; the exact date
    // goes on the hover, and on <time datetime> for anything parsing the page.
    ship.setAttribute("datetime", at);
    ship.title = new Date(at).toISOString().slice(0, 10);
    ship.hidden = false;
  }

  if (visits && typeof stats.visits === "number") {
    visits.textContent = `${formatCount(stats.visits)} page views in the last 30 days`;
    visits.hidden = false;
  }

  for (const element of projects) {
    const stat = stats.projects?.[element.dataset["project"] ?? ""];
    const line = stat ? projectLine(stat) : "";
    if (line) {
      element.textContent = line;
      element.hidden = false;
    }
  }
}

// Nothing to fill on this page — the CV renders career figures, which are not live.
if (tiles.length || ship || visits || projects.length) {
  fetch("/stats.json", { headers: { accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : Promise.reject()))
    .then(apply)
    .catch(() => {
      // Leave the build-time figures exactly where they are.
    });
}
