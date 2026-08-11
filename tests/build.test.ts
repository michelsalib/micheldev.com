import { beforeAll, describe, expect, test } from "bun:test";
import { build } from "../src/build.ts";
import {
  featured,
  isCurrent,
  loadContent,
  totalStars,
} from "../src/content.ts";
import { escapeHtml, html, lines, raw } from "../src/html.ts";

let home = "";
let cvEn = "";
let cvFr = "";

beforeAll(async () => {
  await build();
  home = await Bun.file("dist/index.html").text();
  cvEn = await Bun.file("dist/cv/index.html").text();
  cvFr = await Bun.file("dist/cv/fr/index.html").text();
});

describe("html helpers", () => {
  test("interpolation escapes by default", () => {
    const evil = '<script>alert("x")</script>';
    expect(String(html`<p>${evil}</p>`)).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });

  test("raw() opts out, explicitly", () => {
    expect(String(html`<p>${raw("<b>ok</b>")}</p>`)).toBe("<p><b>ok</b></p>");
  });

  test("escapes the quote characters that break attributes", () => {
    expect(escapeHtml(`" '`)).toBe("&quot; &#39;");
  });

  test("lines() keeps authored breaks and still escapes", () => {
    expect(String(lines("a\n<b>"))).toBe("a<br>&lt;b&gt;");
  });

  test("nullish and false render as nothing, not as text", () => {
    expect(String(html`${null}${undefined}${false}`)).toBe("");
  });
});

describe("built output", () => {
  test("emits every page", async () => {
    for (const path of [
      "dist/index.html",
      "dist/cv/index.html",
      "dist/cv/fr/index.html",
      "dist/404.html",
      "dist/sitemap.xml",
      "dist/robots.txt",
      "dist/assets/favicon.svg",
      "dist/.hosts.json",
      "dist/assets/fonts/ubuntu-sans.woff2",
      "dist/assets/fonts/ubuntu-sans-mono.woff2",
    ]) {
      expect(await Bun.file(path).exists()).toBe(true);
    }
  });

  test("asset hrefs are content-hashed, so they can be immutable", () => {
    expect(home).toMatch(/\/assets\/home\.[0-9a-z]{8}\.css/);
    expect(home).toMatch(/\/assets\/theme\.[0-9a-z]{8}\.js/);
    expect(cvEn).toMatch(/\/assets\/cv\.[0-9a-z]{8}\.js/);
  });

  test("the referenced stylesheet actually exists", async () => {
    const href = home.match(/\/assets\/home\.[0-9a-z]{8}\.css/)?.[0];
    expect(href).toBeTruthy();
    expect(await Bun.file(`dist${href}`).exists()).toBe(true);
  });

  test("theme restore is inline, before any stylesheet", () => {
    // If it were deferred, a saved theme would flash the other one first.
    const script = home.indexOf('localStorage.getItem("theme")');
    const css = home.indexOf("stylesheet");
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(css);
  });

  test("CSS keeps all three theme states", async () => {
    const href = home.match(/\/assets\/home\.[0-9a-z]{8}\.css/)?.[0];
    const css = await Bun.file(`dist${href}`).text();
    expect(css).toContain("prefers-color-scheme:dark");
    expect(css).toContain("[data-theme=light]");
    expect(css).toContain("[data-theme=dark]");
    // Body must paint its own background or it borrows the host's.
    expect(css).toMatch(/body\{[^}]*background:var\(--paper\)/);
  });

  test("fonts are preloaded and self-hosted", () => {
    expect(home).toContain('rel="preload"');
    expect(home).toContain("/assets/fonts/ubuntu-sans.woff2");
    // No third-party origin anywhere.
    expect(home).not.toMatch(/https?:\/\/(fonts|cdn|unpkg|jsdelivr)/);
  });

  test("canonical and hreflang are set on both CV locales", () => {
    expect(cvEn).toContain(
      '<link rel="canonical" href="https://micheldev.com/cv"',
    );
    expect(cvFr).toContain(
      '<link rel="canonical" href="https://micheldev.com/cv/fr"',
    );
    expect(cvEn).toContain('hreflang="fr"');
    expect(cvFr).toContain('hreflang="en"');
  });

  test("404 is noindex", async () => {
    const page = await Bun.file("dist/404.html").text();
    expect(page).toContain('name="robots" content="noindex"');
  });
});

describe("content is rendered, not invented", () => {
  test("every employer appears on the CV, in order", async () => {
    const { cv } = await loadContent();
    let cursor = -1;
    for (const job of cv.experience) {
      const at = cvEn.indexOf(job.employer, cursor);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  test("the current role drives the hero panel label and live dot", async () => {
    const { cv } = await loadContent();
    const job = featured(cv);
    if (isCurrent(job)) {
      expect(home).toContain("<span>Currently</span>");
      expect(home).toContain('class="dot is-live"');
      expect(home).toContain(`${job.from} — now`);
    } else {
      expect(home).toContain("<span>Most recent</span>");
    }
    expect(home).toContain(job.employer);
  });

  test("star total is summed from the data, never hardcoded", async () => {
    const { projects } = await loadContent();
    expect(home).toContain(String(totalStars(projects)));
  });

  test("each employer gets its own timeline hue", async () => {
    const { cv } = await loadContent();
    // Hues arrive as classes, not inline styles — CSP blocks style attributes.
    const seen = new Set<string>();
    for (let i = 1; i <= cv.experience.length; i++) {
      expect(cvEn).toContain(`class="job hue-${i}`);
      seen.add(`hue-${i}`);
    }
    expect(seen.size).toBe(cv.experience.length);
  });

  // This test used to assert the *mechanism* — "is the contact line wrapped in
  // .print-contact?" — and passed while the requirement was broken, because the
  // mechanism was `display: none`, which hides text from readers and from nobody
  // else. Both values shipped in the public /cv source for as long as the site
  // was up. The requirement is that the strings are ABSENT. Assert that.
  test.each([
    ["dist/index.html", "home"],
    ["dist/cv/index.html", "cv"],
    ["dist/cv/fr/index.html", "cv/fr"],
    ["dist/404.html", "404"],
  ])("%s contains neither email nor phone", async (path) => {
    const { cv } = await loadContent();
    const page = await Bun.file(path).text();

    if (cv.person.email) expect(page).not.toContain(cv.person.email);
    if (cv.person.phone) {
      expect(page).not.toContain(cv.person.phone);
      // Formatting-independent: any +33 number at all is a failure.
      expect(page).not.toMatch(/\+\s?33[\d\s.-]{6,}/);
    }
    expect(page).not.toContain("print-contact");
  });

  test("nothing served from dist/ leaks the phone, in any file type", async () => {
    // Belt and braces across the whole deployable tree, not just the HTML — the
    // sitemap, the JSON, the JS bundles and the PDFs all ship from here.
    const { cv } = await loadContent();
    if (!cv.person.phone) return;

    const glob = new Bun.Glob("**/*");
    const offenders: string[] = [];
    for await (const entry of glob.scan({ cwd: "dist", dot: true })) {
      if (entry.endsWith(".pdf") || entry.endsWith(".woff2")) continue;
      const text = await Bun.file(`dist/${entry}`).text();
      if (text.includes(cv.person.phone)) offenders.push(entry);
    }
    expect(offenders).toEqual([]);
  });

  test("no file in the repository carries the phone number", async () => {
    // The repository is public, and this is the test that keeps that safe.
    //
    // Phone only, deliberately. The email is in every commit's author metadata —
    // `git log --format=%ae` returns it — which GitHub exposes through the UI and
    // the API on any public repo, and it is also package.json's author field. A
    // test forbidding the email would fail on facts nothing in this build
    // controls, or worse, pass while implying a protection that does not exist.
    // The phone appears in no commit and no file, so it is genuinely containable,
    // and it is the field worth containing.
    // Deliberately does NOT require CV_PHONE. An earlier version threw without
    // it, which failed CI on the one step that has no reason to hold the secret
    // and, worse, would have skipped the check on fork PRs — the exact case where
    // an untrusted contributor might add a number. The pattern scan is the real
    // guard and needs no secret; the literal and digit checks are a bonus when
    // the value happens to be in the environment.
    const { cv } = await loadContent();
    const phone = cv.person.phone;
    const digits = phone?.replace(/\D/g, "");
    const glob = new Bun.Glob("**/*.{ts,yaml,json,md,css,html,sh,tf,yml}");
    const offenders: string[] = [];

    for await (const entry of glob.scan({ cwd: ".", dot: false })) {
      if (/^(node_modules|dist|mockups|\.print|\.git)\//.test(entry)) continue;
      const text = await Bun.file(entry).text();

      // Any French mobile, however it is spaced or punctuated.
      if (/\+\s?33[\s.-]?6[\d\s.-]{8,}/.test(text)) {
        offenders.push(`${entry} (+33 pattern)`);
      }
      if (phone && text.includes(phone)) offenders.push(`${entry} (literal)`);
      if (digits && text.replace(/\D/g, "").includes(digits)) {
        offenders.push(`${entry} (digits)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the PDF source copies do carry the contact line", async () => {
    // The other half of the requirement: the details must still reach the PDF.
    // These live outside dist/, so they are never served or containerised.
    const { cv } = await loadContent();
    for (const path of [".print/cv/index.html", ".print/cv/fr/index.html"]) {
      expect(await Bun.file(path).exists()).toBe(true);
      const page = await Bun.file(path).text();
      expect(page).toContain("print-contact");
      if (cv.person.email) expect(page).toContain(cv.person.email);
      if (cv.person.phone) expect(page).toContain(cv.person.phone);
    }
  });

  test("French page renders French prose", async () => {
    const { cv } = await loadContent();
    const summary = typeof cv.summary === "string" ? cv.summary : cv.summary.fr;
    expect(cvFr).toContain(summary.slice(0, 40).trim());
    expect(cvFr).toContain('lang="fr"');
  });
});

describe("print stylesheet cascade", () => {
  // Two real bugs came from source order here, both silent: the responsive
  // block overrode the print aside order (A4 at 12mm is ~703 CSS px, so
  // max-width:880px matches while printing), and the base .print-contact rule
  // ended up after the print override that reveals it. Same specificity in both
  // cases, so position decided it — and the only symptom was a wrong PDF.
  let css = "";

  beforeAll(async () => {
    // The print block lives in the CV sheet, which only /cv links.
    const page = await Bun.file("dist/cv/index.html").text();
    const href = page.match(/\/assets\/cv\.[0-9a-z]{8}\.css/)?.[0];
    expect(href).toBeTruthy();
    css = await Bun.file(`dist${href}`).text();
  });

  test("@media print comes after the responsive breakpoints", () => {
    const print = css.indexOf("@media print");
    const responsive = css.lastIndexOf("max-width:880px");
    expect(print).toBeGreaterThan(-1);
    expect(responsive).toBeGreaterThan(-1);
    expect(print).toBeGreaterThan(responsive);
  });

  test("print reveals the contact block after the base rule hides it", () => {
    const hidden = css.indexOf(".print-contact{display:none}");
    const print = css.indexOf("@media print");
    expect(hidden).toBeGreaterThan(-1);
    expect(hidden).toBeLessThan(print);
  });

  test("print disables the scroll-driven animations", () => {
    // Without this they freeze on their `from` keyframe — opacity 0 — and the
    // CV prints blank.
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toContain("animation:none");
  });

  test("print avoids breaking after a heading", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toContain("break-after:avoid");
  });
});

describe("CSP compatibility", () => {
  // `style-src 'self'` with no 'unsafe-inline' blocks inline style attributes
  // outright: the attribute stays in the DOM and contributes zero declarations.
  // Every hue used to arrive that way, so the CV rendered a grey spine with no
  // node rings and nothing pointed at the cause. Hues are classes now.
  test.each([
    ["dist/index.html", "home"],
    ["dist/cv/index.html", "cv"],
    ["dist/cv/fr/index.html", "cv/fr"],
    ["dist/404.html", "404"],
  ])("%s carries no inline style attributes", async (path) => {
    const page = await Bun.file(path).text();
    expect(page).not.toMatch(/\sstyle="/);
  });

  test("hue classes are defined for every employer", async () => {
    const { cv } = await loadContent();
    const page = await Bun.file("dist/cv/index.html").text();
    const href = page.match(/\/assets\/cv\.[0-9a-z]{8}\.css/)?.[0];
    const css = await Bun.file(`dist${href}`).text();

    for (let i = 1; i <= cv.experience.length; i++) {
      expect(page).toContain(`hue-${i}`);
      expect(css).toContain(`.hue-${i}{--hue:var(--w${i})}`);
    }
  });
});

describe("top bar has no blanket selectors", () => {
  // `.bar nav a` at (0,2,1) captured every anchor in the nav and silently
  // outranked the components placed there: the PDF button lost its padding and
  // colour (a 35x29 circle with --ink-2 text on a near-white pill) and the
  // language switcher collapsed EN/FR together. Plain links carry .nav-link now.
  test.each([
    ["dist/index.html", /\/assets\/home\.[0-9a-z]{8}\.css/],
    ["dist/cv/index.html", /\/assets\/cv\.[0-9a-z]{8}\.css/],
  ])("%s: nav styling is scoped to .nav-link", async (page, pattern) => {
    const html = await Bun.file(page).text();
    const href = html.match(pattern)?.[0];
    const css = await Bun.file(`dist${href}`).text();

    // A bare `.bar nav a` rule, with no further qualifier, is the bug.
    expect(css).not.toMatch(/\.bar nav a\s*[{,]/);
    expect(css).not.toMatch(/\.bar nav a:hover/);
  });

  test("every plain nav link is marked, and components are not", async () => {
    const html = await Bun.file("dist/index.html").text();
    const anchors =
      html
        .slice(html.indexOf("<nav>"), html.indexOf("</nav>"))
        .match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) expect(anchor).toContain("nav-link");
  });
});
