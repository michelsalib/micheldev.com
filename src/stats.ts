/**
 * The live figures behind `/stats.json`: downloads, stars, repos, last release.
 *
 * Read from the registries at request time rather than baked into the build, so
 * the numbers move without a deploy. What keeps that affordable is the shared
 * cache — see the route in server.ts — which holds one answer for a week, so a
 * refresh costs a single pass over these APIs every seven days rather than one
 * pass per visitor.
 *
 * This file may not import anything. The runtime image copies it and server.ts
 * and has no node_modules at all (see the Dockerfile), so a single `import` from
 * a package would break the container and nothing else. That also rules out
 * reading content/*.yaml here, which is why the list of things to count arrives
 * as `.stats-sources.json` — emitted by the build, exactly as `.hosts.json` is.
 */

/**
 * One project the homepage lists, and where its figures come from.
 *
 * Derived from `active` in projects.yaml rather than listed separately — see
 * `statsSources` in content.ts. A project named on the page is therefore
 * counted by construction, and one that is removed stops being counted, with no
 * second list to keep in step.
 */
export type ProjectSource = {
  /** Repository slug, which is also the key this project's figures come back under. */
  repo: string;
  /** Hostnames it serves, fully qualified. Empty for anything not hosted here. */
  hosts: string[];
};

/** What to count. Mirrors the `stats` block of content/projects.yaml. */
export type StatsSources = {
  github_user: string;
  npm: string[];
  /** First year the npm packages existed, for the history walk below. */
  npm_since: number;
  /** Packagist names, vendor included. */
  packagist: string[];
  projects: ProjectSource[];
};

export type LastShip = { repo: string; tag: string; at: string };

/**
 * What one project can say about itself.
 *
 * Which fields are present is a fact about the project, not a failure: a hosted
 * service has traffic and no releases, a desktop app has releases and no
 * traffic. The client renders whichever it is given.
 */
export type ProjectStat = {
  /** Latest published release, and when. */
  tag?: string;
  at?: string;
  /** Release asset downloads, all versions. */
  downloads?: number;
  /** Requests served across this project's hostnames in the last 7 days. */
  requests?: number;
};

/**
 * Every field is optional but `at`: a figure that could not be fetched is left
 * out rather than sent as zero, and the page then keeps the build-time value it
 * already rendered. A wrong number is worse than an unchanged one.
 */
export type Stats = {
  /** Lifetime installs across npm, Packagist and GitHub release assets. */
  downloads?: number;
  stars?: number;
  repos?: number;
  last_ship?: LastShip;
  /** Page views over the last 30 days. Absent unless Cloudflare is configured. */
  visits?: number;
  /** Per project, keyed by repository slug. */
  projects?: Record<string, ProjectStat>;
  /** When this snapshot was taken, ISO-8601. */
  at: string;
};

const TIMEOUT_MS = 8_000;
const UA = "micheldev.com-stats (+https://micheldev.com)";

async function getJson<T>(
  url: string,
  headers: Record<string, string> = {},
): Promise<T> {
  const response = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/json", ...headers },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return (await response.json()) as T;
}

// ── Credentials ──────────────────────────────────────────────────────────────

/**
 * The two secrets this file can use. Both optional, independently.
 */
export type Credentials = {
  /** Raises GitHub from 60 requests an hour to 5,000. */
  github_token?: string;
  /** Scoped to Zone > Analytics > Read. Needs CF_ZONE_ID beside it to be useful. */
  cloudflare_api_token?: string;
};

/**
 * Resolved from one packed JSON variable, or from discrete ones.
 *
 * Cloud Run can only project a Secret Manager secret as a single environment
 * variable, so shipping two credentials as two secrets means two secrets, two
 * versions and two IAM bindings on an identity that is meant to hold as little
 * as possible. One secret carrying `{"github_token":…,"cloudflare_api_token":…}`
 * is one of each, and adding a third credential later changes no infrastructure
 * at all.
 *
 * Discrete variables are still read, and win when both are present, because a
 * hand-edited JSON blob is a poor thing to keep in a .env — there the two are
 * just lines. Production sets only STATS_CREDENTIALS; a laptop sets only the
 * plain ones. Neither ever has to know about the other.
 *
 * A malformed blob is treated as absent rather than thrown: the figures it
 * unlocks are an enhancement, and taking the site's data route down over a stray
 * comma would be the wrong trade.
 */
export function credentials(): Credentials {
  let packed: Credentials = {};
  const blob = process.env["STATS_CREDENTIALS"]?.trim();
  if (blob) {
    try {
      packed = JSON.parse(blob) as Credentials;
    } catch {
      packed = {};
    }
  }

  return {
    github_token:
      process.env["GITHUB_TOKEN"]?.trim() || packed.github_token?.trim(),
    cloudflare_api_token:
      process.env["CF_API_TOKEN"]?.trim() ||
      packed.cloudflare_api_token?.trim(),
  };
}

/**
 * Worth having even though a refresh only spends six requests a week: the
 * anonymous limit is counted per source IP, and Cloud Run egress leaves from a
 * pool of addresses shared with other tenants, so the budget is not ours alone
 * to spend. Unset still works, at 60 an hour and somebody else's mercy.
 */
function githubAuth(): Record<string, string> {
  const token = credentials().github_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

// ── Sources ──────────────────────────────────────────────────────────────────

/**
 * Lifetime downloads for one npm package.
 *
 * npm's range endpoint refuses a span longer than 18 months, so the history is
 * walked a calendar year at a time and summed. The years run concurrently. A
 * year still in progress simply returns fewer days, so the current one needs no
 * special case.
 */
async function npmDownloads(pkg: string, since: number): Promise<number> {
  const years: number[] = [];
  for (let year = since; year <= new Date().getUTCFullYear(); year++) {
    years.push(year);
  }

  const totals = await Promise.all(
    years.map(async (year) => {
      const data = await getJson<{ downloads: { downloads: number }[] }>(
        `https://api.npmjs.org/downloads/range/${year}-01-01:${year}-12-31/${pkg}`,
      );
      return data.downloads.reduce((sum, day) => sum + day.downloads, 0);
    }),
  );
  return totals.reduce((sum, n) => sum + n, 0);
}

async function packagistDownloads(name: string): Promise<number> {
  const data = await getJson<{ package: { downloads: { total: number } } }>(
    `https://packagist.org/packages/${name}.json`,
  );
  return data.package.downloads.total;
}

type Release = {
  tag_name: string;
  published_at: string | null;
  assets: { download_count: number }[];
};

/** Asset downloads for one repository, and its most recent published release. */
async function githubReleases(
  user: string,
  repo: string,
): Promise<{ downloads: number; ship?: LastShip }> {
  const releases = await getJson<Release[]>(
    `https://api.github.com/repos/${user}/${repo}/releases?per_page=100`,
    githubAuth(),
  );

  let downloads = 0;
  let ship: LastShip | undefined;
  for (const release of releases) {
    for (const asset of release.assets) downloads += asset.download_count;
    // Drafts have no publication date, and the API does not promise an order
    // that puts the newest first — media-cast returns v1.3.6 behind a later id.
    const at = release.published_at;
    if (at && (!ship || at > ship.at))
      ship = { repo, tag: release.tag_name, at };
  }
  return { downloads, ...(ship ? { ship } : {}) };
}

/**
 * Repository and star counts.
 *
 * `public_repos` off the profile rather than the length of the list below, so
 * the figure keeps meaning what the page has always claimed it means — what
 * GitHub itself shows on the profile, forks included. Stars are summed over
 * non-forks only, because a fork carries its upstream's stars and those are not
 * his to count.
 *
 * One page of 100 covers 51 repositories with room to spare; if that is ever
 * outgrown the star total silently truncates, so revisit it then.
 */
async function githubProfile(
  user: string,
): Promise<{ repos: number; stars: number }> {
  const [profile, repos] = await Promise.all([
    getJson<{ public_repos: number }>(
      `https://api.github.com/users/${user}`,
      githubAuth(),
    ),
    getJson<{ fork: boolean; stargazers_count: number }[]>(
      `https://api.github.com/users/${user}/repos?per_page=100&type=owner`,
      githubAuth(),
    ),
  ]);

  return {
    repos: profile.public_repos,
    stars: repos
      .filter((repo) => !repo.fork)
      .reduce((sum, repo) => sum + repo.stargazers_count, 0),
  };
}

/**
 * Page views over the last 30 days, from Cloudflare's GraphQL analytics.
 *
 * Dormant unless CF_API_TOKEN (scoped to Zone.Analytics:Read) and CF_ZONE_ID are
 * both set — see the README for wiring them through Secret Manager. Page views
 * rather than requests, because requests count every asset on the page.
 *
 * Two caveats worth remembering before quoting the figure: on the free plan the
 * total includes crawlers with no supported way to split them out, and the
 * retention window is plan-specific, so 30 days may return fewer rows than
 * asked for. Summing whatever comes back is correct either way.
 */
/**
 * The zone id travels as a plain variable, not inside the secret: it is an
 * identifier rather than a credential, and keeping it out means the secret holds
 * only things that would actually matter if they leaked.
 */
function cloudflareConfig(): { token: string; zone: string } | undefined {
  const token = credentials().cloudflare_api_token;
  const zone = process.env["CF_ZONE_ID"]?.trim();
  return token && zone ? { token, zone } : undefined;
}

/** One GraphQL round trip. Errors arrive in a 200 body, so status proves nothing. */
async function cloudflareQuery<T>(
  token: string,
  query: string,
  variables: object,
): Promise<T> {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "user-agent": UA,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} from Cloudflare`);

  const body = (await response.json()) as {
    errors?: { message: string }[];
    data?: T;
  };
  if (body.errors?.length) {
    throw new Error(`Cloudflare: ${body.errors[0]?.message}`);
  }
  if (!body.data) throw new Error("Cloudflare returned no data");
  return body.data;
}

const isoDay = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/**
 * Page views across the whole zone over the last 30 days.
 *
 * Dormant unless CF_API_TOKEN (scoped to Zone.Analytics:Read) and CF_ZONE_ID are
 * both set — see the README. Page views rather than requests, because requests
 * count every asset on the page.
 *
 * Two caveats worth remembering before quoting the figure: on the free plan the
 * total includes crawlers with no supported way to split them out, and the
 * retention window is plan-specific, so 30 days may return fewer rows than
 * asked for. Summing whatever comes back is correct either way.
 */
async function cloudflareVisits(): Promise<number | undefined> {
  const config = cloudflareConfig();
  if (!config) return undefined;

  const data = await cloudflareQuery<{
    viewer: {
      zones: { httpRequests1dGroups: { sum: { pageViews: number } }[] }[];
    };
  }>(
    config.token,
    `query($zone:String!,$since:Date!,$until:Date!){
      viewer{zones(filter:{zoneTag:$zone}){
        httpRequests1dGroups(limit:31,filter:{date_geq:$since,date_leq:$until}){
          sum{pageViews}
        }
      }}
    }`,
    { zone: config.zone, since: isoDay(-30), until: isoDay(0) },
  );

  const days = data.viewer.zones[0]?.httpRequests1dGroups ?? [];
  return days.reduce((sum, row) => sum + row.sum.pageViews, 0);
}

/**
 * Requests served by one project's hostnames over the last 7 days.
 *
 * Seven, and not the thirty the zone total uses, because this is a different
 * dataset with different limits. Breaking traffic down by hostname needs
 * `httpRequestsAdaptiveGroups`, and on this plan that one refuses a range wider
 * than a day and retains only about a week. So the week is queried as seven
 * one-day fields aliased into a single request — under the range cap each time,
 * and one round trip rather than seven.
 *
 * Requests, deliberately, not visits. These endpoints are called by Notion and
 * by their own schedules far more than they are opened by a person, and two of
 * the six are backup jobs; counting that as an audience would be a lie. What the
 * number honestly shows is a service doing its job.
 */
async function cloudflareTraffic(hosts: string[]): Promise<number | undefined> {
  const config = cloudflareConfig();
  if (!config || hosts.length === 0) return undefined;

  const days = Array.from({ length: 7 }, (_, i) => i + 1);
  const fields = days
    .map(
      (offset) =>
        `d${offset}: httpRequestsAdaptiveGroups(limit:1,filter:{datetime_geq:"${isoDay(-offset)}T00:00:00Z",datetime_lt:"${isoDay(-offset + 1)}T00:00:00Z",clientRequestHTTPHost_in:${JSON.stringify(hosts)}}){count}`,
    )
    .join(" ");

  const data = await cloudflareQuery<{
    viewer: { zones: Record<string, { count: number }[]>[] };
  }>(
    config.token,
    `query($zone:String!){viewer{zones(filter:{zoneTag:$zone}){${fields}}}}`,
    { zone: config.zone },
  );

  const zone = data.viewer.zones[0];
  if (!zone) return undefined;
  return days.reduce(
    (sum, offset) => sum + (zone[`d${offset}`]?.[0]?.count ?? 0),
    0,
  );
}

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * Adds up settled results, all or nothing.
 *
 * A partial sum is the one genuinely dangerous outcome here: drop npm from the
 * total and the headline falls from 22.6M to 1.5M, which reads as a real
 * collapse rather than as the outage it is. One rejection voids the sum, and the
 * caller then keeps the previous good value.
 */
function sumAll(results: PromiseSettledResult<number>[]): number | undefined {
  let total = 0;
  for (const result of results) {
    if (result.status !== "fulfilled") return undefined;
    total += result.value;
  }
  return total;
}

/** Resolves to undefined instead of rejecting, so one dead source is survivable. */
async function settle<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

/**
 * One pass over every source, concurrently.
 *
 * `previous` is the last good snapshot, and every figure falls back to it rather
 * than vanishing when its source is unreachable. On a cold instance there is no
 * previous, so the figure is left undefined — `JSON.stringify` drops those keys,
 * and the page then keeps whatever the build rendered, which is the floor in
 * projects.yaml.
 */
export async function collectStats(
  sources: StatsSources,
  previous?: Stats,
): Promise<Stats> {
  const [npm, packagist, releases, traffic, counts, seen] = await Promise.all([
    Promise.allSettled(
      sources.npm.map((pkg) => npmDownloads(pkg, sources.npm_since)),
    ),
    Promise.allSettled(sources.packagist.map(packagistDownloads)),
    Promise.all(
      sources.projects.map((project) =>
        settle(githubReleases(sources.github_user, project.repo)),
      ),
    ),
    Promise.all(
      sources.projects.map((project) =>
        settle(cloudflareTraffic(project.hosts)),
      ),
    ),
    settle(githubProfile(sources.github_user)),
    settle(cloudflareVisits()),
  ]);

  const fromNpm = sumAll(npm);
  const fromPackagist = sumAll(packagist);
  const fromReleases = releases.every((release) => release !== undefined)
    ? releases.reduce((sum, release) => sum + release.downloads, 0)
    : undefined;

  const downloads =
    fromNpm !== undefined &&
    fromPackagist !== undefined &&
    fromReleases !== undefined
      ? fromNpm + fromPackagist + fromReleases
      : previous?.downloads;

  // The newest release across every repository that has one.
  let ship: LastShip | undefined;
  for (const release of releases) {
    const candidate = release?.ship;
    if (candidate && (!ship || candidate.at > ship.at)) ship = candidate;
  }

  // Per project, falling back a field at a time: a repository whose releases
  // fetched but whose traffic did not keeps last week's traffic beside this
  // week's version, rather than losing the line entirely.
  const projects: Record<string, ProjectStat> = {};
  sources.projects.forEach((project, i) => {
    const was = previous?.projects?.[project.repo];
    const release = releases[i];
    const stat: ProjectStat = {
      tag: release?.ship?.tag ?? was?.tag,
      at: release?.ship?.at ?? was?.at,
      downloads: release?.downloads ?? was?.downloads,
      requests: traffic[i] ?? was?.requests,
    };
    // A project with nothing to say is left out, so the client can tell the
    // difference between "no data yet" and "this one has no releases".
    if (Object.values(stat).some((value) => value !== undefined)) {
      projects[project.repo] = stat;
    }
  });

  return {
    at: new Date().toISOString(),
    downloads,
    stars: counts?.stars ?? previous?.stars,
    repos: counts?.repos ?? previous?.repos,
    last_ship: ship ?? previous?.last_ship,
    visits: seen ?? previous?.visits,
    projects: Object.keys(projects).length ? projects : previous?.projects,
  };
}
