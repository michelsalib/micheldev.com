/**
 * The Cloud Run runtime: serves dist/ and nothing else.
 *
 * Kept deliberately small — there is no application here, only static files, a
 * canonical-host redirect, and cache headers. The redirect lives in code rather
 * than DNS because all four domains map to this one service.
 */

const DIST = process.env["DIST_DIR"] ?? "dist";
const PORT = Number(process.env["PORT"] ?? 8080);

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

const SECURITY_HEADERS: Record<string, string> = {
  // Everything is first-party: no third-party scripts, fonts, or trackers, so
  // the policy can be this tight. 'unsafe-inline' covers the theme-restore
  // snippet, which has to run before first paint.
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
