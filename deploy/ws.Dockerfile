# Colyseus game server — CapRover app `golfcraft-ws` (ws.golfcraftgame.com).
#
# Build context is the REPO ROOT: server/ imports ../../common, ../../lib,
# ../../scene/golfplay and ../../pet-store-service, and the bare deps of those
# shared folders (cross-fetch, jsep, cannon, ts-node) resolve from the root
# node_modules (CLAUDE.md §9 gotcha 1). Node 16 is what the stack is built and
# run against locally; newer Node breaks the older web3/util chain.
# The full (non-slim) image already ships python3, make, g++ and openssl, which
# node-gyp needs for the native deps. Installing them over the slim image
# instead means an apt round trip that breaks whenever the Debian mirror has a
# partial sync (it did, on the first build of this file).
FROM node:16-bullseye

WORKDIR /app

# Root manifest first so the layer is cached: it carries the hoisted deps.
# Dev deps are kept on purpose — ts-node needs typescript at runtime.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund

COPY common ./common
COPY lib ./lib
COPY pet-store-service ./pet-store-service
COPY scene/golfplay ./scene/golfplay
COPY server ./server

# common/constants.ts is a compile-time switch shared by the scene and the
# server; the repo keeps it on `false` for local dev, and production needs the
# real hosts. The grep makes the build fail loudly if the line ever changes.
RUN sed -i 's/export const USE_REMOTE_SERVER = false;/export const USE_REMOTE_SERVER = true;/' common/constants.ts \
 && grep -q 'export const USE_REMOTE_SERVER = true;' common/constants.ts

# PROD picks the production API host and turns on the checks that are bypassed
# in dev. The port is CapRover's default container port.
ENV PROD=true
ENV PORT=80
EXPOSE 80
WORKDIR /app/server

# Same invocation as `npm run prod`, with the port coming from the environment.
CMD ["npx", "ts-node", "--files", "server.ts", "node_modules/cannon/build/cannon.min.js"]
