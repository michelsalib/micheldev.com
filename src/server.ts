/**
 * The Cloud Run runtime: serves dist/, plus the one thing a static file cannot
 * be — the live counters at /stats.json.
 *
 * Still deliberately small. The redirect lives in code rather than DNS because
 * all four domains map to this one service, and the stats route lives here
 * rather than in the build because numbers that need a deploy to move are not
 * live numbers. Everything it fetches is public and unauthenticated, so the
 * runtime service account still holds no roles at all.
 */

import { collectStats, type Stats, type StatsSources } from "./stats.ts";

const DIST = process.env["DIST_DIR"] ?? "dist";
const PORT = Number(process.env["PORT"] ?? 8080);

const SECURITY_HEADERS: Record<string, string> = {
  // Still no third-party requests from the browser, which is what this policy
  // governs and what /stats.json was shaped to preserve: the registries are
  // called by the origin, and the page only ever talks to its own domain, so
  // `connect-src 'self'` covers the live figures with nothing widened for them.
  // 'unsafe-inline' covers the theme-restore snippet, which has to run before
  // first paint.
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cross-origin-opener-policy": "same-origin",
};

type Hosts = { canonical: string; redirect: string[] };

/**
 * Host config is emitted by the build from content/site.yaml, so it stays a
 * single source of truth while leaving this file dependency-free — the runtime
 * image ships dist/ and this one script, with no node_modules at all.
 *
 * Read on first use rather than at module scope. As a top-level `await` this
 * made the mere act of importing the module require a built dist/, so
 * `import { handle }` in tests threw ENOENT before any `beforeAll` could run —
 * invisible locally, where dist/ was left over from the previous build, and a
 * hard CI failure on a clean checkout. Memoised, so the file is still read once.
 */
let hosts: { canonical: string; redirect: Set<string> } | undefined;

async function hostConfig() {
  if (!hosts) {
    const raw = (await Bun.file(`${DIST}/.hosts.json`).json()) as Hosts;
    hosts = { canonical: raw.canonical, redirect: new Set(raw.redirect) };
  }
  return hosts;
}

// ── Live counters ────────────────────────────────────────────────────────────

/**
 * A week in the shared cache, which is what makes fetching these at request time
 * affordable at all: one pass over npm, Packagist and GitHub per seven days,
 * however many people visit.
 *
 * `s-maxage` and `max-age` are deliberately far apart. Cloudflare holds the
 * answer for the week; a browser holds it for ten minutes, so a reader who
 * reloads is not stuck with their own copy of a figure the edge has since
 * refreshed. `stale-while-revalidate` means the visitor who arrives just after
 * expiry is served the old number immediately and the refresh happens behind
 * them — without it, one unlucky request a week would wait on ~20 upstream calls
 * — and `stale-if-error` keeps the last good answer on screen through an outage
 * at any of those registries rather than falling back to the floor.
 *
 * Cloudflare does not cache JSON by default, so this only takes effect with a
 * Cache Rule on the zone. See the README: without it the headers are still
 * correct and the origin simply does more work.
 */
export const STATS_CACHE_CONTROL = [
  "public",
  "max-age=600",
  "s-maxage=604800",
  "stale-while-revalidate=86400",
  "stale-if-error=604800",
].join(", ");

const STATS_TTL_MS = 604_800_000;

/** Emitted by the build from the `stats` block of projects.yaml. */
let sources: StatsSources | undefined;

async function statsSources(): Promise<StatsSources> {
  if (!sources) {
    sources = (await Bun.file(
      `${DIST}/.stats-sources.json`,
    ).json()) as StatsSources;
  }
  return sources;
}

let cached: { at: number; value: Stats } | undefined;
let inFlight: Promise<Stats> | undefined;

/**
 * The current snapshot, refreshing at most one pass at a time.
 *
 * The single-flight matters more here than the TTL does. This service scales to
 * zero, so instances are routinely cold, and without it a burst of parallel
 * requests to a fresh instance would each start their own twenty-odd upstream
 * calls. The previous snapshot is handed to the collector so that a source which
 * fails this time keeps its last good figure rather than dropping out.
 */
async function currentStats(): Promise<Stats> {
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.value;

  inFlight ??= collectStats(await statsSources(), cached?.value)
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inFlight = undefined;
    });

  return inFlight;
}

async function statsResponse(): Promise<Response> {
  let body: Stats;
  let cacheControl = STATS_CACHE_CONTROL;

  try {
    body = await currentStats();
  } catch {
    // Missing sources file, or the collector itself threw. An empty snapshot is
    // a valid answer — the page keeps the figures the build rendered, which is
    // the same thing that happens when this request never completes. But do not
    // let the edge hold an empty one for a week.
    body = { at: new Date().toISOString() };
    cacheControl = "public, max-age=60";
  }

  return new Response(JSON.stringify(body), {
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

// ── Static files ─────────────────────────────────────────────────────────────

/** Hashed assets never change; HTML must be revalidated on every deploy. */
function cacheControl(pathname: string): string {
  if (pathname.startsWith("/assets/fonts/")) {
    return "public, max-age=31536000, immutable";
  }
  if (/\.[0-9a-z]{8}\.(css|js)$/.test(pathname)) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.endsWith(".pdf")) return "public, max-age=3600";
  return "public, max-age=0, must-revalidate";
}

/** Resolves a URL path to a file on disk, or null. */
async function resolve(pathname: string) {
  // Dotfiles are never public. Keeps .hosts.json (and anything else that lands
  // in dist/ with a leading dot) off the wire.
  if (pathname.split("/").some((segment) => segment.startsWith("."))) {
    return null;
  }

  const candidates = pathname.endsWith("/")
    ? [`${pathname}index.html`]
    : [pathname, `${pathname}/index.html`, `${pathname}.html`];

  for (const candidate of candidates) {
    // Normalise away any traversal before touching the filesystem.
    const clean = new URL(candidate, "file:///").pathname;
    const file = Bun.file(`${DIST}${clean}`);
    if (await file.exists()) return { file, path: clean };
  }
  return null;
}

export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
  const { canonical, redirect } = await hostConfig();

  // One canonical hostname. michelsalib.com and the www variants 301 here,
  // preserving path and query so old links keep working.
  if (redirect.has(host)) {
    return Response.redirect(
      `https://${canonical}${url.pathname}${url.search}`,
      301,
    );
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  // The only path that is not a file. Ahead of the static resolve because there
  // is nothing named this in dist/ — it would 404 on its way past.
  if (url.pathname === "/stats.json") return statsResponse();

  // Collapse trailing slashes (except the root) to keep one URL per page.
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    return Response.redirect(
      `https://${canonical}${url.pathname.replace(/\/+$/, "")}${url.search}`,
      301,
    );
  }

  const found = await resolve(
    url.pathname === "/" ? "/index.html" : url.pathname,
  );

  if (!found) {
    const notFound = Bun.file(`${DIST}/404.html`);
    return new Response((await notFound.exists()) ? notFound : "Not found", {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return new Response(found.file, {
    headers: {
      ...SECURITY_HEADERS,
      "cache-control": cacheControl(found.path),
    },
  });
}

if (import.meta.main) {
  const server = Bun.serve({ port: PORT, fetch: handle });
  console.log(`serving ${DIST} on http://localhost:${server.port}`);
}
