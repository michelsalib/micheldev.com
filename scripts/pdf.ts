/**
 * Prints /cv and /cv/fr to PDF, and photographs the link-preview card, with
 * headless Chrome.
 *
 * The PDFs come from the same markup and the same `@media print` block in
 * 04-cv.css as the page, so they cannot drift from it. The one difference is the
 * contact line: only the copies under .print/ carry the email and phone, and
 * those are never served or containerised.
 *
 * This replaced a version that put the contact line in the deployed HTML and
 * hid it with `display: none`. That is not hiding — the text shipped in the
 * public /cv source, where any crawler or scraper could read it. The two files
 * that hold it now live outside dist/ entirely.
 *
 * Chrome is found via CHROME_PATH (set in CI), or from the usual local paths.
 */

import { existsSync } from "node:fs";
import { handle } from "../src/server.ts";

const CANDIDATES = [
  process.env["CHROME_PATH"],
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
].filter((path): path is string => Boolean(path));

const PAGES = [
  {
    path: "/cv",
    out: "dist/michel-salib-cv-en.pdf",
    print: ".print/cv/index.html",
  },
  {
    path: "/cv/fr",
    out: "dist/michel-salib-cv-fr.pdf",
    print: ".print/cv/fr/index.html",
  },
];

/**
 * The link-preview card. A screenshot rather than a print: og:image wants a
 * raster at 1200×630, which is what every platform crops a preview to.
 *
 * It lands in dist/assets/img/ beside the portrait, so the image the head
 * already points at exists by the time CI builds the container. A local
 * `bun run build` on its own does not produce it — same as the PDFs.
 */
const CARD = {
  path: "/og",
  print: ".print/og/index.html",
  out: "dist/assets/img/og.png",
  width: 1200,
  height: 630,
};

/** Path -> the print copy that overrides it, for the local print server. */
const OVERRIDES = new Map(
  [...PAGES, CARD].map((page) => [page.path, page.print]),
);

/** A CV that runs past this is a layout bug, not a long career. */
const MAX_PAGES = 3;

/**
 * Counts page objects in a PDF without a parser: `/Type /Page` not followed by
 * `s`, so the `/Pages` tree node is not miscounted.
 */
function countPages(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return text.match(/\/Type\s*\/Page(?![s/\w])/g)?.length ?? 0;
}

function findChrome(): string {
  const found = CANDIDATES.find((path) => existsSync(path));
  if (!found) {
    console.error(
      "No Chrome found. Set CHROME_PATH, or install Chrome/Chromium.",
    );
    console.error("Tried:\n" + CANDIDATES.map((p) => `  ${p}`).join("\n"));
    process.exit(1);
  }
  return found;
}

/**
 * Windows binaries reached through WSL cannot read Linux paths, so when the
 * browser lives under /mnt/c the output has to land somewhere it can write.
 */
function isWindowsBinary(chrome: string): boolean {
  return chrome.startsWith("/mnt/");
}

/** Where a Windows-hosted Chrome is allowed to write, and where that lands. */
function windowsTarget(out: string): { target: string; linux: string } {
  const dir = process.env["TEMP_WIN"] ?? "C:\\Windows\\Temp";
  const target = `${dir}\\${out.split("/").pop()}`;
  return {
    target,
    linux: target.replace(/\\/g, "/").replace(/^C:/i, "/mnt/c"),
  };
}

async function main() {
  const chrome = findChrome();

  // Serve dist/ on a scratch port; Chrome prints from a real URL so relative
  // asset paths, fonts and the stylesheet all resolve exactly as in production.
  // The two CV paths are served from .print/ instead, so the printed copy carries
  // the contact line while everything else — CSS, fonts, JS — comes from dist/
  // through the production handler.
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const override = OVERRIDES.get(new URL(request.url).pathname);
      if (override) {
        const file = Bun.file(override);
        if (!(await file.exists())) {
          throw new Error(
            `${override} is missing — run \`bun run build\`, which writes it`,
          );
        }
        return new Response(file, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      const headers = new Headers(request.headers);
      headers.set("host", "localhost");
      return handle(
        new Request(request.url, { method: request.method, headers }),
      );
    },
  });

  const base = `http://localhost:${server.port}`;
  console.log(`printing from ${base} using ${chrome}`);

  try {
    for (const page of PAGES) {
      const target = isWindowsBinary(chrome)
        ? windowsTarget(page.out).target
        : page.out;

      const proc = Bun.spawn(
        [
          chrome,
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--no-pdf-header-footer",
          "--virtual-time-budget=8000",
          `--print-to-pdf=${target}`,
          `${base}${page.path}`,
        ],
        { stdout: "ignore", stderr: "pipe" },
      );

      const code = await proc.exited;
      if (code !== 0) {
        console.error(await new Response(proc.stderr).text());
        throw new Error(`Chrome exited ${code} printing ${page.path}`);
      }

      if (isWindowsBinary(chrome)) {
        // Copy back from the Windows-visible location into dist/.
        await Bun.write(page.out, Bun.file(windowsTarget(page.out).linux));
      }

      const size = Bun.file(page.out).size;
      if (size < 10_000) {
        throw new Error(
          `${page.out} is only ${size} bytes — print likely failed`,
        );
      }

      // A print stylesheet can fail in a way that still produces a plausible
      // file: the scroll-driven animations once froze at opacity 0, giving seven
      // near-blank pages. Page count is the cheap signal that catches it.
      const pages = countPages(await Bun.file(page.out).bytes());
      if (pages > MAX_PAGES) {
        throw new Error(
          `${page.out} has ${pages} pages (max ${MAX_PAGES}) — the print ` +
            `layout is probably broken; render it and look before raising this`,
        );
      }

      console.log(
        `  ${page.path} -> ${page.out} (${(size / 1024).toFixed(0)} KB, ` +
          `${pages} page${pages === 1 ? "" : "s"})`,
      );
    }

    const cardTarget = isWindowsBinary(chrome)
      ? windowsTarget(CARD.out).target
      : CARD.out;

    const shot = Bun.spawn(
      [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--virtual-time-budget=8000",
        // The window is the frame: the card sizes html and body to exactly
        // these numbers, so the screenshot is the whole composition and nothing
        // else.
        `--window-size=${CARD.width},${CARD.height}`,
        `--screenshot=${cardTarget}`,
        `${base}${CARD.path}`,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );

    const shotCode = await shot.exited;
    if (shotCode !== 0) {
      console.error(await new Response(shot.stderr).text());
      throw new Error(`Chrome exited ${shotCode} shooting ${CARD.path}`);
    }

    if (isWindowsBinary(chrome)) {
      await Bun.write(CARD.out, Bun.file(windowsTarget(CARD.out).linux));
    }

    // A card that failed to load its font or its portrait is still a PNG, and
    // one this size is mostly flat colour — 10 KB is comfortably below anything
    // the real composition weighs and comfortably above an empty frame.
    const cardSize = Bun.file(CARD.out).size;
    if (cardSize < 10_000) {
      throw new Error(
        `${CARD.out} is only ${cardSize} bytes — the card did not render`,
      );
    }

    console.log(
      `  ${CARD.path} -> ${CARD.out} (${(cardSize / 1024).toFixed(0)} KB, ` +
        `${CARD.width}×${CARD.height})`,
    );
  } finally {
    server.stop(true);
  }
}

await main();
