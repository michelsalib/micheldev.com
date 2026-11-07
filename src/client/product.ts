/**
 * A product page's download buttons, ordered for the computer reading them.
 *
 * The page works without this: the build renders every download as an equal
 * button. This puts the reader's own system first and quietens the others, or,
 * on a phone or on Linux, where no button fits, says so under them.
 */

/** Usually one; the cinema layout ends on a second, which gets the same order. */
const boxes = document.querySelectorAll<HTMLElement>("[data-downloads]");

/** "windows", "mac", "mobile", "linux", or undefined when it cannot tell. */
function system(): string | undefined {
  const ua = navigator.userAgent;
  // iPadOS asks for desktop pages and reports a Mac; only touch gives it away.
  if (/Android|iPhone|iPad|iPod|Mobile/.test(ua)) return "mobile";
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "mobile";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Linux|X11|CrOS/.test(ua)) return "linux";
  return undefined;
}

const os = system();
for (const box of boxes) {
  const own = box.querySelector<HTMLElement>(`[data-os="${os}"]`);
  if (own) {
    box.prepend(own);
    own.classList.add("primary");
    box.classList.add("picked");
  }
}
// The notes sit under the first box only, so they are looked up once.
if (os && boxes.length && !boxes[0]?.querySelector(`[data-os="${os}"]`)) {
  document
    .querySelector<HTMLElement>(`[data-other="${os}"]`)
    ?.removeAttribute("hidden");
}
