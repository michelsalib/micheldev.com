# syntax=docker/dockerfile:1.7

# The image is only a file server. `dist/` is built outside — CI runs
# `bun run build && bun run pdf`, because printing the CV needs the Chrome that
# is already on the runner and has no business in a production image.
#
# So this stage copies a finished dist/ and one dependency-free script. No
# install, no bundling, no node_modules: the runtime surface is Bun plus static
# files. Build locally with:
#
#   bun run build && docker build -t micheldev .
FROM oven/bun:1-slim AS runner
WORKDIR /app

# The built site, including the generated PDFs, .hosts.json and
# .stats-sources.json.
COPY dist ./dist

# The server imports one local module and nothing else — no packages, so still
# no install step. Bun runs the TypeScript directly. src/stats.ts is what backs
# /stats.json, and it is dependency-free for exactly this reason: there is no
# node_modules in this image for it to import from.
COPY src/server.ts src/stats.ts ./src/

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Cloud Run sends SIGTERM; Bun exits cleanly, and there is no state to flush.
CMD ["bun", "src/server.ts"]
