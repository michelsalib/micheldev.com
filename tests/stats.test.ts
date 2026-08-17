import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../src/build.ts";
import { loadContent, repoSlug, statsSources } from "../src/content.ts";
import { formatAgo, formatCount } from "../src/format.ts";
import { STATS_CACHE_CONTROL } from "../src/server.ts";

// Nothing in this file talks to npm, Packagist, GitHub or Cloudflare. The live
// figures are the point of the feature but they are also somebody else's uptime
// and somebody else's rate limit, and a test suite that spends five GitHub
// requests per run from a shared CI address fails for reasons that have nothing
// to do with the change under test. What is asserted here is everything that is
// ours: the shape of the numbers, the contract with the CDN, the wiring between
// the YAML and the runtime, and the behaviour when a source is unreachable.

beforeAll(async () => {
  await build();
});

describe("figures are shaped the same by both sides", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1k"],
    [1_500, "1.5k"],
    [99_950, "100k"],
    [541, "541"],
    [1_514_629, "1.5M"],
    [22_655_165, "22.7M"],
    [22_000_000, "22M"],
    [104_000_000, "104M"],
  ])("%i renders as %s", (value, expected) => {
    expect(formatCount(value)).toBe(expected);
  });

  test("a trailing .0 is dropped, so tiles never read '22.0M'", () => {
    expect(formatCount(22_000_000)).not.toContain(".0");
    expect(formatCount(3_000)).toBe("3k");
  });
});

describe("release dates read as prose", () => {
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const DAY = 86_400_000;

  test("a release from this morning is today, not 'in 0 days'", () => {
    expect(formatAgo(ago(4 * 3_600_000))).toBe("today");
  });

  test.each([
    [1, "yesterday"],
    [3, "3 days ago"],
    [45, "last month"],
    [400, "last year"],
  ])("%i days ago reads as %s", (days, expected) => {
    expect(formatAgo(ago(days * DAY))).toBe(expected);
  });

  test("an old release steps up a unit rather than counting days", () => {
    // The archive is from 2011; "4,000 days ago" would be technically true.
    expect(formatAgo(ago(4_000 * DAY))).toMatch(/years ago/);
  });
});

describe("credentials arrive packed or discrete", () => {
  /**
   * Read in a subprocess, because `credentials()` reads process.env and this
   * process has a .env loaded — the results would depend on whose machine it is.
   */
  async function resolve(env: Record<string, string>) {
    const proc = Bun.spawn(
      [
        "bun",
        "-e",
        `const { credentials } = await import("./src/stats.ts");
         console.log(JSON.stringify(credentials()));`,
      ],
      {
        env: {
          ...process.env,
          GITHUB_TOKEN: "",
          CF_API_TOKEN: "",
          STATS_CREDENTIALS: "",
          ...env,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, code] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    expect(code).toBe(0);
    return JSON.parse(out) as Record<string, string | undefined>;
  }

  test("one JSON secret carries both, which is how production runs", async () => {
    const resolved = await resolve({
      STATS_CREDENTIALS: JSON.stringify({
        github_token: "gh-packed",
        cloudflare_api_token: "cf-packed",
      }),
    });
    expect(resolved["github_token"]).toBe("gh-packed");
    expect(resolved["cloudflare_api_token"]).toBe("cf-packed");
  });

  test("discrete variables carry both, which is how a laptop runs", async () => {
    const resolved = await resolve({
      GITHUB_TOKEN: "gh-plain",
      CF_API_TOKEN: "cf-plain",
    });
    expect(resolved["github_token"]).toBe("gh-plain");
    expect(resolved["cloudflare_api_token"]).toBe("cf-plain");
  });

  test("a discrete variable overrides the packed one", async () => {
    const resolved = await resolve({
      GITHUB_TOKEN: "wins",
      STATS_CREDENTIALS: JSON.stringify({ github_token: "loses" }),
    });
    expect(resolved["github_token"]).toBe("wins");
  });

  test("a malformed blob is treated as absent, not thrown", async () => {
    // These figures are an enhancement; a stray comma must not take the data
    // route down with it.
    const resolved = await resolve({ STATS_CREDENTIALS: "{not json" });
    expect(resolved["github_token"]).toBeUndefined();
    expect(resolved["cloudflare_api_token"]).toBeUndefined();
  });

  test("nothing set resolves to nothing, which is a supported state", async () => {
    const resolved = await resolve({});
    expect(resolved["github_token"]).toBeUndefined();
    expect(resolved["cloudflare_api_token"]).toBeUndefined();
  });
});

describe("the runtime is told what to count", () => {
  test("the sources file is what the build derived, so the two cannot drift", async () => {
    const content = await loadContent();
    const emitted = await Bun.file("dist/.stats-sources.json").json();
    expect(emitted).toEqual(statsSources(content));
  });

  test("the projects counted are exactly the projects listed", async () => {
    const content = await loadContent();
    const counted = statsSources(content).projects.map(
      (project) => project.repo,
    );
    const listed = content.projects.active
      .map(repoSlug)
      .filter((slug) => slug !== undefined);

    // The whole reason this is derived rather than listed: adding a project to
    // the page cannot leave it uncounted, and removing one cannot leave a
    // request going out for something nobody can see.
    expect(counted).toEqual(listed);
  });

  test("hostnames are qualified with the apex, not left as bare labels", async () => {
    const content = await loadContent();
    const lead = statsSources(content).projects[0];

    expect(lead?.repo).toBe("notion-tmdb");
    expect(lead?.hosts.length).toBe(
      content.projects.active[0]?.subdomains?.length,
    );
    for (const host of lead?.hosts ?? []) {
      expect(host).toEndWith(`.${content.site.hosts.canonical}`);
    }
  });

  test("a project with no service has no hosts to ask about", async () => {
    const content = await loadContent();
    for (const project of statsSources(content).projects.slice(1)) {
      expect(project.hosts).toEqual([]);
    }
  });

  test("it is dot-prefixed, and so is never served", async () => {
    const { handle } = await import("../src/server.ts");
    const response = await handle(
      new Request("https://micheldev.com/.stats-sources.json", {
        headers: { host: "micheldev.com" },
      }),
    );
    expect(response.status).toBe(404);
  });

  test("every packagist entry is vendor-qualified", async () => {
    const { projects } = await loadContent();
    for (const name of projects.stats.packagist) {
      expect(name).toMatch(/^[^/]+\/[^/]+$/);
    }
  });
});

describe("the page is correct before the fetch, and without it", () => {
  test("live tiles carry a handle for the client; fixed ones do not", async () => {
    const home = await Bun.file("dist/index.html").text();
    for (const key of ["downloads", "stars", "repos"]) {
      expect(home).toContain(`data-stat="${key}"`);
    }
    // Counted from projects.yaml and not something a registry knows about.
    expect(home).not.toContain('data-stat="live_services"');
  });

  test("the CV's career figures are never overwritten by registry data", async () => {
    const cv = await Bun.file("dist/cv/index.html").text();
    expect(cv).not.toContain("data-stat");
  });

  test("every tile holds a real figure already, not a placeholder", async () => {
    const home = await Bun.file("dist/index.html").text();
    const { projects } = await loadContent();
    // The floor from the YAML, through the same formatter the client uses.
    expect(home).toContain(
      `>${formatCount(projects.stats.downloads_floor)}</span`,
    );
    expect(home).not.toContain("…");
  });

  test("the ship line is hidden until there is a date to put in it", async () => {
    const home = await Bun.file("dist/index.html").text();
    expect(home).toMatch(/<time[^>]*data-ship[^>]*hidden/);
    expect(home).toMatch(/data-visits[^>]*hidden/);
  });

  test("every project on the page has a slot for its own figures", async () => {
    const home = await Bun.file("dist/index.html").text();
    const content = await loadContent();

    for (const project of content.projects.active) {
      const slug = repoSlug(project);
      expect(slug).toBeDefined();
      expect(home).toContain(`data-project="${slug}"`);
    }
  });

  test("those slots are empty and hidden until the client fills them", async () => {
    const home = await Bun.file("dist/index.html").text();
    // Empty because there is no build-time equivalent — unlike the tiles, which
    // must never be blank. Hidden so the layout does not reserve a line for a
    // figure that may not arrive.
    for (const match of home.matchAll(/<p class="live-stat"[\s\S]*?<\/p>/g)) {
      expect(match[0]).toContain("hidden");
      expect(match[0]).toMatch(/><\/p>$/);
    }
    expect([...home.matchAll(/data-project=/g)].length).toBe(
      (await loadContent()).projects.active.length,
    );
  });
});

describe("the shared cache is what makes this affordable", () => {
  test("a week at the edge, ten minutes in a browser", () => {
    expect(STATS_CACHE_CONTROL).toContain("s-maxage=604800");
    // Far shorter, deliberately: a reader who reloads should not be pinned to
    // their own copy of a figure the edge has already refreshed.
    expect(STATS_CACHE_CONTROL).toContain("max-age=600");
    expect(STATS_CACHE_CONTROL).toContain("public");
  });

  test("expiry is absorbed rather than paid for by a visitor", () => {
    expect(STATS_CACHE_CONTROL).toContain("stale-while-revalidate=");
    expect(STATS_CACHE_CONTROL).toContain("stale-if-error=");
  });
});

type StatsResult = {
  status: number;
  cache: string;
  type: string;
  body: Record<string, unknown>;
};

/**
 * Calls the /stats.json route in a subprocess with a controlled environment.
 *
 * A subprocess because DIST_DIR is read once at module scope and this process
 * has already imported the module.
 */
async function requestStats(env: Record<string, string>): Promise<StatsResult> {
  const proc = Bun.spawn(
    [
      "bun",
      "-e",
      `const { handle } = await import("./src/server.ts");
       const response = await handle(new Request("https://micheldev.com/stats.json", { headers: { host: "micheldev.com" } }));
       console.log(JSON.stringify({
         status: response.status,
         cache: response.headers.get("cache-control"),
         type: response.headers.get("content-type"),
         body: await response.json(),
       }));`,
    ],
    {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  expect(code).toBe(0);
  return JSON.parse(out) as StatsResult;
}

describe("an unreachable source degrades, never fails", () => {
  /**
   * Runs the handler against a dist/ that has the host config but no sources
   * file — the same position the server is in when every upstream is refused, or
   * when an old image meets a new route. A subprocess because DIST_DIR is read
   * once at module scope, and this process has already imported the module.
   */
  test("serves an empty snapshot, and lets the edge retry within a minute", async () => {
    const dir = await mkdtemp(join(tmpdir(), "micheldev-stats-"));
    await Bun.write(
      join(dir, ".hosts.json"),
      JSON.stringify({ canonical: "micheldev.com", redirect: [] }),
    );

    const result = await requestStats({ DIST_DIR: dir });

    // A 200 with nothing in it: the page keeps the figures the build rendered,
    // which is exactly what happens when the request never completes at all.
    expect(result.status).toBe(200);
    expect(result.type).toContain("application/json");
    expect(result.body["at"]).toBeString();
    expect(result.body["downloads"]).toBeUndefined();
    expect(result.body["stars"]).toBeUndefined();

    // The one thing that must not happen is a week-long empty answer.
    expect(result.cache).toBe("public, max-age=60");
    expect(result.cache).not.toContain("604800");
  });
});
