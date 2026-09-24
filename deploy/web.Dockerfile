# REST API + admin panel + golfcraftgame.com site — CapRover app `golfcraft-web`.
#
# Same repo-root build context as ws.Dockerfile. This image also needs
# chain-playfab/security (web/server/index.ts imports runChecks from it) and
# web/client/dist, which is the prebuilt site the server serves.
# Non-slim on purpose: it already has python3/make/g++ (argon2, the admin
# passwords) and openssl (Prisma's engines), with no apt step to go stale.
FROM node:16-bullseye

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# adminjs/react peer conflict — the same flag the local install needs.
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --no-audit --no-fund --legacy-peer-deps

COPY common ./common
COPY lib ./lib
COPY chain-playfab/security ./chain-playfab/security
COPY web ./web

# web/server/index.ts imports runChecks from chain-playfab/security, and Node
# resolves that file's bare imports from /app/chain-playfab/node_modules (absent
# here) and then /app/node_modules — not from web/node_modules. `cross-fetch`
# already lives at the root; `isomorphic-fetch` does not, and without it the
# container dies at boot with "Cannot find module 'isomorphic-fetch'".
RUN npm i --no-save --no-audit --no-fund isomorphic-fetch

RUN sed -i 's/export const USE_REMOTE_SERVER = false;/export const USE_REMOTE_SERVER = true;/' common/constants.ts \
 && grep -q 'export const USE_REMOTE_SERVER = true;' common/constants.ts

# The Prisma client is generated from the schema at build time; DATABASE_URL is
# only read at runtime.
RUN cd web && npx prisma generate

ENV PROD=true
ENV PORT=80
EXPOSE 80
WORKDIR /app/web
CMD ["npx", "ts-node", "--files", "./server/index.ts"]
