# Golfclub NFT minter + ERC721 metadata server — CapRover app `golfcraft-chain`.
#
# Not needed for ranked; deploy it when the golfclub minting flow moves over.
# It reads contracts/metadata-server/catalog.json, hence the repo-root context.
# Non-slim: it already carries the node-gyp toolchain (see ws.Dockerfile).
FROM node:16-bullseye

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY chain-playfab/package.json chain-playfab/package-lock.json ./chain-playfab/
RUN cd chain-playfab && npm ci --no-audit --no-fund

COPY common ./common
COPY contracts/metadata-server/catalog.json ./contracts/metadata-server/catalog.json
COPY chain-playfab ./chain-playfab

RUN sed -i 's/export const USE_REMOTE_SERVER = false;/export const USE_REMOTE_SERVER = true;/' common/constants.ts \
 && grep -q 'export const USE_REMOTE_SERVER = true;' common/constants.ts

ENV PROD=true
ENV PORT=80
EXPOSE 80
WORKDIR /app/chain-playfab
CMD ["npx", "ts-node", "--files", "index.ts"]
