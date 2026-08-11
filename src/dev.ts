/**
 * Dev server: rebuilds on any change under content/ or src/, then serves dist/
 * through the same handler production uses.
 *
 * Reusing the real handler means redirects, cache headers and 404s behave here
 * exactly as they will on Cloud Run.
 */

import { watch } from "node:fs";
import { build } from "./build.ts";

const PORT = Number(process.env["PORT"] ?? 3000);

async function rebuild(reason: string) {
  const started = Bun.nanoseconds();
  try {
    await build();
    const ms = ((Bun.nanoseconds() - started) / 1e6).toFixed(0);
    console.log(`rebuilt (${reason}) in ${ms}ms`);
  } catch (error) {
    console.error(`build failed (${reason}):`, error);
  }
}

await rebuild("startup");

// The handler reads dist/ per request, so it picks up rebuilds with no restart.
const { handle } = await import("./server.ts");

let pending: ReturnType<typeof setTimeout> | undefined;
for (const dir of ["content", "src"]) {
  watch(dir, { recursive: true }, (_event, filename) => {
    if (filename?.startsWith("client/") === false && filename?.endsWith("~")) {
      return;
    }
    clearTimeout(pending);
    pending = setTimeout(() => rebuild(filename ?? dir), 60);
  });
}

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    // Locally there is no proxy setting Host to the canonical domain, so strip
    // it: otherwise every request would 301 to production.
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.set("host", "localhost");
    return handle(new Request(url, { method: request.method, headers }));
  },
});

console.log(`dev server on http://localhost:${server.port}`);
console.log("watching content/ and src/");
