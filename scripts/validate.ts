/**
 * Validates every file in content/ against its JSON Schema.
 *
 * The schemas already give editor feedback through the yaml-language-server
 * directive at the top of each YAML file; this is the same check in CI, so a bad
 * commit fails the build instead of shipping a half-rendered page.
 *
 * Both have earned their keep already. cv.yaml had an unquoted ": " that turned a
 * list item into a map, and projects.yaml had commas inside flow mappings that
 * silently truncated three archive descriptions into phantom null keys —
 * `additionalProperties: false` catches exactly that.
 */

// The 2020-12 build, matching the $schema the files declare. The default ajv
// entrypoint only knows draft-07 and refuses the meta-schema ref.
import Ajv from "ajv/dist/2020";
import { parse } from "yaml";

const FILES = ["cv", "site", "projects"] as const;

/** Only the shape the extra consistency checks below actually read. */
type CvDoc = {
  experience: {
    employer: string;
    from: number;
    to: number | "present";
    hue?: string;
    roles: unknown[];
  }[];
};

type ProjectsDoc = {
  active: { name: string; live?: boolean; subdomains?: string[] }[];
  archive: { total_repos: number; repos: { name: string; stars: number }[] };
};

// Formats are not validated — ajv needs the ajv-formats package for that, and
// the patterns in the schemas already cover what matters here.
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });

const docs: Record<string, unknown> = {};
let failed = false;

for (const name of FILES) {
  const [schema, doc] = await Promise.all([
    Bun.file(`content/${name}.schema.json`).json(),
    Bun.file(`content/${name}.yaml`)
      .text()
      .then((text) => parse(text)),
  ]);

  const validate = ajv.compile(schema);
  if (!validate(doc)) {
    failed = true;
    console.error(`content/${name}.yaml does not match ${name}.schema.json:`);
    for (const error of validate.errors ?? []) {
      const where = error.instancePath || "/";
      const extra =
        error.keyword === "additionalProperties"
          ? ` (${JSON.stringify(error.params["additionalProperty"])})`
          : "";
      console.error(`  ${where} ${error.message}${extra}`);
    }
    console.error("");
  }
  docs[name] = doc;
}

if (failed) process.exit(1);

// ── Consistency the schemas cannot express ──────────────────────────────────
const problems: string[] = [];

const cv = docs["cv"] as CvDoc;
const projects = docs["projects"] as ProjectsDoc;

const current = cv.experience.filter((job) => job.to === "present");
if (current.length > 1) {
  problems.push(
    `${current.length} entries have "to: present"; only one role can be current`,
  );
}

for (const job of cv.experience) {
  if (typeof job.to === "number" && job.to < job.from) {
    problems.push(
      `${job.employer}: to (${job.to}) is before from (${job.from})`,
    );
  }
}

const hues = cv.experience.map((job) => job.hue).filter(Boolean);
if (new Set(hues).size !== hues.length) {
  problems.push(
    "two employers share the same hue; the timeline bands will merge",
  );
}

// Six hue tokens exist (--w1..--w6). A seventh employer needs another.
if (cv.experience.length > 6) {
  problems.push(
    `${cv.experience.length} employers but only 6 hue tokens — add --w7 to 01-tokens.css`,
  );
}

const listed = projects.archive.repos.length;
if (listed > projects.archive.total_repos) {
  problems.push(
    `archive lists ${listed} repos but total_repos is ${projects.archive.total_repos}`,
  );
}

for (const project of projects.active) {
  if (project.subdomains && !project.live) {
    problems.push(`${project.name}: has subdomains but is not marked live`);
  }
}

if (problems.length > 0) {
  console.error("content/ is schema-valid but inconsistent:\n");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const stars = projects.archive.repos.reduce((n, r) => n + r.stars, 0);
console.log(
  `content/ valid — ${cv.experience.length} employers, ` +
    `${cv.experience.reduce((n, job) => n + job.roles.length, 0)} roles, ` +
    `${projects.active.length} projects, ${stars} stars`,
);
