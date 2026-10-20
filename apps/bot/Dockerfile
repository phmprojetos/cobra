# Imagem de produção do bot (contexto de build = raiz do monorepo).
#   docker build -f apps/bot/Dockerfile -t cobra-bot .
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/bot/package.json apps/bot/
RUN pnpm install --frozen-lockfile --filter @cobra/bot...
COPY packages packages
COPY apps/bot apps/bot
# Gera um único bundle ESM com o bot e os pacotes do workspace.
RUN pnpm --filter @cobra/bot build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production BOT_MODO=webhook PORT=8080
COPY --from=build /app/apps/bot/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "--enable-source-maps", "dist/main.js"]
