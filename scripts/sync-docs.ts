/**
 * Copies the README of each project page's latest release into content/docs/.
 *
 * The build reads only what is on disk — tests run it, and they talk to no
 * network — so the README a page is rendered from is fetched here instead, and
 * kept in the repository as a snapshot: content/docs/<name>/README.md, the
 * images it names at their paths in its repository, and release.json.
 *
 * At the latest release's tag, not the default branch: the page documents what
 * `install.sh` installs today, not what is merged and not yet shipped.
 *
 * CI runs this before every deploy from main (`--keep-going`), and a release of
 * nethound or envhound triggers one, so production always shows the newest
 * release; the committed snapshot is what local builds and pull requests use.
 * Run it by hand to see a new release locally: `bun run sync`.
 *
 * `--keep-going` turns a failed project into a warning that keeps its snapshot:
 * GitHub being down should not stop a CV fix from deploying.
 */

import { mkdir, rm } from "node:fs/promises";
import {
  DOCS_DIR,
  type DocsRelease,
  loadContent,
  pageProjects,
} from "../src/content.ts";
import { localImages } from "../src/readme.ts";

const keepGoing = process.argv.includes("--keep-going");
const token = process.env["GITHUB_TOKEN"];

async function get(url: string, json: boolean): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "micheldev.com docs sync",
      ...(json ? { accept: "application/vnd.github+json" } : {}),
      ...(token && url.startsWith("https://api.github.com")
        ? { authorization: `Bearer ${token}` }
        : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return response;
}

async function sync(name: string, repo: string): Promise<string> {
  const slug = new URL(repo).pathname.replace(/^\/|\/$/g, "");
  const latest = (await (
    await get(`https://api.github.com/repos/${slug}/releases/latest`, true)
  ).json()) as { tag_name: string; published_at: string };
  const raw = `https://raw.githubusercontent.com/${slug}/${latest.tag_name}`;

  const readme = await (await get(`${raw}/README.md`, false)).text();
  const images = await Promise.all(
    localImages(readme).map(async (path) => ({
      path,
      bytes: new Uint8Array(
        await (await get(`${raw}/${path}`, false)).arrayBuffer(),
      ),
    })),
  );

  // Everything fetched before anything is written, so a failure halfway
  // leaves the previous snapshot whole.
  const dir = `${DOCS_DIR}/${name}`;
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const release: DocsRelease = {
    tag: latest.tag_name,
    published_at: latest.published_at,
  };
  await Bun.write(
    `${dir}/release.json`,
    `${JSON.stringify(release, null, 2)}\n`,
  );
  await Bun.write(`${dir}/README.md`, readme);
  for (const image of images)
    await Bun.write(`${dir}/${image.path}`, image.bytes);
  return `${latest.tag_name}, ${images.length} image(s)`;
}

const { projects } = await loadContent();
let failed = false;
for (const project of pageProjects(projects)) {
  try {
    console.log(`${project.name}: ${await sync(project.name, project.repo)}`);
  } catch (error) {
    failed = true;
    const message = `${project.name}: ${(error as Error).message}`;
    console.log(
      keepGoing ? `::warning::${message}, keeping the snapshot` : message,
    );
  }
}
if (failed && !keepGoing) process.exit(1);
