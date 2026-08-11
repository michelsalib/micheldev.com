import { beforeAll, describe, expect, test } from "bun:test";
import { build } from "../src/build.ts";
import { handle } from "../src/server.ts";

/** Requests the handler directly, with a Host header, without opening a port. */
function get(path: string, host = "micheldev.com", method = "GET") {
  return handle(
    new Request(`https://${host}${path}`, { method, headers: { host } }),
  );
}

beforeAll(async () => {
  await build();
});

describe("canonical host", () => {
  test.each(["michelsalib.com", "www.michelsalib.com", "www.micheldev.com"])(
    "301s %s to the canonical host",
    async (host) => {
      const response = await get("/cv", host);
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("https://micheldev.com/cv");
    },
  );

  test("preserves path and query when redirecting", async () => {
    const response = await get("/cv?x=1", "michelsalib.com");
    expect(response.headers.get("location")).toBe(
      "https://micheldev.com/cv?x=1",
    );
  });

  test("serves the canonical host directly", async () => {
    expect((await get("/")).status).toBe(200);
  });
});

describe("routing", () => {
  test.each([
    ["/", "Michel Salib"],
    ["/cv", "Curriculum vitae"],
    ["/cv/fr", "Curriculum vitae"],
  ])("%s renders", async (path, needle) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(needle);
  });

  test("extensionless paths resolve to their index.html", async () => {
    const response = await get("/cv");
    expect(response.headers.get("content-type")).toContain("text/html");
  });

  test("trailing slashes collapse to one URL", async () => {
    const response = await get("/cv/");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://micheldev.com/cv");
  });

  test("unknown paths return the 404 page, not a bare string", async () => {
    const response = await get("/nope");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Nothing here");
  });

  test("dotfiles are never served", async () => {
    expect((await get("/.hosts.json")).status).toBe(404);
  });

  test("path traversal cannot escape dist/", async () => {
    for (const path of [
      "/../package.json",
      "/../../etc/passwd",
      "/assets/../../package.json",
    ]) {
      const response = await get(path);
      expect(response.status).not.toBe(200);
    }
  });

  test("non-GET methods are rejected", async () => {
    const response = await get("/", "micheldev.com", "POST");
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toContain("GET");
  });
});

describe("caching", () => {
  test("hashed assets are immutable for a year", async () => {
    const home = await (await get("/")).text();
    const href = home.match(/\/assets\/home\.[0-9a-z]{8}\.css/)?.[0] as string;
    const response = await get(href);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("fonts are immutable", async () => {
    const response = await get("/assets/fonts/ubuntu-sans.woff2");
    expect(response.headers.get("cache-control")).toContain("immutable");
  });

  test("HTML must revalidate, so a deploy is picked up", async () => {
    const response = await get("/cv");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=0, must-revalidate",
    );
  });
});

describe("security headers", () => {
  test("CSP allows only first-party resources", async () => {
    const csp = (await get("/")).headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
    // The theme-restore snippet has to be inline to beat first paint.
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
  });

  test("sets the rest of the baseline", async () => {
    const headers = (await get("/")).headers;
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("strict-transport-security")).toContain("max-age=");
  });
});

describe("the module is importable without a build", () => {
  // This file already builds in `beforeAll`, which looks sufficient and is not:
  // the host config used to be read by a top-level `await`, so merely importing
  // src/server.ts required a built dist/ and threw ENOENT before any hook could
  // run. It passed locally forever because dist/ was left over from the previous
  // build, and failed the first time CI ran it on a clean checkout — where the
  // workflow runs `bun test` *before* `bun run build`.
  //
  // Asserted in a subprocess because this process has already imported the
  // module, so an in-process import would hit the cache and prove nothing.
  test("importing it does not read dist/", async () => {
    const proc = Bun.spawn(
      ["bun", "-e", 'await import("./src/server.ts"); console.log("imported")'],
      {
        env: { ...process.env, DIST_DIR: "/nonexistent-by-design" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    expect(err).not.toContain("ENOENT");
    expect(out).toContain("imported");
    expect(code).toBe(0);
  });
});
