/**
 * Theme toggle. The restore half runs inline in <head> (see partials.ts) so a
 * saved choice never flashes the other theme; this is only the click handler.
 */

const root = document.documentElement;
const button = document.getElementById("theme");

button?.addEventListener("click", () => {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const current =
    root.getAttribute("data-theme") ?? (systemDark ? "dark" : "light");
  const next = current === "dark" ? "light" : "dark";

  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // Private mode: the choice just does not persist.
  }

  // The CV page repaints its spine, whose hues differ between themes.
  dispatchEvent(new CustomEvent("themechange"));
});
